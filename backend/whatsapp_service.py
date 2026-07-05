import json
import logging
import os

from utils.helpers import normalize_phone_e164

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
logger = logging.getLogger(__name__)

ORDER_STATUS_TEMPLATE_ENV_VARS = {
    "confirmed": "TWILIO_WHATSAPP_ORDER_CONFIRMED_CONTENT_SID",
    "packed": "TWILIO_WHATSAPP_ORDER_PACKED_CONTENT_SID",
    "shipped": "TWILIO_WHATSAPP_ORDER_SHIPPED_CONTENT_SID",
    "delivered": "TWILIO_WHATSAPP_ORDER_DELIVERED_CONTENT_SID",
}
FEEDBACK_REWARD_TEMPLATE_ENV_VAR = "TWILIO_WHATSAPP_FEEDBACK_REWARD_CONTENT_SID"
CTA_TEMPLATES_ENABLED_ENV_VAR = "TWILIO_WHATSAPP_CTA_TEMPLATES_ENABLED"


def _whatsapp_result(success: bool, sid: str | None = None, error: str | None = None) -> dict:
    return {"success": success, "sid": sid, "error": error}


def _twilio_debug_enabled() -> bool:
    return os.getenv("TWILIO_DEBUG", "false").strip().lower() == "true"


def _format_whatsapp_sender(from_number: str) -> str:
    raw_from = str(from_number or "").strip()
    sender_number = raw_from.removeprefix("whatsapp:")
    normalized_sender = normalize_phone_e164(sender_number)
    if not normalized_sender:
        logger.warning("WhatsApp skipped: invalid sender phone format")
        return ""

    whatsapp_from = f"whatsapp:{normalized_sender}"
    if not whatsapp_from.startswith("whatsapp:+91"):
        logger.warning("WhatsApp sender does not match expected +91 format: from=%s", whatsapp_from)
    return whatsapp_from


def _json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _twilio_exception_response_payload(exc: Exception):
    response = getattr(exc, "response", None)
    if response is None:
        return None

    payload = getattr(response, "text", None)
    if payload:
        try:
            return json.loads(payload)
        except (TypeError, ValueError):
            return payload

    try:
        return response.json()
    except Exception:
        return None


def _log_twilio_rest_exception(prefix: str, exc: Exception) -> None:
    response_payload = _twilio_exception_response_payload(exc)
    logger.warning(
        "%s: code=%s status=%s message=%s uri=%s response=%s",
        prefix,
        getattr(exc, "code", None),
        getattr(exc, "status", None),
        getattr(exc, "msg", None) or getattr(exc, "message", None),
        getattr(exc, "uri", None),
        response_payload,
    )


def _cta_templates_enabled() -> bool:
    return os.getenv(CTA_TEMPLATES_ENABLED_ENV_VAR, "false").strip().lower() == "true"


def _order_status_content_variables(
    customer_name: str,
    order_short_id: str,
    tracking_token: str,
) -> dict:
    content_variables = {
        "1": customer_name,
        "2": order_short_id,
    }

    if _cta_templates_enabled():
        # Twilio ContentVariables is a single flat map across body and button fields.
        # CTA templates should use {{3}} in the URL path for the tracking token.
        if not tracking_token:
            logger.warning("WhatsApp CTA order status template has empty tracking token")
        elif tracking_token.startswith(("http://", "https://")):
            logger.warning("WhatsApp CTA order status template received URL instead of raw tracking token")
        content_variables["3"] = tracking_token
    else:
        content_variables["3"] = f"{FRONTEND_URL.rstrip('/')}/track-order/{tracking_token}"

    return content_variables


def _feedback_reward_content_variables(
    customer_name: str,
    order_short_id: str,
    order_id: str | None,
    feedback_token: str,
) -> dict:
    content_variables = {
        "1": customer_name,
        "2": order_short_id,
    }

    if _cta_templates_enabled():
        # CTA templates should use {{3}} in the URL path for the feedback token.
        if not feedback_token:
            logger.warning("WhatsApp CTA feedback template has empty feedback token")
        elif feedback_token.startswith(("http://", "https://")):
            logger.warning("WhatsApp CTA feedback template received URL instead of raw feedback token")
        content_variables["3"] = feedback_token
    else:
        content_variables["3"] = (
            f"{FRONTEND_URL.rstrip('/')}/feedback/{feedback_token}"
            if feedback_token
            else f"{FRONTEND_URL.rstrip('/')}/account/orders/{order_id}"
        )

    return content_variables


def send_whatsapp(to_number: str, message: str):
    if os.getenv("TWILIO_WHATSAPP_ENABLED", "false").strip().lower() != "true":
        logger.info("WhatsApp skipped: TWILIO_WHATSAPP_ENABLED is false")
        return _whatsapp_result(False, error="disabled")

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "").strip()

    if not account_sid or not auth_token or not from_number:
        logger.warning("WhatsApp skipped: missing Twilio WhatsApp configuration")
        return _whatsapp_result(False, error="missing_configuration")

    normalized_to = normalize_phone_e164(to_number)
    if not normalized_to:
        logger.warning("WhatsApp skipped: invalid recipient phone")
        return _whatsapp_result(False, error="invalid_recipient")

    whatsapp_from = _format_whatsapp_sender(from_number)
    if not whatsapp_from:
        return _whatsapp_result(False, error="invalid_sender")
    whatsapp_to = f"whatsapp:{normalized_to}"
    request_payload = {
        "body": message,
        "from_": whatsapp_from,
        "to": whatsapp_to,
    }

    logger.info("WhatsApp send request: from=%s to=%s", whatsapp_from, whatsapp_to)
    if _twilio_debug_enabled():
        logger.info("TWILIO_DEBUG WhatsApp request payload: %s", _json_dumps(request_payload))

    try:
        from twilio.base.exceptions import TwilioRestException
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        msg = client.messages.create(**request_payload)
        logger.info("WhatsApp sent successfully: sid=%s", msg.sid)
        return _whatsapp_result(True, sid=msg.sid)
    except ImportError:
        logger.exception("WhatsApp failed: Twilio package import failed")
        return _whatsapp_result(False, error="twilio_import_failed")
    except TwilioRestException as e:
        _log_twilio_rest_exception("WhatsApp failed", e)
        return _whatsapp_result(False, error="twilio_send_failed")
    except Exception as e:
        logger.exception("WhatsApp failed unexpectedly: %s", e.__class__.__name__)
        return _whatsapp_result(False, error="twilio_send_failed")


def send_whatsapp_template(to_number: str, content_sid: str, content_variables: dict):
    if os.getenv("TWILIO_WHATSAPP_ENABLED", "false").strip().lower() != "true":
        logger.info("WhatsApp skipped: TWILIO_WHATSAPP_ENABLED is false")
        return _whatsapp_result(False, error="disabled")

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "").strip()
    content_sid = str(content_sid or "").strip()

    if not account_sid or not auth_token or not from_number:
        logger.warning("WhatsApp skipped: missing Twilio WhatsApp configuration")
        return _whatsapp_result(False, error="missing_configuration")

    if not content_sid:
        logger.warning("WhatsApp skipped: missing template content SID")
        return _whatsapp_result(False, error="missing_content_sid")

    normalized_to = normalize_phone_e164(to_number)
    if not normalized_to:
        logger.warning("WhatsApp skipped: invalid recipient phone")
        return _whatsapp_result(False, error="invalid_recipient")

    whatsapp_from = _format_whatsapp_sender(from_number)
    if not whatsapp_from:
        return _whatsapp_result(False, error="invalid_sender")
    whatsapp_to = f"whatsapp:{normalized_to}"
    content_variables_json = _json_dumps(content_variables)
    request_payload = {
        "from_": whatsapp_from,
        "to": whatsapp_to,
        "content_sid": content_sid,
        "content_variables": content_variables_json,
    }

    logger.info(
        "WhatsApp template send request: content_sid=%s from=%s to=%s content_variables=%s",
        content_sid,
        whatsapp_from,
        whatsapp_to,
        content_variables_json,
    )
    if _twilio_debug_enabled():
        logger.info("TWILIO_DEBUG WhatsApp template request payload: %s", _json_dumps(request_payload))

    try:
        from twilio.base.exceptions import TwilioRestException
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        msg = client.messages.create(**request_payload)
        logger.info("WhatsApp template sent successfully: sid=%s", msg.sid)
        return _whatsapp_result(True, sid=msg.sid)
    except ImportError:
        logger.exception("WhatsApp failed: Twilio package import failed")
        return _whatsapp_result(False, error="twilio_import_failed")
    except TwilioRestException as e:
        _log_twilio_rest_exception("WhatsApp template failed", e)
        return _whatsapp_result(False, error="twilio_template_send_failed")
    except Exception as e:
        logger.exception("WhatsApp template failed unexpectedly: %s", e.__class__.__name__)
        return _whatsapp_result(False, error="twilio_template_send_failed")


def send_order_status_whatsapp(order: dict):
    phone = order.get("billing_phone")
    if not phone:
        logger.info("WhatsApp skipped: missing billing_phone")
        return _whatsapp_result(False, error="missing_recipient")

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order.get("id", ""))[:8].upper()
    status_key = str(order.get("status", "")).strip().lower()
    tracking_token = str(order.get("tracking_token") or "").strip()
    template_env_var = ORDER_STATUS_TEMPLATE_ENV_VARS.get(status_key)
    content_sid = os.getenv(template_env_var, "").strip() if template_env_var else ""

    logger.info(
        "WhatsApp order status template lookup: status_key=%s template_found=%s",
        status_key or "<empty>",
        bool(content_sid),
    )

    if not template_env_var:
        logger.info("WhatsApp skipped: template not configured for status_key=%s", status_key)
        return _whatsapp_result(False, error="template_not_configured_for_status")

    if not content_sid:
        logger.warning("WhatsApp skipped: missing order status template content SID for status_key=%s", status_key)
        return _whatsapp_result(False, error="missing_order_status_template_sid")

    return send_whatsapp_template(
        phone,
        content_sid,
        _order_status_content_variables(customer_name, order_short_id, tracking_token),
    )


def send_feedback_reward_whatsapp(order: dict):
    order_id = order.get("id")
    phone = order.get("billing_phone")
    content_sid = os.getenv(FEEDBACK_REWARD_TEMPLATE_ENV_VAR, "").strip()
    logger.info(
        "WhatsApp feedback reward lookup: order_id=%s recipient_present=%s template_found=%s",
        order_id,
        bool(phone),
        bool(content_sid),
    )

    if not phone:
        logger.info("WhatsApp feedback reward skipped: missing billing_phone order_id=%s", order_id)
        return _whatsapp_result(False, error="missing_recipient")

    if not content_sid:
        logger.warning("WhatsApp feedback reward skipped: missing template content SID order_id=%s", order_id)
        return _whatsapp_result(False, error="missing_feedback_reward_template_sid")

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order_id or "")[:8].upper()
    feedback_token = str(order.get("feedback_token") or "").strip()

    # Legacy templates use {{3}} as a full feedback link. CTA templates use {{3}}
    # as the feedback token path segment in the URL button.
    result = send_whatsapp_template(
        phone,
        content_sid,
        _feedback_reward_content_variables(customer_name, order_short_id, order_id, feedback_token),
    )
    if result.get("success"):
        logger.info("WhatsApp feedback reward sent: order_id=%s", order_id)
    else:
        logger.info(
            "WhatsApp feedback reward skipped: order_id=%s error=%s",
            order_id,
            result.get("error"),
        )
    return result
