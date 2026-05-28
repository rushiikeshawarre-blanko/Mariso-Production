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


def _whatsapp_result(success: bool, sid: str | None = None, error: str | None = None) -> dict:
    return {"success": success, "sid": sid, "error": error}


def _log_twilio_rest_exception(prefix: str, exc: Exception) -> None:
    logger.warning(
        "%s: code=%s status=%s message=%s uri=%s",
        prefix,
        getattr(exc, "code", None),
        getattr(exc, "status", None),
        getattr(exc, "msg", None) or getattr(exc, "message", None),
        getattr(exc, "uri", None),
    )


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

    whatsapp_from = from_number if from_number.startswith("whatsapp:") else f"whatsapp:{from_number}"
    whatsapp_to = f"whatsapp:{normalized_to}"

    try:
        from twilio.base.exceptions import TwilioRestException
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        msg = client.messages.create(
            body=message,
            from_=whatsapp_from,
            to=whatsapp_to,
        )
        logger.info("WhatsApp sent successfully: sid=%s", msg.sid)
        return _whatsapp_result(True, sid=msg.sid)
    except ImportError:
        logger.exception("WhatsApp failed: Twilio package import failed")
        return _whatsapp_result(False, error="twilio_import_failed")
    except TwilioRestException as e:
        _log_twilio_rest_exception("WhatsApp failed", e)
        return _whatsapp_result(False, error="twilio_send_failed")
    except Exception as e:
        logger.warning("WhatsApp failed: %s", e.__class__.__name__)
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

    whatsapp_from = from_number if from_number.startswith("whatsapp:") else f"whatsapp:{from_number}"
    whatsapp_to = f"whatsapp:{normalized_to}"

    try:
        from twilio.base.exceptions import TwilioRestException
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        msg = client.messages.create(
            from_=whatsapp_from,
            to=whatsapp_to,
            content_sid=content_sid,
            content_variables=json.dumps(content_variables),
        )
        logger.info("WhatsApp template sent successfully: sid=%s", msg.sid)
        return _whatsapp_result(True, sid=msg.sid)
    except ImportError:
        logger.exception("WhatsApp failed: Twilio package import failed")
        return _whatsapp_result(False, error="twilio_import_failed")
    except TwilioRestException as e:
        _log_twilio_rest_exception("WhatsApp template failed", e)
        return _whatsapp_result(False, error="twilio_template_send_failed")
    except Exception as e:
        logger.warning("WhatsApp template failed: %s", e.__class__.__name__)
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

    order_link = f"{FRONTEND_URL.rstrip('/')}/track-order/{tracking_token}"
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
        {
            "1": customer_name,
            "2": order_short_id,
            "3": order_link,
        },
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
    feedback_link = (
        f"{FRONTEND_URL.rstrip('/')}/feedback/{feedback_token}"
        if feedback_token
        else f"{FRONTEND_URL.rstrip('/')}/account/orders/{order_id}"
    )

    # Assumes feedback_reward has {{1}} name, {{2}} short order id, and {{3}} feedback link.
    result = send_whatsapp_template(
        phone,
        content_sid,
        {
            "1": customer_name,
            "2": order_short_id,
            "3": feedback_link,
        },
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
