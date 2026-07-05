from typing import Any, Optional
import base64
import hashlib
import hmac
import logging
import uuid

from fastapi import HTTPException
import requests

from core.config import (
    CASHFREE_API_VERSION,
    CASHFREE_BASE_URL,
    CASHFREE_CLIENT_ID,
    CASHFREE_CLIENT_SECRET,
    CASHFREE_ENABLED,
    CASHFREE_RETURN_URL,
    CASHFREE_WEBHOOK_SECRET,
    CASHFREE_WEBHOOK_URL,
)

logger = logging.getLogger(__name__)

CASHFREE_TIMEOUT_SECONDS = 15
SENSITIVE_LOG_KEY_PARTS = (
    "authorization",
    "client_secret",
    "secret",
    "token",
    "payment_session_id",
    "session_id",
)


def _get_header(headers: dict, name: str) -> Optional[str]:
    if hasattr(headers, "get"):
        value = headers.get(name) or headers.get(name.lower()) or headers.get(name.upper())
        if value:
            return value
    for key, value in dict(headers).items():
        if key.lower() == name.lower():
            return value
    return None


def _get_cashfree_webhook_secret() -> str:
    # A webhook signing secret is distinct from the API client secret. Falling
    # back to the latter makes an unset development webhook secret reject every
    # Cashfree test callback.
    return CASHFREE_WEBHOOK_SECRET


def _log_cashfree_webhook_signature_failure(
    raw_body: bytes,
    headers: dict,
    secret: str,
    signature: Optional[str],
    timestamp: Optional[str],
) -> None:
    logger.warning(
        "Cashfree webhook signature verification failed: "
        "signature_present=%s timestamp_present=%s webhook_version=%s "
        "webhook_attempt=%s raw_body_length=%s webhook_secret_length=%s",
        bool(signature),
        bool(timestamp),
        _get_header(headers, "x-webhook-version"),
        _get_header(headers, "x-webhook-attempt"),
        len(raw_body),
        len(secret),
    )


def _build_cashfree_headers(idempotency_key: str) -> dict:
    if not CASHFREE_ENABLED:
        raise HTTPException(status_code=503, detail="Cashfree payments are disabled")

    if not CASHFREE_CLIENT_ID or not CASHFREE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Cashfree credentials are not configured")

    return {
        "Content-Type": "application/json",
        "x-api-version": CASHFREE_API_VERSION,
        "x-client-id": CASHFREE_CLIENT_ID,
        "x-client-secret": CASHFREE_CLIENT_SECRET,
        "x-idempotency-key": idempotency_key,
    }


def verify_cashfree_webhook_signature(raw_body: bytes, headers: dict) -> bool:
    secret = _get_cashfree_webhook_secret()
    signature = _get_header(headers, "x-webhook-signature")
    timestamp = _get_header(headers, "x-webhook-timestamp")

    if not secret:
        logger.warning(
            "Cashfree webhook signature validation skipped: CASHFREE_WEBHOOK_SECRET is not configured"
        )
        return True

    if not secret or not signature or not timestamp:
        _log_cashfree_webhook_signature_failure(raw_body, headers, secret, signature, timestamp)
        return False

    message = timestamp.encode("utf-8") + raw_body
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    computed_signature = base64.b64encode(digest).decode("utf-8")
    verified = hmac.compare_digest(computed_signature, signature)
    if not verified:
        _log_cashfree_webhook_signature_failure(
            raw_body,
            headers,
            secret,
            signature,
            timestamp,
        )
    return verified


def normalize_cashfree_webhook_payload(payload: dict, headers: dict) -> dict:
    if not isinstance(payload, dict):
        payload = {}

    data = payload.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    refund = data.get("refund") or data.get("refunds") or {}
    if isinstance(refund, dict):
        refund_source = refund
    elif isinstance(refund, list):
        refund_source = next((item for item in refund if isinstance(item, dict)), {})
    else:
        refund_source = data

    return {
        "event_type": payload.get("type") or payload.get("event_type") or payload.get("event"),
        "order_id": (
            order.get("order_id")
            or refund_source.get("order_id")
            or refund_source.get("cf_order_id")
            or data.get("order_id")
            or payload.get("order_id")
        ),
        "cf_payment_id": payment.get("cf_payment_id"),
        "payment_status": payment.get("payment_status"),
        "refund_id": refund_source.get("refund_id") or data.get("refund_id") or payload.get("refund_id"),
        "cf_refund_id": refund_source.get("cf_refund_id") or data.get("cf_refund_id") or payload.get("cf_refund_id"),
        "refund_status": (
            refund_source.get("refund_status")
            or refund_source.get("status")
            or data.get("refund_status")
            or payload.get("refund_status")
        ),
        "refund_failed_reason": (
            refund_source.get("status_description")
            or refund_source.get("refund_message")
            or refund_source.get("failure_reason")
            or data.get("status_description")
            or data.get("refund_message")
        ),
        "event_time": payload.get("event_time"),
        "webhook_version": _get_header(headers, "x-webhook-version"),
        "webhook_attempt": _get_header(headers, "x-webhook-attempt"),
        "idempotency_key": _get_header(headers, "x-idempotency-key"),
    }


def _format_return_url(order_id: str) -> Optional[str]:
    if not CASHFREE_RETURN_URL:
        return None
    return CASHFREE_RETURN_URL.replace("{order_id}", order_id)


def _build_cashfree_order_payload(
    order_id: str,
    order_amount: float,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    order_expiry_time: Optional[str] = None,
) -> dict:
    payload = {
        "order_id": order_id,
        "order_amount": order_amount,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": order_id,
            "customer_name": customer_name,
            "customer_email": customer_email,
            "customer_phone": customer_phone,
        },
    }
    if order_expiry_time:
        payload["order_expiry_time"] = order_expiry_time

    order_meta = {}
    return_url = _format_return_url(order_id)
    if return_url:
        order_meta["return_url"] = return_url
    if CASHFREE_WEBHOOK_URL:
        order_meta["notify_url"] = CASHFREE_WEBHOOK_URL
    if order_meta:
        payload["order_meta"] = order_meta

    return payload


def _normalize_cashfree_order_response(data: dict) -> dict:
    return {
        "payment_session_id": data.get("payment_session_id"),
        "cashfree_order_id": data.get("order_id"),
        "order_id": data.get("order_id"),
        "cashfree_cf_order_id": data.get("cf_order_id"),
        "cf_order_id": data.get("cf_order_id"),
        "cashfree_order_status": data.get("order_status"),
        "order_status": data.get("order_status"),
    }


def _normalize_cashfree_get_order_response(data: dict) -> dict:
    return {
        "cashfree_order_id": data.get("order_id"),
        "order_id": data.get("order_id"),
        "cashfree_cf_order_id": data.get("cf_order_id"),
        "cf_order_id": data.get("cf_order_id"),
        "cashfree_order_status": data.get("order_status"),
        "order_status": data.get("order_status"),
        "cashfree_payment_status": data.get("payment_status"),
        "payment_status": data.get("payment_status"),
    }


def _extract_cashfree_refund_source(data: Any) -> dict:
    if not isinstance(data, dict):
        return {}
    if any(key in data for key in ("refund_id", "cf_refund_id", "refund_status", "status")):
        return data

    nested_data = data.get("data")
    if isinstance(nested_data, dict):
        if any(key in nested_data for key in ("refund_id", "cf_refund_id", "refund_status", "status")):
            return nested_data
        for key in ("refund", "refunds"):
            nested_refund = nested_data.get(key)
            if isinstance(nested_refund, dict):
                return nested_refund
            if isinstance(nested_refund, list) and nested_refund:
                return next((item for item in nested_refund if isinstance(item, dict)), {})
    if isinstance(nested_data, list) and nested_data:
        return next((item for item in nested_data if isinstance(item, dict)), {})

    for key in ("refund", "refunds"):
        nested_refund = data.get(key)
        if isinstance(nested_refund, dict):
            return nested_refund
        if isinstance(nested_refund, list) and nested_refund:
            return next((item for item in nested_refund if isinstance(item, dict)), {})
    return data


def _cashfree_refund_response_debug(data: Any) -> dict:
    source = _extract_cashfree_refund_source(data)
    nested_data = data.get("data") if isinstance(data, dict) else None
    refund_items = []
    if isinstance(nested_data, list):
        refund_items = [item for item in nested_data if isinstance(item, dict)]
    elif isinstance(nested_data, dict):
        for key in ("refunds", "refund"):
            nested_refund = nested_data.get(key)
            if isinstance(nested_refund, list):
                refund_items = [item for item in nested_refund if isinstance(item, dict)]
                break
    return {
        "response_keys": sorted(str(key) for key in data.keys()) if isinstance(data, dict) else [],
        "data_keys": sorted(str(key) for key in nested_data.keys()) if isinstance(nested_data, dict) else [],
        "refund_item_count": len(refund_items),
        "raw_refund_status": source.get("refund_status"),
        "raw_status": source.get("status"),
        "response_refund_id": source.get("refund_id"),
        "response_cf_refund_id": source.get("cf_refund_id"),
    }


def _log_cashfree_refund_response(operation: str, order_id: str, refund_id: str, data: Any) -> None:
    debug = _cashfree_refund_response_debug(data)
    logger.info(
        "Cashfree %s refund response: order_id=%s refund_id=%s response_keys=%s "
        "data_keys=%s refund_item_count=%s response_refund_id=%s response_cf_refund_id=%s "
        "raw_refund_status=%s raw_status=%s",
        operation,
        order_id,
        refund_id,
        debug["response_keys"],
        debug["data_keys"],
        debug["refund_item_count"],
        debug["response_refund_id"],
        debug["response_cf_refund_id"],
        debug["raw_refund_status"],
        debug["raw_status"],
    )


def _normalize_cashfree_refund_response(data: dict) -> dict:
    source = _extract_cashfree_refund_source(data)
    debug = _cashfree_refund_response_debug(data)
    return {
        "refund_id": source.get("refund_id"),
        "cf_refund_id": source.get("cf_refund_id"),
        "refund_status": source.get("refund_status") or source.get("status"),
        "refund_amount": source.get("refund_amount"),
        "refund_note": source.get("refund_note"),
        "refund_arn": source.get("refund_arn"),
        "status_description": source.get("status_description") or source.get("refund_message"),
        "_cashfree_response_keys": debug["response_keys"],
        "_cashfree_data_keys": debug["data_keys"],
        "_cashfree_refund_item_count": debug["refund_item_count"],
        "_cashfree_raw_refund_status": debug["raw_refund_status"],
        "_cashfree_raw_status": debug["raw_status"],
    }


def _sanitize_for_log(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if any(part in key_text for part in SENSITIVE_LOG_KEY_PARTS):
                sanitized[key] = "[redacted]"
            else:
                sanitized[key] = _sanitize_for_log(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_for_log(item) for item in value]
    if isinstance(value, str):
        return value[:500]
    return value


def _extract_cashfree_error_fields(error_body: Any) -> tuple[Optional[str], Optional[str]]:
    if not isinstance(error_body, dict):
        return None, None

    error_code = (
        error_body.get("code")
        or error_body.get("error_code")
        or error_body.get("type")
    )
    error_message = (
        error_body.get("message")
        or error_body.get("error")
        or error_body.get("error_description")
    )
    return error_code, error_message


def _raise_cashfree_error(
    response: requests.Response,
    *,
    order_id: str,
    order_amount: Optional[float] = None,
    operation: str = "create order",
) -> None:
    try:
        error_body = response.json()
    except ValueError:
        error_body = {"message": response.text[:500]}

    safe_error_body = _sanitize_for_log(error_body)
    error_code, error_message = _extract_cashfree_error_fields(safe_error_body)
    logger.warning(
        "Cashfree %s failed: order_id=%s order_amount=%s cashfree_status_code=%s "
        "cashfree_error_code=%s cashfree_error_message=%s cashfree_error=%s exception_type=%s",
        operation,
        order_id,
        order_amount,
        response.status_code,
        error_code,
        error_message,
        safe_error_body,
        "CashfreeHTTPError",
    )
    raise HTTPException(
        status_code=502,
        detail={
            "message": f"Cashfree {operation} failed",
            "cashfree_status_code": response.status_code,
            "cashfree_error_code": error_code,
            "cashfree_error_message": error_message,
            "cashfree_error": safe_error_body,
        },
    )


def create_cashfree_order_session(
    order_id: str,
    order_amount: float,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    order_expiry_time: Optional[str] = None,
) -> dict:
    idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mariso:cashfree:create-order:{order_id}"))
    headers = _build_cashfree_headers(idempotency_key)
    rounded_order_amount = round(float(order_amount or 0), 2)
    payload = _build_cashfree_order_payload(
        order_id=order_id,
        order_amount=rounded_order_amount,
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=customer_phone,
        order_expiry_time=order_expiry_time,
    )

    try:
        response = requests.post(
            f"{CASHFREE_BASE_URL}/orders",
            json=payload,
            headers=headers,
            timeout=CASHFREE_TIMEOUT_SECONDS,
        )
    except requests.Timeout as exc:
        logger.warning(
            "Cashfree create order timed out: order_id=%s order_amount=%s exception_type=%s",
            order_id,
            rounded_order_amount,
            type(exc).__name__,
        )
        raise HTTPException(status_code=504, detail="Cashfree create order timed out")
    except requests.RequestException as exc:
        logger.exception(
            "Cashfree create order request failed: order_id=%s order_amount=%s exception_type=%s",
            order_id,
            rounded_order_amount,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Cashfree create order request failed")

    if response.status_code >= 400:
        _raise_cashfree_error(
            response,
            order_id=order_id,
            order_amount=rounded_order_amount,
        )

    try:
        data = response.json()
    except ValueError:
        logger.warning(
            "Cashfree create order returned invalid JSON: order_id=%s order_amount=%s "
            "cashfree_status_code=%s exception_type=%s",
            order_id,
            rounded_order_amount,
            response.status_code,
            "ValueError",
        )
        raise HTTPException(status_code=502, detail="Cashfree returned an invalid JSON response")

    normalized = _normalize_cashfree_order_response(data)
    if not normalized.get("payment_session_id"):
        logger.warning(
            "Cashfree create order response missing payment_session_id: order_id=%s order_amount=%s "
            "cashfree_status_code=%s cashfree_order_status=%s response_keys=%s exception_type=%s",
            order_id,
            rounded_order_amount,
            response.status_code,
            normalized.get("cashfree_order_status"),
            sorted(data.keys()) if isinstance(data, dict) else None,
            "MissingPaymentSessionId",
        )
        raise HTTPException(status_code=502, detail="Cashfree response missing payment_session_id")

    return normalized


def get_cashfree_order(order_id: str) -> dict:
    idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mariso:cashfree:get-order:{order_id}"))
    headers = _build_cashfree_headers(idempotency_key)

    try:
        response = requests.get(
            f"{CASHFREE_BASE_URL}/orders/{order_id}",
            headers=headers,
            timeout=CASHFREE_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.warning("Cashfree get order timed out for order_id=%s", order_id)
        raise HTTPException(status_code=504, detail="Cashfree get order timed out")
    except requests.RequestException:
        logger.exception("Cashfree get order request failed for order_id=%s", order_id)
        raise HTTPException(status_code=502, detail="Cashfree get order request failed")

    if response.status_code >= 400:
        _raise_cashfree_error(
            response,
            order_id=order_id,
            operation="get order",
        )

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Cashfree returned an invalid JSON response")

    return _normalize_cashfree_get_order_response(data)


def create_cashfree_refund(order_id: str, refund_id: str, amount: float, note: str) -> dict:
    idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mariso:cashfree:create-refund:{refund_id}"))
    headers = _build_cashfree_headers(idempotency_key)
    rounded_amount = round(float(amount or 0), 2)
    payload = {
        "refund_amount": rounded_amount,
        "refund_id": refund_id,
        "refund_note": note,
        "refund_speed": "STANDARD",
    }

    try:
        response = requests.post(
            f"{CASHFREE_BASE_URL}/orders/{order_id}/refunds",
            json=payload,
            headers=headers,
            timeout=CASHFREE_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.warning("Cashfree create refund timed out for order_id=%s refund_id=%s", order_id, refund_id)
        raise HTTPException(status_code=504, detail="Cashfree create refund timed out")
    except requests.RequestException:
        logger.exception("Cashfree create refund request failed for order_id=%s refund_id=%s", order_id, refund_id)
        raise HTTPException(status_code=502, detail="Cashfree create refund request failed")

    if response.status_code >= 400:
        _raise_cashfree_error(
            response,
            order_id=order_id,
            order_amount=rounded_amount,
            operation="create refund",
        )

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Cashfree returned an invalid JSON response")

    _log_cashfree_refund_response("create", order_id, refund_id, data)
    return _normalize_cashfree_refund_response(data)


def get_cashfree_refund(order_id: str, refund_id: str) -> dict:
    idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mariso:cashfree:get-refund:{refund_id}"))
    headers = _build_cashfree_headers(idempotency_key)

    try:
        response = requests.get(
            f"{CASHFREE_BASE_URL}/orders/{order_id}/refunds/{refund_id}",
            headers=headers,
            timeout=CASHFREE_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.warning("Cashfree get refund timed out for order_id=%s refund_id=%s", order_id, refund_id)
        raise HTTPException(status_code=504, detail="Cashfree get refund timed out")
    except requests.RequestException:
        logger.exception("Cashfree get refund request failed for order_id=%s refund_id=%s", order_id, refund_id)
        raise HTTPException(status_code=502, detail="Cashfree get refund request failed")

    if response.status_code >= 400:
        _raise_cashfree_error(response, order_id=order_id, operation="get refund")

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Cashfree returned an invalid JSON response")

    _log_cashfree_refund_response("get", order_id, refund_id, data)
    return _normalize_cashfree_refund_response(data)
