from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.auth import get_current_user
from models.order import CashfreeCheckoutCreate
from services.cashfree_service import create_cashfree_order_session, get_cashfree_order
from services.order_service import (
    attach_cashfree_session,
    create_pending_cashfree_order,
    finalize_paid_cashfree_order,
    get_order,
    mark_cashfree_order_failed,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])


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
