from typing import Optional
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
    CASHFREE_WEBHOOK_URL,
)

logger = logging.getLogger(__name__)

CASHFREE_TIMEOUT_SECONDS = 15


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
