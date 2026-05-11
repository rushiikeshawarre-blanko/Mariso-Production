from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field

from services.cashfree_service import create_cashfree_order_session

router = APIRouter(prefix="/api/payments", tags=["payments"])


class CashfreeCreateSessionRequest(BaseModel):
    order_id: str = Field(..., min_length=3, max_length=45, pattern=r"^[A-Za-z0-9_-]+$")
    order_amount: float = Field(..., gt=0)
    customer_name: str = Field(..., min_length=1)
    customer_email: EmailStr
    customer_phone: str = Field(..., min_length=10, max_length=15, pattern=r"^[0-9]+$")


@router.post("/cashfree/create-session", response_model=dict)
def create_cashfree_session_route(payload: CashfreeCreateSessionRequest):
    return create_cashfree_order_session(
        order_id=payload.order_id,
        order_amount=payload.order_amount,
        customer_name=payload.customer_name,
        customer_email=str(payload.customer_email),
        customer_phone=payload.customer_phone,
    )
