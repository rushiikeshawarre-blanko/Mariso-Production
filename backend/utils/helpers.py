from bson import ObjectId
import re
from typing import Optional

def serialize_mongo_value(order_doc):
    if isinstance(order_doc, ObjectId):
        return str(order_doc)
    if isinstance(order_doc, list):
        return [serialize_mongo_value(item) for item in order_doc]
    if isinstance(order_doc, dict):
        return {key: serialize_mongo_value(val) for key, val in order_doc.items()}
    return order_doc

def normalize_phone_e164(phone: str) -> Optional[str]:
    raw_phone = str(phone or "").strip()
    if not raw_phone:
        return None

    has_plus = raw_phone.startswith("+")
    digits = re.sub(r"\D", "", raw_phone)
    if not digits:
        return None

    if has_plus:
        normalized = f"+{digits}"
    else:
        digits = digits.lstrip("0")
        if len(digits) == 10:
            normalized = f"+91{digits}"
        elif len(digits) == 12 and digits.startswith("91"):
            normalized = f"+{digits}"
        else:
            normalized = f"+{digits}"

    e164_digits = normalized[1:]
    if not normalized.startswith("+") or not e164_digits.isdigit():
        return None
    if len(e164_digits) < 8 or len(e164_digits) > 15:
        return None

    return normalized


def format_phone(phone: str) -> str:
    return normalize_phone_e164(phone) or ""

def generate_slug(name: str) -> str:
    slug = name.lower().strip()
    slug = slug.replace("&", "and")
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug


def get_selected_variant(
        product: dict, 
        variant_id: str = None, 
        color_id: str = None, 
        flavor_id: str = None
    ) -> Optional[dict]:
    variants = product.get("variants", [])

    if not variants:
        return None

    if variant_id:
        for variant in variants:
            if variant.get("id") == variant_id and variant.get("is_active", True):
                return variant
        return None

    for variant in variants:
        if (
            variant.get("color_id") == color_id 
            and variant.get("flavor_id") == flavor_id 
            and variant.get("is_active", True)
        ):
            return variant

    return None


def ensure_product_defaults(product: dict) -> dict:
    """Ensure all product fields have default values"""
    defaults = {
        'slug': '',
        'short_description': '',
        'discount_price': None,
        'subcategory': '',
        'sku': '',
        'has_color_options': False,
        'has_flavor_options': False,
        'color_options': [],
        'flavor_options': [],
        'variants': [],
        'is_active': True,
        'is_featured': False,
        'is_bestseller': False,
        'is_new_arrival': False,
        'is_on_sale': False,
        'sale_start': None,
        'sale_end': None,
        'show_free_shipping': True,
        'show_returns': True,
        'show_reusable_container': True,
        'show_gift_packaging': True,
        'care_instructions': '',
        'shipping_info': '',
        'materials': '',
        'dimensions': '',
        'burn_time': '',
        'category_name': ''
    }
    return {**defaults, **product}
