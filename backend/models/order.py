from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr

class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    variant_id: Optional[str] = None
    color_id: Optional[str] = None
    flavor_id: Optional[str] = None

class OrderCreate(BaseModel):
    items: List[CartItem]
    billing_name: str
    billing_phone: str
    billing_email: EmailStr
    billing_address: str
    billing_city: str
    billing_postal_code: str
    payment_method: str
    gift_packaging: bool = False

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
    stock_deducted: bool = False
    stock_deducted_at: Optional[str] = None
    customer_email_sent_at: Optional[str] = None
    admin_email_sent_at: Optional[str] = None
    whatsapp_sent_at: Optional[str] = None
    payment_events: List[dict] = Field(default_factory=list)

class OrderStatusUpdate(BaseModel):
    status: str
