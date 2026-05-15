from typing import Optional
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
    return CASHFREE_WEBHOOK_SECRET or CASHFREE_CLIENT_SECRET


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

    return {
        "event_type": payload.get("type"),
        "order_id": order.get("order_id"),
        "cf_payment_id": payment.get("cf_payment_id"),
        "payment_status": payment.get("payment_status"),
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


def _raise_cashfree_error(response: requests.Response) -> None:
    try:
        error_body = response.json()
    except ValueError:
        error_body = {"message": response.text[:500]}

    logger.warning(
        "Cashfree create order failed with status %s",
        response.status_code,
    )
    raise HTTPException(
        status_code=502,
        detail={
            "message": "Cashfree create order failed",
            "cashfree_status_code": response.status_code,
            "cashfree_error": error_body,
        },
    )


def create_cashfree_order_session(
    order_id: str,
    order_amount: float,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
) -> dict:
    idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mariso:cashfree:create-order:{order_id}"))
    headers = _build_cashfree_headers(idempotency_key)
    payload = _build_cashfree_order_payload(
        order_id=order_id,
        order_amount=order_amount,
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=customer_phone,
    )

    try:
        response = requests.post(
            f"{CASHFREE_BASE_URL}/orders",
            json=payload,
            headers=headers,
            timeout=CASHFREE_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.warning("Cashfree create order timed out for order_id=%s", order_id)
        raise HTTPException(status_code=504, detail="Cashfree create order timed out")
    except requests.RequestException:
        logger.exception("Cashfree create order request failed for order_id=%s", order_id)
        raise HTTPException(status_code=502, detail="Cashfree create order request failed")

    if response.status_code >= 400:
        _raise_cashfree_error(response)

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Cashfree returned an invalid JSON response")

    normalized = _normalize_cashfree_order_response(data)
    if not normalized.get("payment_session_id"):
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
        _raise_cashfree_error(response)

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Cashfree returned an invalid JSON response")

    return _normalize_cashfree_get_order_response(data)
