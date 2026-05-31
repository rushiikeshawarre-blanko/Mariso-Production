from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


CANCELLATION_REASON_DELIVERY_TIMELINE = "Delivery timeline does not meet my requirement"
CANCELLATION_REASON_WRONG_VARIANT = "Ordered the wrong fragrance/design/variant"
CANCELLATION_REASON_SUITABLE_PRODUCT = "Found a more suitable product"
CANCELLATION_REASON_OTHERS = "Others"
CANCELLATION_REASON_OPTIONS = (
    CANCELLATION_REASON_DELIVERY_TIMELINE,
    CANCELLATION_REASON_WRONG_VARIANT,
    CANCELLATION_REASON_SUITABLE_PRODUCT,
    CANCELLATION_REASON_OTHERS,
)


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
    selected_pack_id: Optional[str] = None
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
    feedback_whatsapp_sent_at: Optional[str] = None
    coupon_code: Optional[str] = None
    coupon_id: Optional[str] = None
    coupon_discount_amount: float = 0
    eligible_subtotal: Optional[float] = None
    subtotal_before_discount: Optional[float] = None
    total_after_discount: Optional[float] = None
    coupon_snapshot: Optional[dict] = None
    coupon_usage_recorded: bool = False
    payment_events: List[dict] = Field(default_factory=list)
    cancellation_status: str = "none"
    cancellation_requested_at: Optional[str] = None
    cancellation_reason: Optional[str] = None
    cancellation_reasons: List[str] = Field(default_factory=list)
    cancellation_reason_other: Optional[str] = None
    cancellation_admin_note: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancelled_by: Optional[str] = None
    refund_status: str = "none"
    refund_amount: Optional[float] = None
    refund_reason: Optional[str] = None
    refund_note: Optional[str] = None
    refund_id: Optional[str] = None
    cf_refund_id: Optional[str] = None
    cashfree_refund_status: Optional[str] = None
    refund_initiated_at: Optional[str] = None
    refund_completed_at: Optional[str] = None
    refund_failed_reason: Optional[str] = None
    refund_last_synced_at: Optional[str] = None
    refund_webhook_received_at: Optional[str] = None
    stock_restored_at: Optional[str] = None
    shipping_provider: Optional[str] = None
    shiprocket_order_id: Optional[str] = None
    shiprocket_shipment_id: Optional[str] = None
    shiprocket_awb_code: Optional[str] = None
    shiprocket_courier_name: Optional[str] = None
    shiprocket_tracking_url: Optional[str] = None
    shipment_status: Optional[str] = None
    shipment_created_at: Optional[str] = None
    shipment_error: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: str


class OrderCancellationRequest(BaseModel):
    cancellation_reasons: List[str] = Field(..., min_length=1)
    cancellation_reason_other: Optional[str] = Field(None, max_length=500)

    @field_validator("cancellation_reasons")
    @classmethod
    def validate_cancellation_reasons(cls, value: List[str]) -> List[str]:
        normalized = []
        seen = set()
        for reason in value:
            clean_reason = str(reason or "").strip()
            if clean_reason not in CANCELLATION_REASON_OPTIONS:
                raise ValueError("Invalid cancellation reason")
            if clean_reason not in seen:
                normalized.append(clean_reason)
                seen.add(clean_reason)

        if not normalized:
            raise ValueError("At least one cancellation reason is required")
        return normalized

    @model_validator(mode="after")
    def validate_other_reason(self):
        has_other = CANCELLATION_REASON_OTHERS in self.cancellation_reasons
        other_reason = (self.cancellation_reason_other or "").strip()

        if has_other and not other_reason:
            raise ValueError("Other cancellation reason is required")

        self.cancellation_reason_other = other_reason if has_other else None
        return self


class OrderCancellationDecision(BaseModel):
    note: Optional[str] = Field(None, max_length=500)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip() or None
