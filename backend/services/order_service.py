from fastapi import HTTPException
from typing import Optional, List, Dict
from models.order import OrderCreate, OrderStatusUpdate
from core.database import db
from core.constants import VALID_PAYMENT_METHODS, GIFT_PACKAGING_PRICE, MAX_LIMIT
from utils.helpers import format_phone, serialize_mongo_value, get_selected_variant
from email_service import send_order_placed_email, send_order_status_email, send_admin_new_order_alert
from whatsapp_service import send_order_status_whatsapp
import logging
from datetime import datetime, timezone
import uuid

logger = logging.getLogger(__name__)


def _get_base_price(product: dict) -> float:
    price = product["price"]
    if product.get("is_on_sale") and product.get("discount_price"):
        price = product["discount_price"]
    return price


async def _build_order_items(order: OrderCreate) -> tuple[List[dict], Dict[str, dict]]:
    items_with_details = []
    product_map = {}

    for item in order.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})

        if not product:
            raise HTTPException(status_code=404, detail=f"Product with ID {item.product_id} not found")

        product_map[item.product_id] = product
        variant_image = None
        variant_sku = None
        color_name = None
        flavor_name = None

        variants = product.get("variants", [])
        has_variants = len(variants) > 0

        selected_variant = get_selected_variant(
            product,
            item.variant_id,
            item.color_id,
            item.flavor_id,
        )

        price = _get_base_price(product)

        if has_variants:
            if not item.variant_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Variant selection is required for product {product['name']}"
                )

            if not selected_variant:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid variant selected for product {product['name']}"
                )

            if not selected_variant.get("is_active", True):
                raise HTTPException(
                    status_code=400,
                    detail=f"Selected variant is inactive for product {product['name']}"
                )

            variant_stock = selected_variant.get("stock", 0)
            if variant_stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']} variant"
                )

            if selected_variant.get("price_override") is not None:
                price = selected_variant["price_override"]

            variant_images = selected_variant.get("images", [])
            if variant_images:
                variant_image = variant_images[0]

            color_name = selected_variant.get("color_name") or selected_variant.get("color")
            flavor_name = selected_variant.get("flavor_name") or selected_variant.get("flavor")

            if item.color_id:
                for color_option in product.get("color_options", []):
                    if color_option.get("id") == item.color_id:
                        color_name = color_name or color_option.get("name")
                        color_images = color_option.get("images", [])
                        if not variant_image and color_images:
                            variant_image = color_images[0]
                        break

            if item.flavor_id and not flavor_name:
                for flavor_option in product.get("flavor_options", []):
                    if flavor_option.get("id") == item.flavor_id:
                        flavor_name = flavor_option.get("name")
                        break

            variant_sku = selected_variant.get("sku")
        else:
            if item.variant_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {product['name']} does not support variants"
                )

            available_stock = product.get("stock", 0)
            if available_stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']}"
                )

        items_with_details.append({
            "product_id": item.product_id,
            "variant_id": item.variant_id,
            "color_id": item.color_id,
            "color_name": color_name or "",
            "flavor_id": item.flavor_id,
            "flavor_name": flavor_name or "",
            "product_name": product["name"],
            "product_image": variant_image or (product["images"][0] if product.get("images") else ""),
            "original_price": product["price"],
            "price": price,
            "quantity": item.quantity,
            "line_total": price * item.quantity,
            "sku": variant_sku or product.get("sku", ""),
        })

    return items_with_details, product_map


async def _apply_stock_updates(items_with_details: List[dict], product_map: Dict[str, dict]) -> None:
    for item in items_with_details:
        product = product_map[item["product_id"]]
        variants = product.get("variants", [])
        has_variants = len(variants) > 0

        if has_variants:
            result = await db.products.update_one(
                {
                    "id": item["product_id"],
                    "variants": {
                        "$elemMatch": {
                            "id": item["variant_id"],
                            "is_active": True,
                            "stock": {"$gte": item["quantity"]},
                        }
                    },
                },
                {
                    "$inc": {
                        "variants.$.stock": -item["quantity"],
                    }
                }
            )

            if result.modified_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']} variant during final validation"
                )
        else:
            result = await db.products.update_one(
                {"id": item["product_id"], "stock": {"$gte": item["quantity"]}},
                {"$inc": {"stock": -item["quantity"]}}
            )

            if result.modified_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']} during final validation"
                )


async def _create_order_doc(order_id: str, order: OrderCreate, user: dict, items_with_details: List[dict], calculated_total: float) -> dict:
    final_total = calculated_total + (GIFT_PACKAGING_PRICE if order.gift_packaging else 0)
    formatted_phone = format_phone(order.billing_phone or "")

    order_doc = {
        "id": order_id,
        "user_id": user["id"],
        "items": items_with_details,
        "billing_name": order.billing_name,
        "billing_phone": formatted_phone,
        "billing_email": order.billing_email,
        "billing_address": order.billing_address,
        "billing_city": order.billing_city,
        "billing_postal_code": order.billing_postal_code,
        "payment_method": order.payment_method,
        "gift_packaging": order.gift_packaging,
        "total_price": final_total,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order_doc)

    created_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    created_order["user_name"] = user["name"]
    created_order["user_email"] = user["email"]
    created_order["billing_phone"] = format_phone(created_order.get("billing_phone") or "")
    return created_order


async def _send_order_notifications(created_order: dict) -> None:
    try:
        send_order_placed_email(created_order)
    except Exception as e:
        logger.error(f"Failed to send order confirmation email: {e}")

    try:
        send_admin_new_order_alert(created_order)
    except Exception as e:
        logger.error(f"Failed to send admin order alert email: {e}")

    try:
        send_order_status_whatsapp(created_order)
    except Exception as e:
        logger.error(f"Failed to send confirmed WhatsApp: {e}")


async def create_order(order: OrderCreate, user: dict):
    order_id = str(uuid.uuid4())

    if not order.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    if order.payment_method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Invalid payment method")

    items_with_details, product_map = await _build_order_items(order)

    calculated_total = sum(item["line_total"] for item in items_with_details)
    if not items_with_details:
        raise HTTPException(status_code=400, detail="No valid items in order")

    await _apply_stock_updates(items_with_details, product_map)
    created_order = await _create_order_doc(order_id, order, user, items_with_details, calculated_total)
    await _send_order_notifications(created_order)

    return serialize_mongo_value(created_order)

async def get_user_orders(user_id: str, limit: int = 100):
    limit = min(limit, MAX_LIMIT)
    orders = await db.orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)

    for order in orders:
        order["billing_phone"] = format_phone(order.get("billing_phone") or "")

    return serialize_mongo_value(orders)


async def get_order(order_id: str, user: dict):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    user_email = user.get("email")
    is_owner = order.get("user_id") == user.get("id")
    is_admin = bool(user_email and user_email == "mariso.store@gmail.com")

    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to view this order")
    
    order["billing_phone"] = format_phone(order.get("billing_phone") or "")
    return serialize_mongo_value(order)

async def get_all_orders(order_status: Optional[str] = None, limit: int = MAX_LIMIT):
    query = {}
    if order_status:
        query["status"] = order_status

    limit = min(limit, MAX_LIMIT)
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

    user_ids = list({order.get("user_id") for order in orders if order.get("user_id")})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(len(user_ids) or 1)
    user_map = {user["id"]: user for user in users}

    for order in orders:
        user = user_map.get(order.get("user_id"))
        if user:
            order["user_name"] = user["name"]
            order["user_email"] = user["email"]
        order["billing_phone"] = format_phone(order.get("billing_phone") or "")

    return serialize_mongo_value(orders)

async def update_order_status(order_id: str, status_update: OrderStatusUpdate, admin_id: Optional[str] = None):
    valid_statuses = ["pending", "confirmed", "packed", "shipped", "delivered"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = existing_order.get("status")
    logger.info(f"STATUS CHANGE: {old_status} → {status_update.status}")
    allowed_transitions = {
        "pending": ["confirmed"],
        "confirmed": ["packed"],
        "packed": ["shipped"],
        "shipped": ["delivered"],
        "delivered": [],
    }

    if status_update.status != old_status and status_update.status not in allowed_transitions.get(old_status, []):
        raise HTTPException(status_code=400, detail="Invalid status transition")
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": status_update.status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": admin_id,
            }
        }
    )
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
    if user:
        order['user_name'] = user['name']
        order['user_email'] = user['email']

    order["billing_phone"] = format_phone(order.get("billing_phone") or "")

    if old_status != status_update.status:
        logger.info("DEBUG status changed, applying notification strategy")

        status = status_update.status

        # EMAIL → send only for shipped and delivered from admin status updates.
        # Confirmed is already sent at checkout.
        if status in ["shipped", "delivered"]:
            try:
                send_order_status_email(order)
            except Exception as e:
                logger.error(f"Failed to send status email: {e}")

        # WHATSAPP → send for packed, shipped, and delivered.
        if status in ["packed", "shipped", "delivered"]:
            try:
                send_order_status_whatsapp(order)
            except Exception as e:
                logger.error(f"Failed to send status WhatsApp: {e}")

    else:
        logger.info("DEBUG status did not change, skipping notifications")
    
    return serialize_mongo_value(order)
