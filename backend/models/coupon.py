from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


CouponType = Literal["general", "influencer", "personal", "recovery"]
CouponVisibility = Literal["public", "private", "influencer"]
DiscountType = Literal["percentage", "fixed"]
AppliesTo = Literal["all", "categories", "products"]
CouponSurface = Literal["checkout", "cart"]


def normalize_coupon_code(code: str) -> str:
    return code.strip().upper()


class CouponBase(BaseModel):
    code: str
    coupon_type: CouponType = "general"
    description: Optional[str] = ""
    visibility: CouponVisibility = "private"
    display_title: Optional[str] = ""
    display_description: Optional[str] = ""
    show_on_cart: bool = True
    show_on_checkout: bool = True
    discount_type: DiscountType
    discount_value: float
    max_discount_amount: Optional[float] = Field(None, ge=0)
    minimum_order_amount: Optional[float] = Field(0, ge=0)
    applies_to: AppliesTo = "all"
    applicable_category_ids: List[str] = Field(default_factory=list)
    applicable_product_ids: List[str] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    usage_limit_total: Optional[int] = Field(None, gt=0)
    usage_limit_per_customer: Optional[int] = Field(None, gt=0)
    influencer_name: Optional[str] = ""
    influencer_handle: Optional[str] = ""
    is_active: bool = True
    allow_stacking: bool = False

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = normalize_coupon_code(value)
        if not normalized:
            raise ValueError("Coupon code is required")
        return normalized

    @model_validator(mode="after")
    def validate_discount(self):
        if self.discount_type == "percentage":
            if self.discount_value <= 0 or self.discount_value > 100:
                raise ValueError("Percentage discount value must be between 0 and 100")
        elif self.discount_value <= 0:
            raise ValueError("Fixed discount value must be positive")

        if self.applies_to == "categories" and not self.applicable_category_ids:
            raise ValueError("Category scoped coupons require applicable_category_ids")
        if self.applies_to == "products" and not self.applicable_product_ids:
            raise ValueError("Product scoped coupons require applicable_product_ids")

        self.allow_stacking = False
        return self


class CouponCreate(CouponBase):
    pass


class CouponUpdate(BaseModel):
    code: Optional[str] = None
    coupon_type: Optional[CouponType] = None
    description: Optional[str] = None
    visibility: Optional[CouponVisibility] = None
    display_title: Optional[str] = None
    display_description: Optional[str] = None
    show_on_cart: Optional[bool] = None
    show_on_checkout: Optional[bool] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    max_discount_amount: Optional[float] = Field(None, ge=0)
    minimum_order_amount: Optional[float] = Field(None, ge=0)
    applies_to: Optional[AppliesTo] = None
    applicable_category_ids: Optional[List[str]] = None
    applicable_product_ids: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    usage_limit_total: Optional[int] = Field(None, gt=0)
    usage_limit_per_customer: Optional[int] = Field(None, gt=0)
    influencer_name: Optional[str] = None
    influencer_handle: Optional[str] = None
    is_active: Optional[bool] = None
    allow_stacking: Optional[bool] = False

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = normalize_coupon_code(value)
        if not normalized:
            raise ValueError("Coupon code cannot be empty")
        return normalized


class CouponToggle(BaseModel):
    is_active: Optional[bool] = None


class CouponResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    code: str
    coupon_type: CouponType
    description: str
    visibility: CouponVisibility = "private"
    display_title: str = ""
    display_description: str = ""
    show_on_cart: bool = True
    show_on_checkout: bool = True
    discount_type: DiscountType
    discount_value: float
    max_discount_amount: Optional[float]
    minimum_order_amount: float
    applies_to: AppliesTo
    applicable_category_ids: List[str]
    applicable_product_ids: List[str]
    start_date: Optional[str]
    end_date: Optional[str]
    usage_limit_total: Optional[int]
    usage_limit_per_customer: Optional[int]
    used_count: int
    influencer_name: str
    influencer_handle: str
    is_active: bool
    allow_stacking: bool
    created_at: str
    updated_at: str


class CouponValidationItem(BaseModel):
    product_id: str
    category_id: Optional[str] = ""
    quantity: int = Field(..., gt=0)
    price: float = Field(..., ge=0)


class CouponValidationRequest(BaseModel):
    code: str
    items: List[CouponValidationItem] = Field(..., min_length=1)
    user_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = normalize_coupon_code(value)
        if not normalized:
            raise ValueError("Coupon code is required")
        return normalized


class CouponValidationResponse(BaseModel):
    valid: bool
    message: str
    code: Optional[str] = None
    coupon_id: Optional[str] = None
    discount_amount: Optional[float] = None
    eligible_subtotal: Optional[float] = None
    cart_subtotal: Optional[float] = None
    final_total: Optional[float] = None
    coupon_snapshot: Optional[dict] = None


class AvailableCouponsRequest(BaseModel):
    items: List[CouponValidationItem] = Field(..., min_length=1)
    surface: CouponSurface = "checkout"
    user_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class AvailableCouponResponse(BaseModel):
    code: str
    coupon_id: str
    display_title: str
    display_description: str
    discount_type: DiscountType
    discount_value: float
    discount_amount: Optional[float] = None
    eligible_subtotal: Optional[float] = None
    cart_subtotal: Optional[float] = None
    final_total: Optional[float] = None
    is_applicable: bool
    message: str
