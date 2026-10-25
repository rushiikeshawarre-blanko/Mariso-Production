import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from core.auth import get_current_user
from core.config import CASHFREE_ORDER_EXPIRY_MINUTES
from models.order import CashfreeCheckoutCreate, CashfreeCheckoutPreview, RazorpayCheckoutCreate, RazorpayCheckoutPreview
from services.cashfree_service import (
    create_cashfree_order_session,
    get_cashfree_order,
    normalize_cashfree_webhook_payload,
    verify_cashfree_webhook_signature,
)
from services.order_service import (
    attach_cashfree_session,
    create_pending_cashfree_order,
    finalize_paid_cashfree_order,
    get_order,
    mark_cashfree_order_failed,
    preview_checkout_shipping,
    record_cashfree_webhook_event,
    update_cashfree_refund_from_webhook,
)
from core.limiter import limiter

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = logging.getLogger(__name__)

CASHFREE_PAYMENT_SUCCESS_WEBHOOK = "PAYMENT_SUCCESS_WEBHOOK"
CASHFREE_PAYMENT_FAILED_WEBHOOK = "PAYMENT_FAILED_WEBHOOK"
CASHFREE_PAYMENT_USER_DROPPED_WEBHOOK = "PAYMENT_USER_DROPPED_WEBHOOK"
CASHFREE_PAYMENT_STATUS_SUCCESS = "SUCCESS"


class CashfreeVerifyRequest(BaseModel):
    order_id: str


def _cashfree_order_expiry_time(now: Optional[datetime] = None) -> str:
    created_at = now or datetime.now(timezone.utc)
    return (created_at + timedelta(minutes=CASHFREE_ORDER_EXPIRY_MINUTES)).isoformat()


def _payment_result(order: dict) -> dict:
    return {
        "order_id": order.get("id"),
        "payment_session_id": order.get("cashfree_payment_session_id"),
        "cashfree_order_id": order.get("cashfree_order_id"),
        "cashfree_cf_order_id": order.get("cashfree_cf_order_id"),
        "cashfree_order_status": order.get("cashfree_order_status"),
        "cashfree_payment_status": order.get("cashfree_payment_status"),
        "payment_status": order.get("payment_status"),
        "status": order.get("status"),
        "shipping_charge": order.get("shipping_charge", 0),
        "shipping_free_reason": order.get("shipping_free_reason"),
        "shipping_breakdown": order.get("shipping_breakdown", []),
        "total_price": order.get("total_price"),
        "total_after_discount": order.get("total_after_discount"),
        "stock_reserved": order.get("stock_reserved"),
        "stock_reserved_until": order.get("stock_reserved_until"),
        "stock_deducted": order.get("stock_deducted"),
    }


def _cashfree_error_context(exc: HTTPException) -> dict:
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    return {
        "cashfree_status_code": detail.get("cashfree_status_code"),
        "cashfree_error_code": detail.get("cashfree_error_code"),
        "cashfree_error_message": detail.get("cashfree_error_message"),
        "cashfree_error": detail.get("cashfree_error"),
        "exception_type": type(exc).__name__,
    }


def _is_cashfree_refund_webhook(webhook: dict) -> bool:
    event_type = str(webhook.get("event_type") or "").lower()
    return (
        "refund" in event_type
        or bool(webhook.get("refund_id"))
        or bool(webhook.get("cf_refund_id"))
        or bool(webhook.get("refund_status"))
    )


def _cashfree_webhook_data_keys(payload: dict) -> list[str]:
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        return sorted(str(key) for key in data.keys())
    return []


def _cashfree_webhook_log_headers(headers: dict) -> dict:
    sensitive_headers = {"authorization", "cookie", "set-cookie", "x-api-key"}
    return {
        key: "[REDACTED]" if key.lower() in sensitive_headers else value
        for key, value in headers.items()
    }


# Cashfree webhook - MUST remain public endpoint
@router.post("/cashfree/webhook", include_in_schema=False, response_model=dict)
async def cashfree_webhook_route(request: Request):
    raw_body = await request.body()
    headers = dict(request.headers)
    signature = request.headers.get("x-webhook-signature")
    logger.info(
        "Cashfree webhook raw request received: headers=%s body=%s x_webhook_signature=%s",
        _cashfree_webhook_log_headers(headers),
        raw_body.decode("utf-8", errors="replace"),
        signature,
    )

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        logger.warning("Cashfree webhook rejected: invalid JSON payload")
        raise HTTPException(status_code=400, detail="Invalid Cashfree webhook payload")

    if not verify_cashfree_webhook_signature(raw_body, request.headers):
        logger.warning("Cashfree webhook rejected: signature validation failed")
        raise HTTPException(status_code=401, detail="Invalid Cashfree webhook signature")

    webhook = normalize_cashfree_webhook_payload(payload, request.headers)
    order_id = webhook.get("order_id")
    event_type = webhook.get("event_type")
    payment_status = webhook.get("payment_status")
    is_refund_event = _is_cashfree_refund_webhook(webhook)

    logger.info(
        "Cashfree verified webhook received: event_type=%s data_keys=%s order_id=%s "
        "refund_id=%s cf_refund_id=%s refund_status=%s payment_status=%s",
        event_type,
        _cashfree_webhook_data_keys(payload),
        order_id,
        webhook.get("refund_id"),
        webhook.get("cf_refund_id"),
        webhook.get("refund_status"),
        payment_status,
    )

    if is_refund_event:
        cashfree_refund_data = {
            "order_id": order_id,
            "refund_id": webhook.get("refund_id"),
            "cf_refund_id": webhook.get("cf_refund_id"),
            "refund_status": webhook.get("refund_status"),
            "status_description": webhook.get("refund_failed_reason"),
        }
        await update_cashfree_refund_from_webhook(cashfree_refund_data, event_type=event_type)
    else:
        logger.info(
            "Cashfree webhook received non-refund event: event_type=%s order_id=%s "
            "payment_status=%s",
            event_type,
            order_id,
            payment_status,
        )

        if order_id:
            order = await record_cashfree_webhook_event(
                order_id=order_id,
                event_type=event_type,
                payment_status=payment_status,
                cf_payment_id=webhook.get("cf_payment_id"),
                idempotency_key=webhook.get("idempotency_key"),
                info=webhook,
            )

            if (
                order
                and event_type == CASHFREE_PAYMENT_SUCCESS_WEBHOOK
                and payment_status == CASHFREE_PAYMENT_STATUS_SUCCESS
            ):
                cashfree_data = get_cashfree_order(order_id)
                await finalize_paid_cashfree_order(order_id, cashfree_data, source="webhook")

    return {"ok": True, "received": True}


@router.post("/cashfree/create-session", response_model=dict)
@limiter.limit("3/minute")
async def create_cashfree_session_route(
    request: Request,
    payload: CashfreeCheckoutCreate,
    user: dict = Depends(get_current_user),
):
    # Old clients must not reserve inventory or create new legacy payments.
    raise HTTPException(status_code=410, detail="Cashfree checkout has been retired. Refresh the page to pay with Razorpay.")


@router.post("/cashfree/preview", response_model=dict)
async def preview_cashfree_checkout_route(
    payload: CashfreeCheckoutPreview,
    user: dict = Depends(get_current_user),
):
    return await preview_checkout_shipping(payload, user)


@router.get("/cashfree/orders/{order_id}/status", response_model=dict)
async def get_cashfree_payment_status_route(
    order_id: str,
    user: dict = Depends(get_current_user),
):
    await get_order(order_id, user)
    cashfree_data = get_cashfree_order(order_id)
    order = await finalize_paid_cashfree_order(order_id, cashfree_data, source="status")
    return _payment_result(order)


@router.post("/cashfree/verify", response_model=dict)
async def verify_cashfree_payment_route(
    payload: CashfreeVerifyRequest,
    user: dict = Depends(get_current_user),
):
    await get_order(payload.order_id, user)
    cashfree_data = get_cashfree_order(payload.order_id)
    order = await finalize_paid_cashfree_order(payload.order_id, cashfree_data, source="verify")
    return _payment_result(order)


@router.post("/razorpay/create-order", response_model=dict)
@limiter.limit("3/minute")
async def create_razorpay_order_route(
    request: Request,
    payload: RazorpayCheckoutCreate,
    user: dict = Depends(get_current_user),
):
    from services.razorpay_order_service import create_checkout_order
    return await create_checkout_order(payload, user)


class RazorpayVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: str = Field(min_length=1, max_length=100)
    razorpay_order_id: str = Field(pattern=r"^order_[A-Za-z0-9]{1,100}$")
    razorpay_payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,100}$")
    razorpay_signature: str = Field(pattern=r"^[0-9a-f]{64}$", repr=False)


@router.post("/razorpay/verify", response_model=dict)
@limiter.limit("10/minute")
async def verify_razorpay_route(request: Request, payload: RazorpayVerifyRequest,
                               user: dict = Depends(get_current_user)):
    from services.razorpay_verification_service import verify_checkout
    return await verify_checkout(payload, user)


@router.post("/razorpay/webhook", include_in_schema=False, response_model=dict)
async def razorpay_webhook_route(request: Request):
    from services.razorpay_verification_service import receive_webhook, require_processing
    require_processing()
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 262144:
            raise HTTPException(413, "Webhook too large")
    return await receive_webhook(bytes(body), request.headers.get("x-razorpay-signature"),
                                 request.headers.get("x-razorpay-event-id"))


@router.get('/razorpay/orders/{order_id}/status', response_model=dict)
async def razorpay_order_status_route(order_id: str, user: dict = Depends(get_current_user)):
    from services.razorpay_verification_service import get_owned_payment_status
    return await get_owned_payment_status(order_id, user)


@router.post('/razorpay/preview', response_model=dict)
@limiter.limit('10/minute')
async def razorpay_preview_route(request: Request, payload: RazorpayCheckoutPreview,
                                user: dict = Depends(get_current_user)):
    from services.razorpay_service import require_order_creation_enabled
    from services.razorpay_order_service import build_quote
    require_order_creation_enabled()
    quote, _ = await build_quote(payload, user)
    return {
        **{key: quote[key] for key in ('shipping_charge', 'shipping_free_reason',
            'shipping_rate_source', 'shipping_breakdown', 'total_price', 'amount_paise', 'currency')},
        'total_payable': quote['total_price'],
    }


@router.post('/razorpay/orders/{order_id}/retry', response_model=dict)
@limiter.limit('3/minute')
async def retry_razorpay_route(request: Request, order_id: str, user: dict = Depends(get_current_user)):
    from services.razorpay_retry_service import retry_checkout
    return await retry_checkout(order_id, user)


@router.post('/razorpay/orders/{order_id}/buy-again', response_model=dict)
@limiter.limit('3/minute')
async def buy_again_razorpay_route(request: Request, order_id: str, user: dict = Depends(get_current_user)):
    from services.razorpay_retry_service import retry_checkout
    return await retry_checkout(order_id, user, buy_again=True)
