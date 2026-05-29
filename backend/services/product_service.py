from typing import List, Optional
import uuid
from fastapi import HTTPException
from datetime import datetime, timezone
from models.product import ColorOption, FlavorOption, GiftPackagingOption, PackOption, ProductVariant
import logging
from pymongo import UpdateOne
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from core.database import db
from models.product import ProductCreate, ProductUpdate, ProductShopOrderItem
from core.constants import MAX_LIMIT
from services.category_service import ensure_category_exists, build_category_map_from_products
from utils.helpers import allocate_unique_slug, generate_slug, get_selected_variant, ensure_product_defaults, slug_exists

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
    "sell_as_pack": 1,
    "pack_size": 1,
    "pack_label": 1,
    "base_pieces_per_unit": 1,
    "pack_options": 1,
    "shop_priority": 1,
    "shop_order": 1,
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
    "show_gift_packaging": 1,
    "gift_packaging_title": 1,
    "gift_packaging_description": 1,
    "gift_packaging_price": 1,
    "gift_message_enabled": 1,
    "gift_packaging_options": 1,
    "created_at": 1,
}

SHOP_PRODUCT_SORT = {
    "shop_priority": -1,
    "shop_order": 1,
    "created_at": -1,
}


async def find_shop_ordered_products(query: dict, projection: Optional[dict] = None, limit: int = MAX_LIMIT) -> List[dict]:
    pipeline = [
        {"$match": query},
        {
            "$addFields": {
                "shop_priority": {"$ifNull": ["$shop_priority", 0]},
                "shop_order": {"$ifNull": ["$shop_order", 0]},
            }
        },
        {"$sort": SHOP_PRODUCT_SORT},
    ]
    if projection:
        pipeline.append({"$project": projection})

    return await db.products.aggregate(pipeline).to_list(limit)

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


def normalize_pack_payload(sell_as_pack: bool, pack_size: int, pack_label: Optional[str]) -> dict:
    label = (pack_label or "").strip() or None
    if not sell_as_pack:
        return {"sell_as_pack": False, "pack_size": 1, "pack_label": label}

    try:
        normalized_size = int(pack_size or 0)
    except (TypeError, ValueError):
        normalized_size = 0

    if normalized_size < 2:
        raise HTTPException(status_code=400, detail="Pack size must be at least 2 when selling as a pack")

    return {"sell_as_pack": True, "pack_size": normalized_size, "pack_label": label}

def normalize_pack_options(pack_options: List[PackOption], base_pieces_per_unit: int = 1) -> List[dict]:
    normalized = []
    try:
        base_pieces = int(base_pieces_per_unit or 1)
    except (TypeError, ValueError):
        base_pieces = 1
    base_pieces = max(base_pieces, 1)

    for option in pack_options or []:
        option_dict = option.model_dump() if hasattr(option, "model_dump") else dict(option)
        if not option_dict.get("id"):
            option_dict["id"] = str(uuid.uuid4())

        try:
            multiplier = int(option_dict.get("multiplier") or option_dict.get("pack_quantity") or 1)
        except (TypeError, ValueError):
            multiplier = 1
        multiplier = max(multiplier, 1)

        label = (option_dict.get("label") or "").strip()
        if not label:
            label = "Single" if multiplier == 1 else f"Pack of {multiplier}"

        option_dict["label"] = label
        option_dict["multiplier"] = multiplier
        option_dict["pack_quantity"] = multiplier
        option_dict["pieces_per_pack"] = base_pieces * multiplier
        option_dict["is_active"] = option_dict.get("is_active", True) is not False
        normalized.append(option_dict)

    return normalized

def normalize_color_options(color_options: List[ColorOption]) -> List[dict]:
    color_options = color_options or []
    logger.info(f"Normalizing {len(color_options)} color options")
    normalized = []
    for color in color_options:
        color_dict = color.model_dump() if hasattr(color, "model_dump") else color
        if not color_dict.get("id"):
            color_dict["id"] = str(uuid.uuid4())
        normalized.append(color_dict)
    return normalized

def normalize_flavor_options(flavor_options: List[FlavorOption]) -> List[dict]:
    flavor_options = flavor_options or []
    logger.info(f"Normalizing {len(flavor_options)} flavor options")
    normalized = []
    for flavor in flavor_options:
        flavor_dict = flavor.model_dump() if hasattr(flavor, "model_dump") else flavor
        if not flavor_dict.get("id"):
            flavor_dict["id"] = str(uuid.uuid4())
        normalized.append(flavor_dict)
    return normalized

def normalize_variants(variants: List[ProductVariant]) -> List[dict]:
    variants = variants or []
    logger.info(f"Normalizing {len(variants)} variants")
    normalized = []
    for variant in variants:
        variant_dict = variant.model_dump() if hasattr(variant, "model_dump") else variant
        if not variant_dict.get("id"):
            variant_dict["id"] = str(uuid.uuid4())
        if variant_dict.get("sale_price") == "":
            variant_dict["sale_price"] = None
        normalized.append(variant_dict)
    return normalized

def normalize_gift_packaging_options(options: List[GiftPackagingOption]) -> List[dict]:
    normalized = []
    for option in options:
        option_dict = option.model_dump() if hasattr(option, "model_dump") else option
        if not option_dict.get("id"):
            option_dict["id"] = str(uuid.uuid4())
        normalized.append(option_dict)
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


def _first_image(images: Optional[list]) -> list:
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
        "sell_as_pack": product.get("sell_as_pack", False),
        "pack_size": product.get("pack_size", 1),
        "pack_label": product.get("pack_label"),
        "base_pieces_per_unit": product.get("base_pieces_per_unit", 1),
        "pack_options": product.get("pack_options", []),
        "shop_priority": product.get("shop_priority", 0),
        "shop_order": product.get("shop_order", 0),
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
                "pack_option_id": variant.get("pack_option_id"),
                "stock": variant.get("stock"),
                "price_override": variant.get("price_override"),
                "sale_price": variant.get("sale_price"),
                "is_active": variant.get("is_active", True),
            }
            for variant in product.get("variants") or []
        ],
        "is_active": product.get("is_active", True),
        "is_featured": product.get("is_featured", False),
        "is_bestseller": product.get("is_bestseller", False),
        "is_new_arrival": product.get("is_new_arrival", False),
        "show_gift_packaging": product.get("show_gift_packaging", True),
        "gift_packaging_title": product.get("gift_packaging_title", "Add Gift Packaging"),
        "gift_packaging_description": product.get(
            "gift_packaging_description",
            "Premium gift wrap with ribbon and a custom note card",
        ),
        "gift_packaging_price": product.get("gift_packaging_price", 149),
        "gift_message_enabled": product.get("gift_message_enabled", True),
        "gift_packaging_options": product.get("gift_packaging_options", []),
        "created_at": product.get("created_at", ""),
    }


async def map_products_to_card_responses(products: List[dict]) -> List[dict]:
    enriched_products = await enrich_products(products)
    return [map_product_to_card_response(product) for product in enriched_products]


def generate_variant_combinations(color_options: list, flavor_options: list, existing_variants: list = None, pack_options: list = None) -> list:
    """Generate all possible variant combinations from colors, fragrances, and pack options."""
    existing_variants = existing_variants or []
    active_colors = [color for color in (color_options or []) if color.get("is_active", True) is not False]
    active_flavors = [flavor for flavor in (flavor_options or []) if flavor.get("is_active", True) is not False]
    active_packs = [pack for pack in (pack_options or []) if pack.get("is_active", True) is not False]
    color_values = active_colors or [None]
    flavor_values = active_flavors or [None]
    pack_values = active_packs or [None]
    existing_combos = {
        (v.get('color_id'), v.get('flavor_id'), v.get('pack_option_id'))
        for v in existing_variants
    }
    new_variants = []

    if not active_colors and not active_flavors and not active_packs:
        return existing_variants

    for color in color_values:
        for flavor in flavor_values:
            for pack in pack_values:
                combo = (
                    color.get('id') if color else None,
                    flavor.get('id') if flavor else None,
                    pack.get('id') if pack else None,
                )
                if combo in existing_combos:
                    continue
                new_variants.append({
                    'id': str(uuid.uuid4()),
                    'color_id': combo[0],
                    'color_name': color.get('name') if color else None,
                    'flavor_id': combo[1],
                    'flavor_name': flavor.get('name') if flavor else None,
                    'pack_option_id': combo[2],
                    'pack_label': pack.get('label') if pack else None,
                    'pack_multiplier': pack.get('multiplier') if pack else None,
                    'pieces_per_pack': pack.get('pieces_per_pack') if pack else None,
                    'sku': '',
                    'price_override': None,
                    'sale_price': None,
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
    
    products = await find_shop_ordered_products(query, {"_id": 0})
    
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

    products = await find_shop_ordered_products(query, PRODUCT_CARD_PROJECTION)

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


async def get_product_by_slug(slug: str):
    normalized_slug = generate_slug(slug)
    if not normalized_slug:
        raise HTTPException(status_code=404, detail="Product not found")

    product = await db.products.find_one({"slug": normalized_slug, "is_active": True}, {"_id": 0})
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
        "available_quantity": stock,
        "is_available": stock > 0,
        "variant": variant
    }


def _normalized_slug_or_error(value: str, entity_label: str) -> str:
    slug = generate_slug(value)
    if not slug:
        raise HTTPException(status_code=400, detail=f"{entity_label} slug must contain letters or numbers")
    return slug


async def _resolve_create_product_slug(product: ProductCreate) -> tuple[str, bool]:
    if (product.slug or "").strip():
        slug = _normalized_slug_or_error(product.slug, "Product")
        if await slug_exists(db.products, slug):
            raise HTTPException(status_code=409, detail="A product with this slug already exists")
        return slug, False

    slug = await allocate_unique_slug(db.products, product.name)
    if not slug:
        raise HTTPException(status_code=400, detail="Product name cannot generate a valid slug")
    return slug, True


async def create_product(product: ProductCreate):
    price = product.price
    discount_price = product.discount_price
    is_on_sale = product.is_on_sale

    discount_price = validate_sale_pricing_payload(price, discount_price, is_on_sale)
    pack_fields = normalize_pack_payload(False, 1, product.pack_label)
    base_pieces_per_unit = max(int(product.base_pieces_per_unit or 1), 1)

    validate_sale_dates(product.sale_start, product.sale_end)

    product_id = str(uuid.uuid4())

    await ensure_category_exists(product.category_id)
    product_slug, generated_slug = await _resolve_create_product_slug(product)
    
    # Generate IDs for color options
    color_options = normalize_color_options(product.color_options)
    
    # Generate IDs for flavor options
    flavor_options =  normalize_flavor_options(product.flavor_options)
    
    # Generate IDs for variants
    pack_options = normalize_pack_options(product.pack_options, base_pieces_per_unit)
    variants = normalize_variants(product.variants)
    gift_packaging_options = normalize_gift_packaging_options(product.gift_packaging_options)

    product_doc = {
        "id": product_id,
        "name": product.name,
        "slug": product_slug,
        "description": product.description,
        "short_description": product.short_description or "",
        "price": price,
        "discount_price": discount_price,
        "category_id": product.category_id,
        "subcategory": product.subcategory or "",
        "sku": product.sku or f"SKU-{product_id[:8].upper()}",
        "stock": product.stock,
        **pack_fields,
        "base_pieces_per_unit": base_pieces_per_unit,
        "pack_options": pack_options,
        "shop_priority": product.shop_priority,
        "shop_order": product.shop_order,
        "images": product.model_dump()["images"],
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
        "gift_packaging_title": product.gift_packaging_title,
        "gift_packaging_description": product.gift_packaging_description,
        "gift_packaging_price": product.gift_packaging_price,
        "gift_message_enabled": product.gift_message_enabled,
        "gift_packaging_options": gift_packaging_options,
        "care_instructions": product.care_instructions or "",
        "shipping_info": product.shipping_info or "",
        "materials": product.materials or "",
        "dimensions": product.dimensions or "",
        "burn_time": product.burn_time or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    try:
        await db.products.insert_one(product_doc)
    except DuplicateKeyError:
        if not generated_slug:
            raise HTTPException(status_code=409, detail="A product with this slug already exists")
        product_doc["slug"] = await allocate_unique_slug(db.products, product.name)
        try:
            await db.products.insert_one(product_doc)
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="Unable to allocate a unique product slug")

   
    
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
    effective_pack_label = product.pack_label if product.pack_label is not None else existing.get("pack_label")
    effective_base_pieces = product.base_pieces_per_unit if product.base_pieces_per_unit is not None else existing.get("base_pieces_per_unit", 1)

    normalized_discount_price = validate_sale_pricing_payload(
        effective_price,
        effective_discount_price,
        effective_is_on_sale,
        )

    effective_sale_start = product.sale_start if product.sale_start is not None else existing.get("sale_start")
    effective_sale_end = product.sale_end if product.sale_end is not None else existing.get("sale_end")

    validate_sale_dates(effective_sale_start, effective_sale_end)
    pack_fields = normalize_pack_payload(False, 1, effective_pack_label)

    if product.category_id is not None:
        await ensure_category_exists(product.category_id)

    submitted_fields = product.model_fields_set
    if "slug" in submitted_fields:
        requested_slug = (product.slug or "").strip()
        if requested_slug:
            normalized_slug = _normalized_slug_or_error(requested_slug, "Product")
            if await slug_exists(db.products, normalized_slug, exclude_id=product_id):
                raise HTTPException(status_code=409, detail="A product with this slug already exists")
            update_data["slug"] = normalized_slug
        elif not (existing.get("slug") or "").strip():
            generated_slug = await allocate_unique_slug(db.products, product.name or existing.get("name", ""))
            if not generated_slug:
                raise HTTPException(status_code=400, detail="Product name cannot generate a valid slug")
            update_data["slug"] = generated_slug
    
    for key, value in product.model_dump(exclude_unset=True).items():
        if key == "slug":
            continue
        if key in {"sell_as_pack", "pack_size", "pack_label"}:
            continue
        if key == "base_pieces_per_unit":
            update_data["base_pieces_per_unit"] = max(int(value or 1), 1)
        elif key == "pack_options":
            update_data["pack_options"] = normalize_pack_options(
                value or [],
                update_data.get("base_pieces_per_unit", effective_base_pieces),
            )
        elif key == 'color_options' and value:
            # Generate IDs for new color options
            update_data["color_options"] = normalize_color_options(value)
        elif key == 'flavor_options' and value:
            # Generate IDs for new flavor options
            update_data["flavor_options"] = normalize_flavor_options(value)
        elif key == 'variants' and value:
            # Generate IDs for new variants
            update_data["variants"] = normalize_variants(value)
        elif key == 'gift_packaging_options':
            update_data["gift_packaging_options"] = normalize_gift_packaging_options(value or [])
        else:
            update_data[key] = value
    
    if "is_on_sale" in update_data or "discount_price" in update_data or "price" in update_data:
        update_data["discount_price"] = normalized_discount_price

    if {"sell_as_pack", "pack_size", "pack_label"} & submitted_fields:
        update_data.update(pack_fields)

    if "base_pieces_per_unit" in submitted_fields and "pack_options" not in submitted_fields:
        update_data["pack_options"] = normalize_pack_options(
            existing.get("pack_options", []),
            update_data.get("base_pieces_per_unit", effective_base_pieces),
        )

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    try:
        updated = await db.products.find_one_and_update(
            {"id": product_id},
            {"$set": update_data},
            return_document=ReturnDocument.AFTER,
            projection={"_id": 0}
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A product with this slug already exists")

    if not updated:
        raise HTTPException(status_code=404, detail="Product not found")

    return (await enrich_products([updated]))[0]


async def update_product_shop_order(items: List[ProductShopOrderItem]):
    if not items:
        raise HTTPException(status_code=400, detail="No products provided")

    product_ids = [item.product_id for item in items]
    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(status_code=400, detail="Duplicate products are not allowed")

    existing_products = await db.products.find(
        {"id": {"$in": product_ids}},
        {"_id": 0, "id": 1},
    ).to_list(len(product_ids))
    existing_ids = {product["id"] for product in existing_products}
    missing_ids = [product_id for product_id in product_ids if product_id not in existing_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Product not found: {missing_ids[0]}")

    operations = [
        UpdateOne(
            {"id": item.product_id},
            {"$set": {"shop_order": item.shop_order}},
        )
        for item in items
    ]

    if operations:
        await db.products.bulk_write(operations, ordered=False)

    return {"message": "Shop order updated", "updated_count": len(operations)}


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
    pack_options = product.get('pack_options', [])
    existing_variants = product.get('variants', [])
    
    # Generate new combinations
    new_variants = generate_variant_combinations(color_options, flavor_options, existing_variants, pack_options)
    
    # Update product with new variants
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"variants": new_variants}}
    )
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    
    return (await enrich_products([updated]))[0]
