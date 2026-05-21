import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.auth import get_current_user
from models.order import CashfreeCheckoutCreate
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
    record_cashfree_webhook_event,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = logging.getLogger(__name__)

CASHFREE_PAYMENT_SUCCESS_WEBHOOK = "PAYMENT_SUCCESS_WEBHOOK"
CASHFREE_PAYMENT_FAILED_WEBHOOK = "PAYMENT_FAILED_WEBHOOK"
CASHFREE_PAYMENT_USER_DROPPED_WEBHOOK = "PAYMENT_USER_DROPPED_WEBHOOK"
CASHFREE_PAYMENT_STATUS_SUCCESS = "SUCCESS"


class CashfreeVerifyRequest(BaseModel):
    order_id: str


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


@router.post("/cashfree/webhook", response_model=dict)
async def cashfree_webhook_route(request: Request):
    raw_body = await request.body()
    if not verify_cashfree_webhook_signature(raw_body, request.headers):
        raise HTTPException(status_code=401, detail="Invalid Cashfree webhook signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid Cashfree webhook payload")

    webhook = normalize_cashfree_webhook_payload(payload, request.headers)
    order_id = webhook.get("order_id")
    event_type = webhook.get("event_type")
    payment_status = webhook.get("payment_status")

    if not order_id:
        return {"ok": True, "status": "ignored"}

    order = await record_cashfree_webhook_event(
        order_id=order_id,
        event_type=event_type,
        payment_status=payment_status,
        cf_payment_id=webhook.get("cf_payment_id"),
        idempotency_key=webhook.get("idempotency_key"),
        info=webhook,
    )

    if not order:
        return {"ok": True, "status": "ignored"}

    is_duplicate = order.get("cashfree_webhook_duplicate") is True

    if (
        event_type == CASHFREE_PAYMENT_SUCCESS_WEBHOOK
        and payment_status == CASHFREE_PAYMENT_STATUS_SUCCESS
    ):
        cashfree_data = get_cashfree_order(order_id)
        await finalize_paid_cashfree_order(order_id, cashfree_data, source="webhook")
        return {"ok": True, "status": "duplicate" if is_duplicate else "processed"}

    if event_type in {
        CASHFREE_PAYMENT_FAILED_WEBHOOK,
        CASHFREE_PAYMENT_USER_DROPPED_WEBHOOK,
    }:
        return {"ok": True, "status": "duplicate" if is_duplicate else "ignored"}

    return {"ok": True, "status": "duplicate" if is_duplicate else "ignored"}


@router.post("/cashfree/create-session", response_model=dict)
async def create_cashfree_session_route(
    payload: CashfreeCheckoutCreate,
    user: dict = Depends(get_current_user),
):
    pending_order = await create_pending_cashfree_order(payload, user)
    order_id = pending_order["id"]

    try:
        cashfree_data = create_cashfree_order_session(
            order_id=order_id,
            order_amount=pending_order["total_price"],
            customer_name=pending_order["billing_name"],
            customer_email=pending_order["billing_email"],
            customer_phone=pending_order["billing_phone"],
        )
    except HTTPException as exc:
        error_context = _cashfree_error_context(exc)
        logger.warning(
            "Cashfree create-session failed: order_id=%s final_payable=%s coupon_code=%s item_count=%s "
            "status_code=%s cashfree_status_code=%s cashfree_error_code=%s cashfree_error_message=%s "
            "cashfree_error=%s exception_type=%s",
            order_id,
            pending_order.get("total_price"),
            pending_order.get("coupon_code"),
            len(pending_order.get("items") or []),
            exc.status_code,
            error_context.get("cashfree_status_code"),
            error_context.get("cashfree_error_code"),
            error_context.get("cashfree_error_message"),
            error_context.get("cashfree_error"),
            error_context.get("exception_type"),
        )
        await mark_cashfree_order_failed(order_id, "cashfree_create_session_failed")
        raise exc

    order = await attach_cashfree_session(order_id, cashfree_data)
    return _payment_result(order)


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
