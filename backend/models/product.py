from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator
import uuid


class ColorOption(BaseModel):
    id: str = ""
    name: str
    hex_code: str
    hex_code_secondary: Optional[str] = None
    images: List[str] = Field(default_factory=list)


class FlavorOption(BaseModel):
    id: str = ""
    name: str
    description: Optional[str] = ""
    images: List[str] = Field(default_factory=list)

class ProductVariant(BaseModel):
    id: str = ""
    color_id: Optional[str] = None
    flavor_id: Optional[str] = None
    sku: Optional[str] = None
    price_override: Optional[float] = None
    stock: Optional[int] = None
    images: List[str] = Field(default_factory=list)
    is_active: bool = True

# ==================== VARIANT MODELS ====================

class ProductCreate(BaseModel):
    name: str
    slug: Optional[str] = ""
    description: str
    short_description: Optional[str] = ""
    price: float = Field(..., gt=0)
    discount_price: Optional[float] = Field(None, gt=0)
    category_id: str
    subcategory: Optional[str] = ""
    sku: Optional[str] = ""
    stock: int = Field(0, ge=0)
    images: List[str] = Field(default_factory=list)
    video: Optional[str] = ""
    # Variant options
    has_color_options: bool = False
    has_flavor_options: bool = False
    color_options: List[ColorOption] = Field(default_factory=list)
    flavor_options: List[FlavorOption] = Field(default_factory=list)
    variants: List[ProductVariant] = Field(default_factory=list)
    # Status flags
    is_active: bool = True
    is_featured: bool = False
    is_bestseller: bool = False
    is_new_arrival: bool = False
    is_on_sale: bool = False
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    # Additional details
    care_instructions: Optional[str] = ""
    shipping_info: Optional[str] = ""
    materials: Optional[str] = ""
    dimensions: Optional[str] = ""
    burn_time: Optional[str] = ""
    @model_validator(mode="after")
    def validate_sale_pricing(self):
        if self.is_on_sale:
            if self.discount_price is None:
                raise ValueError("discount_price is required when is_on_sale is true")
            if self.discount_price >= self.price:
                raise ValueError("discount_price must be less than price when is_on_sale is true")
        else:
            self.discount_price = None
        return self

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    discount_price: Optional[float] = Field(None, gt=0)
    category_id: Optional[str] = None
    subcategory: Optional[str] = None
    sku: Optional[str] = None
    stock: Optional[int] = Field(None, ge=0)
    images: Optional[List[str]] = None
    video: Optional[str] = ""
    has_color_options: Optional[bool] = None
    has_flavor_options: Optional[bool] = None
    color_options: Optional[List[ColorOption]] = None
    flavor_options: Optional[List[FlavorOption]] = None
    variants: Optional[List[ProductVariant]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_bestseller: Optional[bool] = None
    is_new_arrival: Optional[bool] = None
    is_on_sale: Optional[bool] = None
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    care_instructions: Optional[str] = None
    shipping_info: Optional[str] = None
    materials: Optional[str] = None
    dimensions: Optional[str] = None
    burn_time: Optional[str] = None
    @model_validator(mode="after")
    def validate_sale_pricing(self):
        if self.is_on_sale is False:
            self.discount_price = None
        if self.is_on_sale is True and self.price is not None and self.discount_price is not None:
            if self.discount_price >= self.price:
                raise ValueError("discount_price must be less than price when is_on_sale is true")
        return self

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    description: str
    short_description: str
    price: float
    discount_price: Optional[float]
    category_id: str
    category_name: Optional[str] = ""
    subcategory: str
    sku: str
    stock: int
    images: List[str]
    video: Optional[str] = ""
    has_color_options: bool
    has_flavor_options: bool
    color_options: List[dict]
    flavor_options: List[dict]
    variants: List[dict]
    is_active: bool
    is_featured: bool
    is_bestseller: bool
    is_new_arrival: bool
    is_on_sale: bool
    sale_start: Optional[str]
    sale_end: Optional[str]
    care_instructions: str
    shipping_info: str
    materials: str
    dimensions: str
    burn_time: str
    created_at: str


def normalize_color_options(color_options: List[ColorOption]) -> List[dict]:
    normalized = []
    for color in color_options:
        color_dict = color.model_dump() if hasattr(color, "model_dump") else color
        if not color_dict.get("id"):
            color_dict["id"] = str(uuid.uuid4())
        normalized.append(color_dict)
    return normalized

def normalize_flavor_options(flavor_options: List[FlavorOption]) -> List[dict]:
    normalized = []
    for flavor in flavor_options:
        flavor_dict = flavor.model_dump() if hasattr(flavor, "model_dump") else flavor
        if not flavor_dict.get("id"):
            flavor_dict["id"] = str(uuid.uuid4())
        normalized.append(flavor_dict)
    return normalized

def normalize_variants(variants: List[ProductVariant]) -> List[dict]:
    normalized = []
    for variant in variants:
        variant_dict = variant.model_dump() if hasattr(variant, "model_dump") else variant
        if not variant_dict.get("id"):
            variant_dict["id"] = str(uuid.uuid4())
        normalized.append(variant_dict)
    return normalized