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

def format_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")

    if phone.startswith("+"):
        return phone
    if phone.startswith("0"):
        return "+91" + phone[1:]
    return f"+91{phone}"

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
