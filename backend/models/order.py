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

class OrderStatusUpdate(BaseModel):
    status: str