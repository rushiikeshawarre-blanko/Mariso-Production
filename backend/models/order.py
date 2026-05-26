from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class CartItemGiftPackaging(BaseModel):
    selected: bool = True
    option_id: Optional[str] = None
    quantity: int = Field(1, gt=0)
    message: str = ""

    @field_validator("message")
    @classmethod
    def validate_message_word_count(cls, value: str) -> str:
        if len(str(value or "").split()) > 150:
            raise ValueError("Gift message cannot exceed 150 words")
        return value

class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    variant_id: Optional[str] = None
    color_id: Optional[str] = None
    flavor_id: Optional[str] = None
    gift_packaging: Optional[CartItemGiftPackaging] = None

class OrderCreate(BaseModel):
    items: List[CartItem]
    billing_name: str
    billing_phone: str
    billing_email: EmailStr
    billing_address: str
    billing_address_2: Optional[str] = None
    billing_city: str
    billing_state: str = Field(..., min_length=1)
    billing_country: str = Field("India", min_length=1)
    billing_postal_code: str
    payment_method: str
    gift_packaging: bool = False

class CashfreeCheckoutCreate(BaseModel):
    items: List[CartItem]
    billing_name: str
    billing_phone: str
    billing_email: EmailStr
    billing_address: str
    billing_address_2: Optional[str] = None
    billing_city: str
    billing_state: str = Field(..., min_length=1)
    billing_country: str = Field("India", min_length=1)
    billing_postal_code: str
    gift_packaging: bool = False
    coupon_code: Optional[str] = None

class OrderPaymentFields(BaseModel):
    payment_provider: Optional[str] = None
    payment_status: Optional[str] = None
    cashfree_order_id: Optional[str] = None
    cashfree_cf_order_id: Optional[str] = None
    cashfree_payment_session_id: Optional[str] = None
    cashfree_payment_id: Optional[str] = None
    cashfree_order_status: Optional[str] = None
    cashfree_payment_status: Optional[str] = None
    paid_at: Optional[str] = None
    stock_reserved: bool = False
    stock_reserved_at: Optional[str] = None
    stock_reserved_until: Optional[str] = None
    stock_released_at: Optional[str] = None
    stock_deducted: bool = False
    stock_deducted_at: Optional[str] = None
    customer_email_sent_at: Optional[str] = None
    admin_email_sent_at: Optional[str] = None
    whatsapp_sent_at: Optional[str] = None
    coupon_code: Optional[str] = None
    coupon_id: Optional[str] = None
    coupon_discount_amount: float = 0
    eligible_subtotal: Optional[float] = None
    subtotal_before_discount: Optional[float] = None
    total_after_discount: Optional[float] = None
    coupon_snapshot: Optional[dict] = None
    coupon_usage_recorded: bool = False
    payment_events: List[dict] = Field(default_factory=list)

class OrderStatusUpdate(BaseModel):
    status: str
