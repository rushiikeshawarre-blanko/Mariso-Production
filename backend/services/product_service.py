from typing import List, Optional
import uuid
from fastapi import HTTPException
from datetime import datetime, timezone
from models.product import ColorOption, FlavorOption, ProductVariant
import logging
from pymongo import ReturnDocument
from core.database import db
from models.product import ProductCreate, ProductUpdate
from core.constants import MAX_LIMIT
from services.category_service import ensure_category_exists, build_category_map_from_products
from utils.helpers import generate_slug, get_selected_variant, ensure_product_defaults

logger = logging.getLogger(__name__)

PRODUCT_CARD_PROJECTION = {
    "_id": 0,
    "id": 1,
    "name": 1,
    "slug": 1,
    "category_id": 1,
    "sku": 1,
    "short_description": 1,
    "description": 1,
    "price": 1,
    "discount_price": 1,
    "is_on_sale": 1,
    "stock": 1,
    "images": 1,
    "has_color_options": 1,
    "has_flavor_options": 1,
    "color_options": 1,
    "flavor_options": 1,
    "variants": 1,
    "is_active": 1,
    "is_featured": 1,
    "is_bestseller": 1,
    "is_new_arrival": 1,
    "created_at": 1,
}

def validate_sale_pricing_payload(price, discount_price, is_on_sale):
    if is_on_sale:
        if discount_price is None:
            raise HTTPException(status_code=400, detail="Sale price is required when product is marked on sale")
        if discount_price <= 0:
            raise HTTPException(status_code=400, detail="Sale price must be greater than zero")
        if discount_price >= price:
            raise HTTPException(status_code=400, detail="Sale price must be less than base price")
    return None if not is_on_sale else discount_price

    
def validate_sale_dates(sale_start: Optional[str], sale_end: Optional[str]) -> None:
    if sale_start and sale_end:
        try:
            start = datetime.fromisoformat(sale_start)
            end = datetime.fromisoformat(sale_end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid sale date format")

        if start >= end:
            raise HTTPException(status_code=400, detail="sale_end must be after sale_start")

def normalize_color_options(color_options: List[ColorOption]) -> List[dict]:
    logger.info(f"Normalizing {len(color_options)} color options")
    normalized = []
    for color in color_options:
        color_dict = color.model_dump() if hasattr(color, "model_dump") else color
        if not color_dict.get("id"):
            color_dict["id"] = str(uuid.uuid4())
        normalized.append(color_dict)
    return normalized

def normalize_flavor_options(flavor_options: List[FlavorOption]) -> List[dict]:
    logger.info(f"Normalizing {len(flavor_options)} flavor options")
    normalized = []
    for flavor in flavor_options:
        flavor_dict = flavor.model_dump() if hasattr(flavor, "model_dump") else flavor
        if not flavor_dict.get("id"):
            flavor_dict["id"] = str(uuid.uuid4())
        normalized.append(flavor_dict)
    return normalized

def normalize_variants(variants: List[ProductVariant]) -> List[dict]:
    logger.info(f"Normalizing {len(variants)} variants")
    normalized = []
    for variant in variants:
        variant_dict = variant.model_dump() if hasattr(variant, "model_dump") else variant
        if not variant_dict.get("id"):
            variant_dict["id"] = str(uuid.uuid4())
        normalized.append(variant_dict)
    return normalized

def enrich_product(product: dict, category_map: Optional[dict] = None) -> dict:
    if not product:
        return product
    category_map = category_map or {}
    product = ensure_product_defaults(product)
    product["category_name"] = category_map.get(product.get("category_id"), "")
    return product

async def enrich_products(products: List[dict]) -> List[dict]:
    category_map = await build_category_map_from_products(products)
    return [enrich_product(product, category_map) for product in products]


def _first_image(images: Optional[list]) -> List[str]:
    for image in images or []:
        if image:
            return [image]
    return []


def map_product_to_card_response(product: dict) -> dict:
    product = ensure_product_defaults(product or {})

    return {
        "id": product.get("id", ""),
        "name": product.get("name", ""),
        "slug": product.get("slug", ""),
        "category_id": product.get("category_id", ""),
        "category_name": product.get("category_name", ""),
        "sku": product.get("sku", ""),
        "short_description": product.get("short_description", ""),
        "description": product.get("description", ""),
        "price": product.get("price", 0),
        "discount_price": product.get("discount_price"),
        "is_on_sale": product.get("is_on_sale", False),
        "stock": product.get("stock", 0),
        "images": _first_image(product.get("images")),
        "has_color_options": product.get("has_color_options", False),
        "has_flavor_options": product.get("has_flavor_options", False),
        "color_options": [
            {
                "id": color.get("id", ""),
                "name": color.get("name", ""),
                "hex_code": color.get("hex_code", ""),
                "hex_code_secondary": color.get("hex_code_secondary"),
                "is_active": color.get("is_active", True),
                "images": _first_image(color.get("images")),
            }
            for color in product.get("color_options") or []
        ],
        "flavor_options": [
            {
                "id": flavor.get("id", ""),
                "name": flavor.get("name", ""),
                "is_active": flavor.get("is_active", True),
            }
            for flavor in product.get("flavor_options") or []
        ],
        "variants": [
            {
                "id": variant.get("id", ""),
                "color_id": variant.get("color_id"),
                "flavor_id": variant.get("flavor_id"),
                "stock": variant.get("stock"),
                "is_active": variant.get("is_active", True),
            }
            for variant in product.get("variants") or []
        ],
        "is_active": product.get("is_active", True),
        "is_featured": product.get("is_featured", False),
        "is_bestseller": product.get("is_bestseller", False),
        "is_new_arrival": product.get("is_new_arrival", False),
        "created_at": product.get("created_at", ""),
    }


async def map_products_to_card_responses(products: List[dict]) -> List[dict]:
    enriched_products = await enrich_products(products)
    return [map_product_to_card_response(product) for product in enriched_products]


def generate_variant_combinations(color_options: list, flavor_options: list, existing_variants: list = None) -> list:
    """Generate all possible variant combinations from colors and flavors"""
    existing_variants = existing_variants or []
    existing_combos = {(v.get('color_id'), v.get('flavor_id')) for v in existing_variants}
    
    new_variants = []
    
    # Case 1: Both colors and flavors exist
    if color_options and flavor_options:
        for color in color_options:
            for flavor in flavor_options:
                combo = (color.get('id'), flavor.get('id'))
                if combo not in existing_combos:
                    new_variants.append({
                        'id': str(uuid.uuid4()),
                        'color_id': color.get('id'),
                        'color_name': color.get('name'),
                        'flavor_id': flavor.get('id'),
                        'flavor_name': flavor.get('name'),
                        'sku': '',
                        'price_override': None,
                        'stock': 0,
                        'is_active': True
                    })
    # Case 2: Only colors exist
    elif color_options:
        for color in color_options:
            combo = (color.get('id'), None)
            if combo not in existing_combos:
                new_variants.append({
                    'id': str(uuid.uuid4()),
                    'color_id': color.get('id'),
                    'color_name': color.get('name'),
                    'flavor_id': None,
                    'flavor_name': None,
                    'sku': '',
                    'price_override': None,
                    'stock': 0,
                    'is_active': True
                })
    # Case 3: Only flavors exist
    elif flavor_options:
        for flavor in flavor_options:
            combo = (None, flavor.get('id'))
            if combo not in existing_combos:
                new_variants.append({
                    'id': str(uuid.uuid4()),
                    'color_id': None,
                    'color_name': None,
                    'flavor_id': flavor.get('id'),
                    'flavor_name': flavor.get('name'),
                    'sku': '',
                    'price_override': None,
                    'stock': 0,
                    'is_active': True
                })
    
    return existing_variants + new_variants


async def get_products(
    category_id: Optional[str] = None, 
    search: Optional[str] = None, 
    on_sale: Optional[bool] = None,
    featured: Optional[bool] = None,
    bestseller: Optional[bool] = None,
    new_arrival: Optional[bool] = None,
    active_only: Optional[bool] = True
):
    query = {}
    if category_id is not None:
        query["category_id"] = category_id
    if search is not None:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"short_description": {"$regex": search, "$options": "i"}},
        ]
    if on_sale is not None:
        query["is_on_sale"] = on_sale
    if featured is not None:
        query["is_featured"] = featured
    if bestseller is not None:
        query["is_bestseller"] = bestseller
    if new_arrival is not None:
        query["is_new_arrival"] = new_arrival
    if active_only is not None:
        query["is_active"] = active_only
    
    products = await db.products.find(query, {"_id": 0}).to_list(MAX_LIMIT)
    
    return await enrich_products(products)

async def get_product_cards(
    category_id: Optional[str] = None,
    search: Optional[str] = None,
    on_sale: Optional[bool] = None,
    featured: Optional[bool] = None,
    bestseller: Optional[bool] = None,
    new_arrival: Optional[bool] = None,
    active_only: Optional[bool] = True
):
    query = {}
    if category_id is not None:
        query["category_id"] = category_id
    if search is not None:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"short_description": {"$regex": search, "$options": "i"}},
        ]
    if on_sale is not None:
        query["is_on_sale"] = on_sale
    if featured is not None:
        query["is_featured"] = featured
    if bestseller is not None:
        query["is_bestseller"] = bestseller
    if new_arrival is not None:
        query["is_new_arrival"] = new_arrival
    if active_only is not None:
        query["is_active"] = active_only

    products = await db.products.find(query, PRODUCT_CARD_PROJECTION).to_list(MAX_LIMIT)

    return await map_products_to_card_responses(products)

async def get_featured_products():
    products = await db.products.find({"is_active": True, "is_featured": True}, {"_id": 0}).to_list(8)
    
    return await enrich_products(products)

async def get_featured_product_cards():
    products = await db.products.find(
        {"is_active": True, "is_featured": True},
        PRODUCT_CARD_PROJECTION,
    ).sort("created_at", -1).to_list(8)

    return await map_products_to_card_responses(products)

async def get_bestsellers():
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "count": {"$sum": "$items.quantity"}}},
        {"$sort": {"count": -1}},
        {"$limit": 8}
    ]
    bestseller_ids = await db.orders.aggregate(pipeline).to_list(8)
    
    if not bestseller_ids:
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(8)
    else:
        ids = [item['_id'] for item in bestseller_ids]
        products = await db.products.find({"id": {"$in": ids}, "is_active": True}, {"_id": 0}).to_list(8)
    
    return await enrich_products(products)

async def get_bestseller_product_cards():
    products = await db.products.find(
        {"is_active": True, "is_bestseller": True},
        PRODUCT_CARD_PROJECTION,
    ).sort("created_at", -1).to_list(8)

    return await map_products_to_card_responses(products)

async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id, "is_active": True}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return (await enrich_products([product]))[0]


async def get_product_variant_stock(product_id: str, color_id: Optional[str] = None, flavor_id: Optional[str] = None):
    """Return stock, availability, and variant details for a given product selection."""
    product = await db.products.find_one({"id": product_id, "is_active": True}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    variant = get_selected_variant(product, color_id=color_id, flavor_id=flavor_id)

    if product.get("variants") and not variant and (
        product.get("has_color_options") or product.get("has_flavor_options")
    ):
        raise HTTPException(status_code=400, detail="Variant selection required")

    stock = variant.get("stock", 0) if variant else product.get("stock", 0)

    return {
        "product_id": product_id,
        "color_id": color_id,
        "flavor_id": flavor_id,
        "stock": stock,
        "is_available": stock > 0,
        "variant": variant
    }

async def create_product(product: ProductCreate):
    price = product.price
    discount_price = product.discount_price
    is_on_sale = product.is_on_sale

    discount_price = validate_sale_pricing_payload(price, discount_price, is_on_sale)

    validate_sale_dates(product.sale_start, product.sale_end)

    product_id = str(uuid.uuid4())

    await ensure_category_exists(product.category_id)
    
    # Generate IDs for color options
    color_options = normalize_color_options(product.color_options)
    
    # Generate IDs for flavor options
    flavor_options =  normalize_flavor_options(product.flavor_options)
    
    # Generate IDs for variants
    variants = normalize_variants(product.variants)

    product_doc = {
        "id": product_id,
        "name": product.name,
        "slug": product.slug or generate_slug(product.name),
        "description": product.description,
        "short_description": product.short_description or "",
        "price": price,
        "discount_price": discount_price,
        "category_id": product.category_id,
        "subcategory": product.subcategory or "",
        "sku": product.sku or f"SKU-{product_id[:8].upper()}",
        "stock": product.stock,
        "images": product.images,
        "video": product.video or "",
        "has_color_options": product.has_color_options,
        "has_flavor_options": product.has_flavor_options,
        "color_options": color_options,
        "flavor_options": flavor_options,
        "variants": variants,
        "is_active": product.is_active,
        "is_featured": product.is_featured,
        "is_bestseller": product.is_bestseller,
        "is_new_arrival": product.is_new_arrival,
        "is_on_sale": is_on_sale,
        "sale_start": product.sale_start,
        "sale_end": product.sale_end,
        "show_free_shipping": product.show_free_shipping,
        "show_returns": product.show_returns,
        "show_reusable_container": product.show_reusable_container,
        "show_gift_packaging": product.show_gift_packaging,
        "care_instructions": product.care_instructions or "",
        "shipping_info": product.shipping_info or "",
        "materials": product.materials or "",
        "dimensions": product.dimensions or "",
        "burn_time": product.burn_time or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product_doc)

   
    
    # Re-fetch to avoid _id issue
    created_product = await db.products.find_one({"id": product_id}, {"_id": 0})
    
    return (await enrich_products([created_product]))[0]

async def update_product(product_id: str, product: ProductUpdate):
    update_data = {}

    existing = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    effective_price = product.price if product.price is not None else existing.get("price")
    effective_discount_price = product.discount_price if product.discount_price is not None else existing.get("discount_price")
    effective_is_on_sale = product.is_on_sale if product.is_on_sale is not None else existing.get("is_on_sale", False)

    normalized_discount_price = validate_sale_pricing_payload(
        effective_price,
        effective_discount_price,
        effective_is_on_sale,
        )

    effective_sale_start = product.sale_start if product.sale_start is not None else existing.get("sale_start")
    effective_sale_end = product.sale_end if product.sale_end is not None else existing.get("sale_end")

    validate_sale_dates(effective_sale_start, effective_sale_end)

    if product.category_id is not None:
        await ensure_category_exists(product.category_id)
    
    for key, value in product.model_dump(exclude_unset=True).items():
        if key == 'color_options' and value:
            # Generate IDs for new color options
            update_data["color_options"] = normalize_color_options(value)
        elif key == 'flavor_options' and value:
            # Generate IDs for new flavor options
            update_data["flavor_options"] = normalize_flavor_options(value)
        elif key == 'variants' and value:
            # Generate IDs for new variants
            update_data["variants"] = normalize_variants(value)
        else:
            update_data[key] = value
    
    if "is_on_sale" in update_data or "discount_price" in update_data or "price" in update_data:
        update_data["discount_price"] = normalized_discount_price

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    updated = await db.products.find_one_and_update(
        {"id": product_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0}
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Product not found")

    return (await enrich_products([updated]))[0]


async def delete_product(product_id: str):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

async def generate_product_variants(product_id: str):
    """Auto-generate variant combinations from colors and flavors"""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    color_options = product.get('color_options', [])
    flavor_options = product.get('flavor_options', [])
    existing_variants = product.get('variants', [])
    
    # Generate new combinations
    new_variants = generate_variant_combinations(color_options, flavor_options, existing_variants)
    
    # Update product with new variants
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"variants": new_variants}}
    )
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    
    return (await enrich_products([updated]))[0]
