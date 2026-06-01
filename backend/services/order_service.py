from fastapi import HTTPException
from typing import Optional, List, Dict
from models.order import (
    CashfreeCheckoutPreview,
    CashfreeCheckoutCreate,
    OrderCancellationDecision,
    OrderCancellationRequest,
    OrderCreate,
    OrderStatusUpdate,
)
from models.coupon import CouponValidationItem, CouponValidationRequest, normalize_coupon_code
from core.database import db
from core.config import STOCK_RESERVATION_MINUTES
from core.constants import (
    CASHFREE_ORDER_STATUS_ACTIVE,
    CASHFREE_ORDER_STATUS_EXPIRED,
    CASHFREE_ORDER_STATUS_PAID,
    CASHFREE_ORDER_STATUS_TERMINATED,
    CASHFREE_ORDER_STATUS_TERMINATION_REQUESTED,
    FAILED_ORDER_STATUSES,
    GIFT_PACKAGING_PRICE,
    MAX_LIMIT,
    ORDER_STATUS_CONFIRMED,
    ORDER_STATUS_CANCELLED,
    ORDER_STATUS_DELIVERED,
    ORDER_STATUS_SHIPPED,
    ORDER_STATUS_PAID_STOCK_ISSUE,
    ORDER_STATUS_PAYMENT_EXPIRED,
    ORDER_STATUS_PAYMENT_FAILED,
    ORDER_STATUS_PENDING_PAYMENT,
    PAID_ORDER_STATUSES,
    PAYMENT_PROVIDER_CASHFREE,
    PAYMENT_PROVIDER_MANUAL_LEGACY,
    PAYMENT_STATUS_EXPIRED,
    PAYMENT_STATUS_FAILED,
    PAYMENT_STATUS_PAID,
    PAYMENT_STATUS_PENDING,
    PAYMENT_STATUS_REFUNDED,
    VALID_PAYMENT_METHODS,
)
from utils.helpers import format_phone, serialize_mongo_value, get_selected_variant
from services.admin_service import build_order_period_filter
from services.cashfree_service import create_cashfree_refund, get_cashfree_order, get_cashfree_refund
from services.coupon_service import increment_coupon_usage, validate_coupon
from services.shiprocket_service import (
    build_shiprocket_order_payload,
    check_shiprocket_serviceability,
    create_shiprocket_order,
    ensure_shiprocket_configured,
    normalize_shiprocket_order_response,
)
from email_service import (
    send_order_cancellation_confirmation_email,
    send_order_placed_email,
    send_order_status_email,
    send_admin_new_order_alert,
)
from whatsapp_service import send_feedback_reward_whatsapp, send_order_status_whatsapp
import logging
from datetime import datetime, timedelta, timezone
import secrets
import uuid

logger = logging.getLogger(__name__)
STALE_PENDING_SYNC_LIMIT = 25
CANCELLATION_WINDOW = timedelta(hours=1)
CART_FREE_SHIPPING_THRESHOLD = 3000
SHIPPING_UNAVAILABLE_MESSAGE = (
    "Shipping charges could not be calculated for this pincode. "
    "Please try another pincode or contact support."
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_cancellation_reason_summary(reasons: List[str], other_reason: Optional[str]) -> str:
    summary = []
    for reason in reasons:
        if reason == "Others" and other_reason:
            summary.append(f"Other: {other_reason}")
        else:
            summary.append(reason)
    return "; ".join(summary)


def _get_order_image_url(image) -> str:
    if isinstance(image, str):
        return image
    if isinstance(image, dict):
        return (
            image.get("thumb_url")
            or image.get("card_url")
            or image.get("detail_url")
            or image.get("url")
            or ""
        )
    return ""


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _payment_event(event_type: str, source: str = "system", **details) -> dict:
    return {
        "type": event_type,
        "source": source,
        "created_at": _now_iso(),
        **details,
    }


def _round_money(value: float) -> float:
    return round(max(float(value or 0), 0), 2)


def _get_pack_snapshot(product: dict) -> dict:
    sell_as_pack = bool(product.get("sell_as_pack", False))
    try:
        pack_size = int(product.get("pack_size") or 1)
    except (TypeError, ValueError):
        pack_size = 1

    if not sell_as_pack:
        pack_size = 1

    pack_label = (product.get("pack_label") or "").strip() or None
    return {
        "sell_as_pack": sell_as_pack,
        "pack_size": pack_size,
        "pack_label": pack_label,
    }


def _get_active_pack_options(product: dict) -> List[dict]:
    return [
        option for option in (product.get("pack_options") or [])
        if option.get("is_active", True) is not False
    ]


def _find_pack_option(product: dict, pack_option_id: Optional[str]) -> Optional[dict]:
    if not pack_option_id:
        return None
    return next(
        (
            option for option in _get_active_pack_options(product)
            if option.get("id") == pack_option_id
        ),
        None,
    )


def _get_pack_option_snapshot(product: dict, pack_option: Optional[dict], quantity: int) -> dict:
    try:
        base_pieces = int(product.get("base_pieces_per_unit") or 1)
    except (TypeError, ValueError):
        base_pieces = 1
    base_pieces = max(base_pieces, 1)

    if not pack_option:
        return {
            "selected_pack_id": None,
            "selected_pack_label": None,
            "pack_multiplier": 1,
            "base_pieces_per_unit": base_pieces,
            "pieces_per_pack": base_pieces,
            "total_pieces": quantity * base_pieces,
        }

    try:
        multiplier = int(pack_option.get("multiplier") or pack_option.get("pack_quantity") or 1)
    except (TypeError, ValueError):
        multiplier = 1
    multiplier = max(multiplier, 1)
    pieces_per_pack = int(pack_option.get("pieces_per_pack") or base_pieces * multiplier)

    return {
        "selected_pack_id": pack_option.get("id"),
        "selected_pack_label": pack_option.get("label") or ("Single" if multiplier == 1 else f"Pack of {multiplier}"),
        "pack_multiplier": multiplier,
        "base_pieces_per_unit": base_pieces,
        "pieces_per_pack": pieces_per_pack,
        "total_pieces": quantity * pieces_per_pack,
    }


def _get_effective_quantity(item: dict) -> int:
    quantity = int(item.get("quantity") or 0)
    if quantity <= 0:
        return 0

    if item.get("selected_pack_id"):
        return quantity

    effective_quantity = item.get("effective_quantity", item.get("total_units"))
    if effective_quantity is not None:
        try:
            normalized = int(effective_quantity)
        except (TypeError, ValueError):
            normalized = 0
        return normalized if normalized > 0 else quantity

    if item.get("sell_as_pack"):
        try:
            pack_size = int(item.get("pack_size") or 1)
        except (TypeError, ValueError):
            pack_size = 1
        return quantity * max(pack_size, 1)

    return quantity


def _item_gift_packaging_total(items_with_details: List[dict]) -> float:
    return _round_money(sum(
        item.get("gift_packaging", {}).get("line_total", 0)
        for item in items_with_details
        if item.get("gift_packaging")
    ))


def _has_item_gift_packaging(items_with_details: List[dict]) -> bool:
    return any(item.get("gift_packaging") for item in items_with_details)


def _gift_packaging_total(order_payload, items_with_details: List[dict]) -> float:
    if _has_item_gift_packaging(items_with_details):
        return _item_gift_packaging_total(items_with_details)
    return _round_money(GIFT_PACKAGING_PRICE if order_payload.gift_packaging else 0)


async def _generate_tracking_token() -> str:
    while True:
        token = secrets.token_urlsafe(32)
        existing_order = await db.orders.find_one({"tracking_token": token}, {"_id": 1})
        if not existing_order:
            return token


async def _generate_feedback_token() -> str:
    while True:
        token = secrets.token_urlsafe(32)
        existing_order = await db.orders.find_one({"feedback_token": token}, {"_id": 1})
        if not existing_order:
            return token


async def ensure_order_tracking_token(order: dict) -> str:
    existing_token = order.get("tracking_token")
    if existing_token:
        return existing_token

    order_id = order.get("id")
    if not order_id:
        raise HTTPException(status_code=400, detail="Order is missing an id")

    token = await _generate_tracking_token()
    await db.orders.update_one(
        {
            "id": order_id,
            "$or": [
                {"tracking_token": {"$exists": False}},
                {"tracking_token": None},
                {"tracking_token": ""},
            ],
        },
        {"$set": {"tracking_token": token, "updated_at": _now_iso()}},
    )

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0, "tracking_token": 1})
    return updated_order.get("tracking_token") or token


async def ensure_order_feedback_token(order: dict) -> str:
    existing_token = order.get("feedback_token")
    if existing_token:
        return existing_token

    order_id = order.get("id")
    if not order_id:
        raise HTTPException(status_code=400, detail="Order is missing an id")

    existing_submission = await db.feedback_submissions.find_one(
        {
            "order_id": order_id,
            "feedback_token": {"$exists": True, "$nin": [None, ""]},
        },
        {"_id": 0, "feedback_token": 1},
    )
    token = (
        str(existing_submission.get("feedback_token")).strip()
        if existing_submission and existing_submission.get("feedback_token")
        else await _generate_feedback_token()
    )
    await db.orders.update_one(
        {
            "id": order_id,
            "$or": [
                {"feedback_token": {"$exists": False}},
                {"feedback_token": None},
                {"feedback_token": ""},
            ],
        },
        {"$set": {"feedback_token": token, "updated_at": _now_iso()}},
    )

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0, "feedback_token": 1})
    if not updated_order:
        raise HTTPException(status_code=404, detail="Order not found")
    return updated_order.get("feedback_token") or token


def _build_tracking_steps(status: Optional[str]) -> List[dict]:
    steps = [
        ("pending", "Order placed"),
        ("confirmed", "Confirmed"),
        ("packed", "Packed"),
        ("shipped", "Shipped"),
        ("delivered", "Delivered"),
    ]
    normalized_status = status or "pending"
    status_index = next((index for index, (key, _) in enumerate(steps) if key == normalized_status), 0)

    return [
        {
            "key": key,
            "label": label,
            "completed": index <= status_index,
            "current": index == status_index,
        }
        for index, (key, label) in enumerate(steps)
    ]


def _redact_order_for_tracking(order: dict) -> dict:
    normalized_order = _normalize_order_payment_defaults(order)
    items = [
        {
            "product_name": item.get("product_name"),
            "product_image": item.get("product_image"),
            "quantity": item.get("quantity"),
            "color_name": item.get("color_name") or "",
            "flavor_name": item.get("flavor_name") or "",
        }
        for item in normalized_order.get("items", [])
    ]

    return {
        "order_number": str(normalized_order.get("id", ""))[:8].upper(),
        "status": normalized_order.get("status"),
        "payment_status": normalized_order.get("payment_status"),
        "payment_method": normalized_order.get("payment_method"),
        "created_at": normalized_order.get("created_at"),
        "updated_at": normalized_order.get("updated_at"),
        "items": items,
        "item_count": sum(int(item.get("quantity") or 0) for item in items),
        "total_price": normalized_order.get("total_price"),
        "tracking_steps": _build_tracking_steps(normalized_order.get("status")),
    }


async def record_cashfree_webhook_event(
    order_id: str,
    event_type: Optional[str],
    payment_status: Optional[str],
    cf_payment_id: Optional[str],
    idempotency_key: Optional[str],
    info: Optional[dict] = None,
) -> Optional[dict]:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return None

    duplicate = False
    for event in order.get("payment_events", []):
        if idempotency_key and event.get("webhook_idempotency_key") == idempotency_key:
            duplicate = True
            break
        if (
            cf_payment_id
            and event.get("cf_payment_id") == cf_payment_id
            and event.get("webhook_type") == event_type
        ):
            duplicate = True
            break

    event_info = info or {}
    await db.orders.update_one(
        {"id": order_id},
        {
            "$push": {
                "payment_events": _payment_event(
                    "cashfree_webhook_duplicate" if duplicate else "cashfree_webhook_received",
                    "webhook",
                    webhook_type=event_type,
                    payment_status=payment_status,
                    cf_payment_id=cf_payment_id,
                    webhook_idempotency_key=idempotency_key,
                    webhook_event_time=event_info.get("event_time"),
                    webhook_version=event_info.get("webhook_version"),
                    webhook_attempt=event_info.get("webhook_attempt"),
                    duplicate=duplicate,
                )
            },
            "$set": {"updated_at": _now_iso()},
        }
    )

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    normalized_order = _normalize_order_payment_defaults(updated_order)
    normalized_order["cashfree_webhook_duplicate"] = duplicate
    return serialize_mongo_value(normalized_order)


def _unpaid_unconfirmed_order_filter(order_id: str) -> dict:
    return {
        "id": order_id,
        "payment_status": {"$ne": PAYMENT_STATUS_PAID},
        "stock_deducted": {"$ne": True},
        "status": {"$ne": ORDER_STATUS_CONFIRMED},
    }


async def _fetch_normalized_order(order_id: str, fallback: Optional[dict] = None) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return _normalize_order_payment_defaults(order or fallback or {"id": order_id})


def _is_paid_or_confirmed(order: dict) -> bool:
    return (
        order.get("payment_status") == PAYMENT_STATUS_PAID
        or order.get("stock_deducted") is True
        or order.get("status") == ORDER_STATUS_CONFIRMED
    )


def _get_base_price(product: dict) -> float:
    price = product["price"]
    if product.get("is_on_sale") and product.get("discount_price"):
        price = product["discount_price"]
    return price


def _infer_legacy_payment_status(order: dict) -> str:
    status = order.get("status")
    if status in PAID_ORDER_STATUSES:
        return PAYMENT_STATUS_PAID
    if status == ORDER_STATUS_PAYMENT_EXPIRED:
        return PAYMENT_STATUS_EXPIRED
    if status in FAILED_ORDER_STATUSES:
        return PAYMENT_STATUS_FAILED
    return PAYMENT_STATUS_PENDING


def _infer_legacy_stock_deducted(order: dict) -> bool:
    status = order.get("status")
    if status in FAILED_ORDER_STATUSES or status in {ORDER_STATUS_PENDING_PAYMENT, ORDER_STATUS_PAID_STOCK_ISSUE}:
        return False
    return True


def _normalize_order_payment_defaults(order: dict) -> dict:
    if not order:
        return order

    if not order.get("payment_provider"):
        order["payment_provider"] = order.get("payment_method") or PAYMENT_PROVIDER_MANUAL_LEGACY

    if not order.get("payment_status"):
        order["payment_status"] = _infer_legacy_payment_status(order)

    if "stock_deducted" not in order:
        order["stock_deducted"] = _infer_legacy_stock_deducted(order)

    order.setdefault("cashfree_order_id", None)
    order.setdefault("cashfree_cf_order_id", None)
    order.setdefault("cashfree_payment_session_id", None)
    order.setdefault("cashfree_payment_id", None)
    order.setdefault("cashfree_order_status", None)
    order.setdefault("cashfree_payment_status", None)
    order.setdefault("paid_at", None)
    order.setdefault("stock_reserved", False)
    order.setdefault("stock_reserved_at", None)
    order.setdefault("stock_reserved_until", None)
    order.setdefault("stock_released_at", None)
    order.setdefault("stock_deducted_at", None)
    order.setdefault("customer_email_sent_at", None)
    order.setdefault("admin_email_sent_at", None)
    order.setdefault("whatsapp_sent_at", None)
    order.setdefault("feedback_whatsapp_sent_at", None)
    order.setdefault("coupon_code", None)
    order.setdefault("coupon_id", None)
    order.setdefault("coupon_discount_amount", 0)
    order.setdefault("eligible_subtotal", None)
    order.setdefault("subtotal_before_discount", order.get("total_price"))
    order.setdefault("total_after_discount", order.get("total_price"))
    order.setdefault("coupon_snapshot", None)
    order.setdefault("coupon_usage_recorded", False)
    order.setdefault("payment_events", [])
    order.setdefault("billing_address_2", None)
    order.setdefault("billing_state", None)
    order.setdefault("billing_country", None)
    order.setdefault("cancellation_status", "none")
    order.setdefault("cancellation_requested_at", None)
    order.setdefault("cancellation_reason", None)
    order.setdefault("cancellation_reasons", [])
    order.setdefault("cancellation_reason_other", None)
    order.setdefault("cancellation_admin_note", None)
    order.setdefault("cancelled_at", None)
    order.setdefault("cancelled_by", None)
    order.setdefault("refund_status", "none")
    order.setdefault("refund_amount", None)
    order.setdefault("refund_reason", None)
    order.setdefault("refund_note", None)
    order.setdefault("refund_id", None)
    order.setdefault("cf_refund_id", None)
    order.setdefault("cashfree_refund_status", None)
    order.setdefault("refund_initiated_at", None)
    order.setdefault("refund_completed_at", None)
    order.setdefault("refund_failed_reason", None)
    order.setdefault("refund_last_synced_at", None)
    order.setdefault("refund_webhook_received_at", None)
    order.setdefault("stock_restored_at", None)
    order.setdefault("shipping_provider", None)
    order.setdefault("shipping_charge", 0)
    order.setdefault("shipping_free_reason", None)
    order.setdefault("shipping_rate_source", None)
    order.setdefault("shipping_breakdown", [])
    order.setdefault("shiprocket_order_id", None)
    order.setdefault("shiprocket_shipment_id", None)
    order.setdefault("shiprocket_awb_code", None)
    order.setdefault("shiprocket_courier_name", None)
    order.setdefault("shiprocket_tracking_url", None)
    order.setdefault("shipment_status", None)
    order.setdefault("shipment_created_at", None)
    order.setdefault("shipment_error", None)
    order.setdefault(
        "gift_packaging_amount",
        GIFT_PACKAGING_PRICE if order.get("gift_packaging") else 0,
    )

    return order


async def _build_order_items(order: OrderCreate) -> tuple[List[dict], Dict[str, dict]]:
    items_with_details = []
    product_map = {}

    for item in order.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})

        if not product:
            raise HTTPException(status_code=404, detail=f"Product with ID {item.product_id} not found")

        if not product.get("is_active", True):
            raise HTTPException(
                status_code=400,
                detail=f"Product {product.get('name', item.product_id)} is inactive and cannot be purchased",
            )

        category_id = product.get("category_id")
        if category_id:
            category = await db.categories.find_one({"id": category_id}, {"_id": 0, "is_active": 1})
            if category and not category.get("is_active", True):
                raise HTTPException(
                    status_code=400,
                    detail=f"Product {product.get('name', item.product_id)} belongs to an inactive category and cannot be purchased",
                )

        product_map[item.product_id] = product
        variant_image = None
        variant_sku = None
        color_name = None
        flavor_name = None
        pack_option = None

        variants = product.get("variants", [])
        has_variants = len(variants) > 0
        active_pack_options = _get_active_pack_options(product)
        if active_pack_options:
            pack_option = _find_pack_option(product, item.selected_pack_id)
            if not pack_option:
                raise HTTPException(
                    status_code=400,
                    detail=f"Pack selection is required for product {product['name']}"
                )
            if not has_variants:
                raise HTTPException(
                    status_code=400,
                    detail=f"Pack variants are not configured for product {product['name']}"
                )

        selected_variant = get_selected_variant(
            product,
            item.variant_id,
            item.color_id,
            item.flavor_id,
            item.selected_pack_id,
        )

        price = _get_base_price(product)
        pack_snapshot = _get_pack_snapshot(product)
        pack_option_snapshot = _get_pack_option_snapshot(product, pack_option, item.quantity)
        effective_quantity = item.quantity

        if has_variants:
            if not item.variant_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Variant selection is required for product {product['name']}"
                )

            submitted_variant = next(
                (variant for variant in variants if variant.get("id") == item.variant_id),
                None,
            )
            if submitted_variant and not submitted_variant.get("is_active", True):
                raise HTTPException(
                    status_code=400,
                    detail=f"Selected variant is inactive for product {product['name']}"
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
            if variant_stock < effective_quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']} variant"
                )

            if selected_variant.get("price_override") is not None:
                price = selected_variant["price_override"]
            if selected_variant.get("sale_price") is not None:
                price = selected_variant["sale_price"]

            variant_images = selected_variant.get("images", [])
            if variant_images:
                variant_image = variant_images[0]
            if not variant_image and pack_option:
                pack_images = pack_option.get("images") or []
                pack_image = pack_option.get("image")
                if pack_images:
                    variant_image = pack_images[0]
                elif pack_image:
                    variant_image = pack_image

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
            if available_stock < effective_quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']}"
                )

        gift_packaging = None
        if item.gift_packaging and item.gift_packaging.selected:
            if product.get("show_gift_packaging", True) is not True:
                raise HTTPException(
                    status_code=400,
                    detail=f"Gift packaging is not available for product {product['name']}"
                )
            if item.gift_packaging.quantity > item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Gift packaging quantity exceeds product quantity for {product['name']}"
                )

            option_id = item.gift_packaging.option_id
            selected_option = None
            if option_id:
                selected_option = next(
                    (
                        option for option in product.get("gift_packaging_options", [])
                        if option.get("id") == option_id and option.get("is_active", True) is not False
                    ),
                    None,
                )
                if not selected_option:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Selected gift packaging option is not available for product {product['name']}"
                    )

            gift_quantity = item.gift_packaging.quantity
            gift_price = _round_money(
                selected_option.get("price") if selected_option else product.get("gift_packaging_price", GIFT_PACKAGING_PRICE)
            )
            message_enabled = (
                selected_option.get("message_enabled", True)
                if selected_option
                else product.get("gift_message_enabled", True)
            )
            message = item.gift_packaging.message.strip() if message_enabled else ""
            gift_packaging = {
                "selected": True,
                "option_id": selected_option.get("id") if selected_option else None,
                "title": selected_option.get("title") if selected_option else product.get("gift_packaging_title", "Add Gift Packaging"),
                "description": selected_option.get("description", "") if selected_option else product.get(
                    "gift_packaging_description", "Premium gift wrap with ribbon and a custom note card"
                ),
                "unit_price": gift_price,
                "quantity": gift_quantity,
                "message_enabled": message_enabled,
                "message": message,
                "line_total": _round_money(gift_price * gift_quantity),
            }

        items_with_details.append({
            "product_id": item.product_id,
            "category_id": product.get("category_id", ""),
            "variant_id": item.variant_id,
            "color_id": item.color_id,
            "color_name": color_name or "",
            "flavor_id": item.flavor_id,
            "flavor_name": flavor_name or "",
            **pack_option_snapshot,
            "product_name": product["name"],
            "product_image": _get_order_image_url(
                variant_image or (product["images"][0] if product.get("images") else "")
            ),
            "original_price": product["price"],
            "selected_combination_price": selected_variant.get("price_override") if selected_variant else None,
            "selected_combination_sale_price": selected_variant.get("sale_price") if selected_variant else None,
            "price": price,
            "quantity": item.quantity,
            **pack_snapshot,
            "effective_quantity": effective_quantity,
            "total_units": effective_quantity,
            "line_total": price * item.quantity,
            "sku": variant_sku or product.get("sku", ""),
            "gift_packaging": gift_packaging,
        })

    return items_with_details, product_map


async def _calculate_coupon_adjustment(
    order_payload: CashfreeCheckoutCreate,
    user: dict,
    items_with_details: List[dict],
    calculated_total: float,
) -> dict:
    gift_packaging_total = _gift_packaging_total(order_payload, items_with_details)
    base_amounts = {
        "coupon_code": None,
        "coupon_id": None,
        "coupon_discount_amount": 0,
        "eligible_subtotal": None,
        "subtotal_before_discount": _round_money(calculated_total),
        "total_after_discount": _round_money(
            calculated_total + gift_packaging_total
        ),
        "coupon_snapshot": None,
    }

    coupon_code = (order_payload.coupon_code or "").strip()
    if not coupon_code:
        return base_amounts

    validation_items = [
        CouponValidationItem(
            product_id=item["product_id"],
            category_id=item.get("category_id") or "",
            quantity=item["quantity"],
            price=item["price"],
        )
        for item in items_with_details
    ]

    validation = await validate_coupon(
        CouponValidationRequest(
            code=normalize_coupon_code(coupon_code),
            items=validation_items,
            user_id=user.get("id"),
            email=order_payload.billing_email,
            phone=order_payload.billing_phone,
        ),
        current_user=user,
    )

    if not validation.get("valid"):
        raise HTTPException(
            status_code=400,
            detail="Coupon is no longer valid. Please remove it and try again.",
        )

    discounted_items_total = _round_money(validation.get("final_total", calculated_total))
    final_payable = _round_money(
        discounted_items_total + gift_packaging_total
    )

    return {
        "coupon_code": validation.get("code"),
        "coupon_id": validation.get("coupon_id"),
        "coupon_discount_amount": _round_money(validation.get("discount_amount", 0)),
        "eligible_subtotal": _round_money(validation.get("eligible_subtotal", 0)),
        "subtotal_before_discount": _round_money(validation.get("cart_subtotal", calculated_total)),
        "total_after_discount": final_payable,
        "coupon_snapshot": validation.get("coupon_snapshot"),
    }


def _product_has_free_shipping(product: Optional[dict]) -> bool:
    if not product:
        return False
    return bool(product.get("free_shipping", product.get("show_free_shipping", True)))


def _extract_shipping_charge(serviceability: dict) -> Optional[float]:
    for key in ("shipping_charge", "rate", "freight_charge", "courier_charge"):
        value = serviceability.get(key)
        if value in (None, ""):
            continue
        try:
            charge = float(value)
        except (TypeError, ValueError):
            continue
        if charge >= 0:
            return _round_money(charge)
    return None


def _positive_float_or_none(value) -> Optional[float]:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _get_product_package_details(product: Optional[dict]) -> dict:
    product = product or {}
    return {
        "weight_kg": _positive_float_or_none(product.get("weight")),
        "length_cm": _positive_float_or_none(product.get("length")),
        "breadth_cm": _positive_float_or_none(product.get("breadth")),
        "height_cm": _positive_float_or_none(product.get("height")),
    }


async def calculate_order_shipping(
    *,
    items_with_details: List[dict],
    destination_pincode: str,
    discounted_product_subtotal: float,
    product_map: Optional[Dict[str, dict]] = None,
) -> dict:
    products_by_id = dict(product_map or {})

    if _round_money(discounted_product_subtotal) >= CART_FREE_SHIPPING_THRESHOLD:
        return {
            "shipping_charge": 0,
            "shipping_label": "Free",
            "shipping_free_reason": "cart_threshold",
            "shipping_rate_source": None,
            "shipping_breakdown": [
                {
                    "product_id": item.get("product_id"),
                    "variant_id": item.get("variant_id"),
                    "quantity": _get_effective_quantity(item),
                    "free_shipping": _product_has_free_shipping(products_by_id.get(item.get("product_id"))),
                    "shipping_charge": 0,
                }
                for item in items_with_details
            ],
        }

    missing_product_ids = [
        item.get("product_id")
        for item in items_with_details
        if item.get("product_id") and item.get("product_id") not in products_by_id
    ]
    if missing_product_ids:
        products = await db.products.find(
            {"id": {"$in": list(set(missing_product_ids))}},
            {"_id": 0},
        ).to_list(len(set(missing_product_ids)))
        products_by_id.update({product["id"]: product for product in products})

    total_shipping = 0
    breakdown = []
    charged_any = False

    for item in items_with_details:
        product_id = item.get("product_id")
        product = products_by_id.get(product_id)
        quantity = max(_get_effective_quantity(item), 1)
        is_free_shipping = _product_has_free_shipping(product)

        item_shipping = 0
        if not is_free_shipping:
            serviceability = check_shiprocket_serviceability(
                pincode=destination_pincode,
                product_id=product_id,
                quantity=quantity,
                **_get_product_package_details(product),
            )
            if serviceability.get("enabled") is False or not serviceability.get("available"):
                raise HTTPException(status_code=400, detail=SHIPPING_UNAVAILABLE_MESSAGE)

            shipping_charge = _extract_shipping_charge(serviceability)
            if shipping_charge is None:
                raise HTTPException(status_code=400, detail=SHIPPING_UNAVAILABLE_MESSAGE)

            item_shipping = shipping_charge
            charged_any = True
            total_shipping = _round_money(total_shipping + item_shipping)

        breakdown.append({
            "product_id": product_id,
            "variant_id": item.get("variant_id"),
            "quantity": quantity,
            "free_shipping": is_free_shipping,
            "shipping_charge": item_shipping,
        })

    return {
        "shipping_charge": _round_money(total_shipping),
        "shipping_label": "Free" if total_shipping == 0 else None,
        "shipping_free_reason": "product" if total_shipping == 0 else None,
        "shipping_rate_source": "shiprocket" if charged_any else None,
        "shipping_breakdown": breakdown,
    }


async def preview_checkout_shipping(order_payload: CashfreeCheckoutPreview, user: dict):
    if not order_payload.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    items_with_details, product_map = await _build_order_items(order_payload)
    calculated_total = sum(item["line_total"] for item in items_with_details)
    if not items_with_details:
        raise HTTPException(status_code=400, detail="No valid items in order")

    coupon_amounts = await _calculate_coupon_adjustment(
        order_payload,
        user or {},
        items_with_details,
        calculated_total,
    )
    discounted_product_subtotal = _round_money(
        calculated_total - coupon_amounts["coupon_discount_amount"]
    )
    shipping_amounts = await calculate_order_shipping(
        items_with_details=items_with_details,
        destination_pincode=order_payload.billing_postal_code,
        discounted_product_subtotal=discounted_product_subtotal,
        product_map=product_map,
    )
    gift_packaging_total = _gift_packaging_total(order_payload, items_with_details)
    total_payable = _round_money(
        coupon_amounts["total_after_discount"] + shipping_amounts["shipping_charge"]
    )

    return {
        "subtotal": _round_money(calculated_total),
        "discount": coupon_amounts["coupon_discount_amount"],
        "discounted_subtotal": discounted_product_subtotal,
        "gift_packaging_amount": gift_packaging_total,
        "total_after_discount": coupon_amounts["total_after_discount"],
        "shipping_charge": shipping_amounts["shipping_charge"],
        "shipping_label": shipping_amounts["shipping_label"] or (
            "Paid" if shipping_amounts["shipping_charge"] > 0 else "Free"
        ),
        "shipping_free_reason": shipping_amounts["shipping_free_reason"],
        "shipping_rate_source": shipping_amounts["shipping_rate_source"],
        "total_payable": total_payable,
        "shipping_breakdown": shipping_amounts["shipping_breakdown"],
    }


async def _apply_stock_updates(items_with_details: List[dict], product_map: Dict[str, dict]) -> None:
    for item in items_with_details:
        product = product_map[item["product_id"]]
        variants = product.get("variants", [])
        has_variants = len(variants) > 0
        effective_quantity = _get_effective_quantity(item)

        if has_variants:
            result = await db.products.update_one(
                {
                    "id": item["product_id"],
                    "variants": {
                        "$elemMatch": {
                            "id": item["variant_id"],
                            "is_active": True,
                            "stock": {"$gte": effective_quantity},
                        }
                    },
                },
                {
                    "$inc": {
                        "variants.$.stock": -effective_quantity,
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
                {"id": item["product_id"], "stock": {"$gte": effective_quantity}},
                {"$inc": {"stock": -effective_quantity}}
            )

            if result.modified_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']} during final validation"
                )


async def _build_product_map_for_order_items(items: List[dict]) -> Dict[str, dict]:
    product_ids = list({item.get("product_id") for item in items if item.get("product_id")})
    products = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(len(product_ids) or 1)
    return {product["id"]: product for product in products}


async def _rollback_stock_reservations(applied_items: List[dict]) -> None:
    for item in reversed(applied_items):
        effective_quantity = _get_effective_quantity(item)
        if item.get("variant_id"):
            await db.products.update_one(
                {"id": item["product_id"], "variants.id": item["variant_id"]},
                {
                    "$inc": {
                        "variants.$.stock": effective_quantity,
                        "variants.$.reserved_stock": -effective_quantity,
                    }
                }
            )
        else:
            await db.products.update_one(
                {"id": item["product_id"]},
                {
                    "$inc": {
                        "stock": effective_quantity,
                        "reserved_stock": -effective_quantity,
                    }
                }
            )


async def reserve_stock_for_order_items(items: List[dict], product_map: Dict[str, dict]) -> None:
    applied_items = []

    for item in items:
        product = product_map[item["product_id"]]
        variants = product.get("variants", [])
        has_variants = len(variants) > 0
        effective_quantity = _get_effective_quantity(item)

        if has_variants:
            result = await db.products.update_one(
                {
                    "id": item["product_id"],
                    "variants": {
                        "$elemMatch": {
                            "id": item["variant_id"],
                            "is_active": True,
                            "stock": {"$gte": effective_quantity},
                        }
                    },
                },
                {
                    "$inc": {
                        "variants.$.stock": -effective_quantity,
                        "variants.$.reserved_stock": effective_quantity,
                    }
                }
            )
        else:
            result = await db.products.update_one(
                {"id": item["product_id"], "stock": {"$gte": effective_quantity}},
                {
                    "$inc": {
                        "stock": -effective_quantity,
                        "reserved_stock": effective_quantity,
                    }
                }
            )

        if result.modified_count == 0:
            await _rollback_stock_reservations(applied_items)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock to reserve product {product['name']}"
            )

        applied_items.append(item)


async def _rollback_reserved_stock_move(item: dict, reserved_delta: int, stock_delta: int) -> bool:
    quantity = _get_effective_quantity(item)
    if quantity <= 0:
        return True

    if item.get("variant_id"):
        result = await db.products.update_one(
            {"id": item["product_id"], "variants.id": item["variant_id"]},
            {
                "$inc": {
                    "variants.$.reserved_stock": -reserved_delta * quantity,
                    "variants.$.stock": -stock_delta * quantity,
                }
            }
        )
    else:
        result = await db.products.update_one(
            {"id": item["product_id"]},
            {
                "$inc": {
                    "reserved_stock": -reserved_delta * quantity,
                    "stock": -stock_delta * quantity,
                }
            }
        )

    return result.modified_count > 0


async def _move_reserved_stock(order: dict, reserved_delta: int, stock_delta: int) -> None:
    applied_items = []

    for item in order.get("items", []):
        quantity = _get_effective_quantity(item)
        if quantity <= 0:
            continue

        try:
            if item.get("variant_id"):
                query = {
                    "id": item["product_id"],
                    "variants": {
                        "$elemMatch": {
                            "id": item["variant_id"],
                        }
                    },
                }
                if reserved_delta < 0:
                    query["variants"]["$elemMatch"]["reserved_stock"] = {"$gte": quantity}

                result = await db.products.update_one(
                    query,
                    {
                        "$inc": {
                            "variants.$.reserved_stock": reserved_delta * quantity,
                            "variants.$.stock": stock_delta * quantity,
                        }
                    }
                )
            else:
                query = {"id": item["product_id"]}
                if reserved_delta < 0:
                    query["reserved_stock"] = {"$gte": quantity}

                result = await db.products.update_one(
                    query,
                    {
                        "$inc": {
                            "reserved_stock": reserved_delta * quantity,
                            "stock": stock_delta * quantity,
                        }
                    }
                )

            if result.modified_count == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Reserved stock movement failed for product {item.get('product_name') or item.get('product_id')}"
                )

            applied_items.append(item)
        except Exception:
            rollback_failed = False
            for applied_item in reversed(applied_items):
                try:
                    rolled_back = await _rollback_reserved_stock_move(applied_item, reserved_delta, stock_delta)
                    if not rolled_back:
                        logger.error(
                            "Reserved stock rollback did not modify product_id=%s variant_id=%s order_id=%s",
                            applied_item.get("product_id"),
                            applied_item.get("variant_id"),
                            order.get("id"),
                        )
                except Exception as rollback_error:
                    logger.error(
                        "Reserved stock rollback failed for product_id=%s variant_id=%s order_id=%s: %s",
                        applied_item.get("product_id"),
                        applied_item.get("variant_id"),
                        order.get("id"),
                        rollback_error,
                    )
                    rollback_failed = True
            if rollback_failed:
                logger.error("Re-raising original reserved stock movement error after rollback failure")
            raise


async def release_reserved_stock(order: dict, source: str = "system") -> dict:
    order_id = order.get("id")
    if not order_id or not order.get("stock_reserved"):
        return order

    now = _now_iso()
    claim_result = await db.orders.update_one(
        {
            **_unpaid_unconfirmed_order_filter(order_id),
            "stock_reserved": True,
            "stock_reservation_transition": {"$exists": False},
        },
        {
            "$set": {
                "stock_reservation_transition": "releasing",
                "updated_at": now,
            }
        }
    )

    if claim_result.modified_count == 0:
        return await _fetch_normalized_order(order_id, order)

    try:
        await _move_reserved_stock(order, reserved_delta=-1, stock_delta=1)
    except Exception:
        await db.orders.update_one(
            {"id": order_id, "stock_reservation_transition": "releasing"},
            {
                "$unset": {"stock_reservation_transition": ""},
                "$set": {"updated_at": _now_iso()},
                "$push": {
                    "payment_events": _payment_event("stock_reservation_release_failed", source)
                },
            }
        )
        raise

    released_at = _now_iso()
    await db.orders.update_one(
        {"id": order_id, "stock_reservation_transition": "releasing"},
        {
            "$set": {
                "stock_reserved": False,
                "stock_released_at": released_at,
                "updated_at": released_at,
            },
            "$unset": {"stock_reservation_transition": ""},
            "$push": {
                "payment_events": _payment_event("stock_reservation_released", source)
            },
        }
    )

    return await _fetch_normalized_order(order_id, order)


async def _release_stock_for_terminal_payment(order: dict, source: str) -> tuple[dict, dict]:
    try:
        return await release_reserved_stock(order, source), {}
    except HTTPException as exc:
        if exc.status_code != 409:
            raise

        failed_at = _now_iso()
        error_detail = str(exc.detail)
        logger.warning(
            "Reserved stock could not be safely released for terminal payment order_id=%s "
            "source=%s detail=%s; recording reconciliation requirement",
            order.get("id"),
            source,
            error_detail,
        )
        current_order = await _fetch_normalized_order(order["id"], order)
        return current_order, {
            "stock_release_failed": True,
            "stock_release_error": error_detail,
            "stock_release_failed_at": failed_at,
        }


async def confirm_reserved_stock(order: dict, source: str = "system") -> tuple[dict, bool]:
    order_id = order.get("id")
    if not order_id:
        return order, False
    if order.get("stock_deducted"):
        return order, True
    if not order.get("stock_reserved"):
        return order, False

    now = _now_iso()
    claim_result = await db.orders.update_one(
        {
            "id": order_id,
            "stock_reserved": True,
            "stock_deducted": {"$ne": True},
            "stock_reservation_transition": {"$exists": False},
        },
        {
            "$set": {
                "stock_reservation_transition": "confirming",
                "updated_at": now,
            }
        }
    )

    if claim_result.modified_count == 0:
        normalized = await _fetch_normalized_order(order_id, order)
        return normalized, bool(normalized.get("stock_deducted"))

    try:
        await _move_reserved_stock(order, reserved_delta=-1, stock_delta=0)
    except Exception:
        await db.orders.update_one(
            {"id": order_id, "stock_reservation_transition": "confirming"},
            {
                "$unset": {"stock_reservation_transition": ""},
                "$set": {"updated_at": _now_iso()},
                "$push": {
                    "payment_events": _payment_event("stock_reservation_confirm_failed", source)
                },
            }
        )
        raise

    deducted_at = _now_iso()
    await db.orders.update_one(
        {"id": order_id, "stock_reservation_transition": "confirming"},
        {
            "$set": {
                "stock_reserved": False,
                "stock_deducted": True,
                "stock_deducted_at": deducted_at,
                "updated_at": deducted_at,
            },
            "$unset": {"stock_reservation_transition": ""},
            "$push": {
                "payment_events": _payment_event("stock_reservation_confirmed", source)
            },
        }
    )

    return await _fetch_normalized_order(order_id, order), True


async def _create_order_doc(order_id: str, order: OrderCreate, user: dict, items_with_details: List[dict], calculated_total: float) -> dict:
    gift_packaging_total = _gift_packaging_total(order, items_with_details)
    final_total = _round_money(calculated_total + gift_packaging_total)
    formatted_phone = format_phone(order.billing_phone or "")
    created_at = _now_iso()
    tracking_token = await _generate_tracking_token()

    order_doc = {
        "id": order_id,
        "tracking_token": tracking_token,
        "user_id": user["id"],
        "items": items_with_details,
        "billing_name": order.billing_name,
        "billing_phone": formatted_phone,
        "billing_email": order.billing_email,
        "billing_address": order.billing_address,
        "billing_address_2": order.billing_address_2,
        "billing_city": order.billing_city,
        "billing_state": order.billing_state,
        "billing_country": order.billing_country,
        "billing_postal_code": order.billing_postal_code,
        "payment_method": order.payment_method,
        "payment_provider": order.payment_method,
        "payment_status": PAYMENT_STATUS_PAID,
        "cashfree_order_id": None,
        "cashfree_cf_order_id": None,
        "cashfree_payment_session_id": None,
        "cashfree_payment_id": None,
        "cashfree_order_status": None,
        "cashfree_payment_status": None,
        "paid_at": created_at,
        "stock_deducted": True,
        "stock_deducted_at": created_at,
        "customer_email_sent_at": None,
        "admin_email_sent_at": None,
        "whatsapp_sent_at": None,
        "feedback_whatsapp_sent_at": None,
        "payment_events": [],
        "cancellation_status": "none",
        "cancellation_requested_at": None,
        "cancellation_reason": None,
        "cancellation_reasons": [],
        "cancellation_reason_other": None,
        "cancellation_admin_note": None,
        "cancelled_at": None,
        "cancelled_by": None,
        "refund_status": "none",
        "refund_amount": None,
        "refund_reason": None,
        "refund_note": None,
        "refund_id": None,
        "cf_refund_id": None,
        "cashfree_refund_status": None,
        "refund_initiated_at": None,
        "refund_completed_at": None,
        "refund_failed_reason": None,
        "refund_last_synced_at": None,
        "refund_webhook_received_at": None,
        "stock_restored_at": None,
        "shipping_provider": None,
        "shiprocket_order_id": None,
        "shiprocket_shipment_id": None,
        "shiprocket_awb_code": None,
        "shiprocket_courier_name": None,
        "shiprocket_tracking_url": None,
        "shipment_status": None,
        "shipment_created_at": None,
        "shipment_error": None,
        "gift_packaging": bool(order.gift_packaging or _has_item_gift_packaging(items_with_details)),
        "gift_packaging_amount": gift_packaging_total,
        "total_price": final_total,
        "status": ORDER_STATUS_CONFIRMED,
        "created_at": created_at,
        "updated_at": created_at,
    }
    await db.orders.insert_one(order_doc)

    created_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    created_order["user_name"] = user["name"]
    created_order["user_email"] = user["email"]
    created_order["billing_phone"] = format_phone(created_order.get("billing_phone") or "")
    return created_order


async def _send_order_notifications(created_order: dict) -> dict:
    notification_fields = {}
    created_order["tracking_token"] = await ensure_order_tracking_token(created_order)

    try:
        send_order_placed_email(created_order)
    except Exception as e:
        logger.error(f"Failed to send order confirmation email: {e}")

    try:
        send_admin_new_order_alert(created_order)
    except Exception as e:
        logger.error(f"Failed to send admin order alert email: {e}")

    try:
        whatsapp_result = send_order_status_whatsapp(created_order)
        if whatsapp_result and whatsapp_result.get("success"):
            notification_fields["whatsapp_sent_at"] = _now_iso()
    except Exception as e:
        logger.error(f"Failed to send confirmed WhatsApp: {e}")

    return notification_fields


async def create_order(order: OrderCreate, user: dict, *, allow_manual_paid: bool = False):
    if not allow_manual_paid or str(user.get("role", "")).lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="Paid confirmed orders can only be created manually by an admin; use Cashfree checkout",
        )

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
    notification_fields = await _send_order_notifications(created_order)

    if notification_fields:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": notification_fields}
        )
        created_order.update(notification_fields)

    return serialize_mongo_value(_normalize_order_payment_defaults(created_order))


async def create_pending_cashfree_order(order_payload: CashfreeCheckoutCreate, user: dict):
    # Release any existing pending orders for this user to prevent multiple concurrent stock locks
    try:
        existing_pending_orders = await db.orders.find(
            {
                "user_id": user["id"],
                "status": ORDER_STATUS_PENDING_PAYMENT,
                "stock_reserved": True
            }
        ).to_list(None)

        for old_order in existing_pending_orders:
            try:
                await release_reserved_stock(old_order, source="new_checkout_override")
                await db.orders.update_one(
                    {"id": old_order["id"]},
                    {
                        "$set": {
                            "payment_status": PAYMENT_STATUS_EXPIRED,
                            "status": ORDER_STATUS_PAYMENT_EXPIRED,
                            "updated_at": _now_iso()
                        }
                    }
                )
                logger.info(f"Released previous pending payment order {old_order['id']} for user {user['id']}")
            except Exception as e:
                logger.error(f"Failed to release previous pending order {old_order.get('id')}: {e}")
    except Exception as e:
        logger.error(f"Failed to query existing pending orders for user {user.get('id')}: {e}")

    order_id = str(uuid.uuid4())

    if not order_payload.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    items_with_details, product_map = await _build_order_items(order_payload)
    calculated_total = sum(item["line_total"] for item in items_with_details)
    if not items_with_details:
        raise HTTPException(status_code=400, detail="No valid items in order")

    coupon_amounts = await _calculate_coupon_adjustment(
        order_payload,
        user,
        items_with_details,
        calculated_total,
    )
    discounted_product_subtotal = _round_money(
        calculated_total - coupon_amounts["coupon_discount_amount"]
    )
    shipping_amounts = await calculate_order_shipping(
        items_with_details=items_with_details,
        destination_pincode=order_payload.billing_postal_code,
        discounted_product_subtotal=discounted_product_subtotal,
        product_map=product_map,
    )

    await reserve_stock_for_order_items(items_with_details, product_map)

    now_dt = datetime.now(timezone.utc)
    created_at = now_dt.isoformat()
    reserved_until = (now_dt + timedelta(minutes=STOCK_RESERVATION_MINUTES)).isoformat()
    final_total = _round_money(
        coupon_amounts["total_after_discount"] + shipping_amounts["shipping_charge"]
    )
    gift_packaging_total = _gift_packaging_total(order_payload, items_with_details)
    formatted_phone = format_phone(order_payload.billing_phone or "")
    tracking_token = await _generate_tracking_token()

    order_doc = {
        "id": order_id,
        "tracking_token": tracking_token,
        "user_id": user["id"],
        "items": items_with_details,
        "billing_name": order_payload.billing_name,
        "billing_phone": formatted_phone,
        "billing_email": order_payload.billing_email,
        "billing_address": order_payload.billing_address,
        "billing_address_2": order_payload.billing_address_2,
        "billing_city": order_payload.billing_city,
        "billing_state": order_payload.billing_state,
        "billing_country": order_payload.billing_country,
        "billing_postal_code": order_payload.billing_postal_code,
        "payment_method": PAYMENT_PROVIDER_CASHFREE,
        "payment_provider": PAYMENT_PROVIDER_CASHFREE,
        "payment_status": PAYMENT_STATUS_PENDING,
        "cashfree_order_id": None,
        "cashfree_cf_order_id": None,
        "cashfree_payment_session_id": None,
        "cashfree_payment_id": None,
        "cashfree_order_status": None,
        "cashfree_payment_status": None,
        "paid_at": None,
        "stock_reserved": True,
        "stock_reserved_at": created_at,
        "stock_reserved_until": reserved_until,
        "stock_released_at": None,
        "stock_deducted": False,
        "stock_deducted_at": None,
        "customer_email_sent_at": None,
        "admin_email_sent_at": None,
        "whatsapp_sent_at": None,
        "feedback_whatsapp_sent_at": None,
        "payment_events": [
            _payment_event(
                "stock_reserved",
                "create_session",
                stock_reserved_until=reserved_until,
            )
        ],
        "cancellation_status": "none",
        "cancellation_requested_at": None,
        "cancellation_reason": None,
        "cancellation_reasons": [],
        "cancellation_reason_other": None,
        "cancellation_admin_note": None,
        "cancelled_at": None,
        "cancelled_by": None,
        "refund_status": "none",
        "refund_amount": None,
        "refund_reason": None,
        "refund_note": None,
        "refund_id": None,
        "cf_refund_id": None,
        "cashfree_refund_status": None,
        "refund_initiated_at": None,
        "refund_completed_at": None,
        "refund_failed_reason": None,
        "refund_last_synced_at": None,
        "refund_webhook_received_at": None,
        "stock_restored_at": None,
        "shipping_provider": None,
        "shipping_charge": shipping_amounts["shipping_charge"],
        "shipping_free_reason": shipping_amounts["shipping_free_reason"],
        "shipping_rate_source": shipping_amounts["shipping_rate_source"],
        "shipping_breakdown": shipping_amounts["shipping_breakdown"],
        "shiprocket_order_id": None,
        "shiprocket_shipment_id": None,
        "shiprocket_awb_code": None,
        "shiprocket_courier_name": None,
        "shiprocket_tracking_url": None,
        "shipment_status": None,
        "shipment_created_at": None,
        "shipment_error": None,
        "gift_packaging": bool(order_payload.gift_packaging or _has_item_gift_packaging(items_with_details)),
        "gift_packaging_amount": gift_packaging_total,
        "coupon_code": coupon_amounts["coupon_code"],
        "coupon_id": coupon_amounts["coupon_id"],
        "coupon_discount_amount": coupon_amounts["coupon_discount_amount"],
        "eligible_subtotal": coupon_amounts["eligible_subtotal"],
        "subtotal_before_discount": coupon_amounts["subtotal_before_discount"],
        "total_after_discount": coupon_amounts["total_after_discount"],
        "coupon_snapshot": coupon_amounts["coupon_snapshot"],
        "coupon_usage_recorded": False,
        "total_price": final_total,
        "status": ORDER_STATUS_PENDING_PAYMENT,
        "created_at": created_at,
        "updated_at": created_at,
    }
    try:
        await db.orders.insert_one(order_doc)
    except Exception:
        await _rollback_stock_reservations(items_with_details)
        raise

    created_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    created_order["user_name"] = user["name"]
    created_order["user_email"] = user["email"]
    created_order["billing_phone"] = format_phone(created_order.get("billing_phone") or "")
    return serialize_mongo_value(_normalize_order_payment_defaults(created_order))


async def attach_cashfree_session(order_id: str, cashfree_data: dict):
    now = _now_iso()
    update_fields = {
        "cashfree_order_id": cashfree_data.get("cashfree_order_id") or cashfree_data.get("order_id"),
        "cashfree_cf_order_id": cashfree_data.get("cashfree_cf_order_id") or cashfree_data.get("cf_order_id"),
        "cashfree_payment_session_id": cashfree_data.get("payment_session_id"),
        "cashfree_order_status": cashfree_data.get("cashfree_order_status") or cashfree_data.get("order_status"),
        "updated_at": now,
    }
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_fields,
            "$push": {
                "payment_events": _payment_event(
                    "cashfree_session_attached",
                    "create_session",
                    cashfree_order_status=update_fields["cashfree_order_status"],
                    cashfree_cf_order_id=update_fields["cashfree_cf_order_id"],
                )
            },
        }
    )
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(order))


async def _record_coupon_usage_once(order_id: str, source: str) -> None:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not (order.get("coupon_id") or order.get("coupon_code")):
        return

    result = await db.orders.update_one(
        {
            "id": order_id,
            "payment_status": PAYMENT_STATUS_PAID,
            "coupon_usage_recorded": {"$ne": True},
            "$or": [
                {"coupon_id": {"$type": "string", "$gt": ""}},
                {"coupon_code": {"$type": "string", "$gt": ""}},
            ],
        },
        {
            "$set": {
                "coupon_usage_recorded": True,
                "coupon_usage_recorded_at": _now_iso(),
                "updated_at": _now_iso(),
            },
            "$push": {
                "payment_events": _payment_event(
                    "coupon_usage_recorded",
                    source,
                    coupon_id=order.get("coupon_id"),
                    coupon_code=order.get("coupon_code"),
                )
            },
        },
    )
    if result.modified_count == 0:
        return

    incremented = await increment_coupon_usage(
        coupon_id=order.get("coupon_id"),
        coupon_code=order.get("coupon_code"),
    )
    if not incremented:
        logger.error(
            "Coupon usage claim recorded but coupon increment failed for order_id=%s coupon_id=%s coupon_code=%s",
            order_id,
            order.get("coupon_id"),
            order.get("coupon_code"),
        )


def _is_reservation_valid(order: dict) -> bool:
    if not order.get("stock_reserved"):
        return False
    reserved_until = _parse_iso_datetime(order.get("stock_reserved_until"))
    if not reserved_until:
        return False
    return reserved_until >= datetime.now(timezone.utc)


def _is_local_reservation_expired(order: dict) -> bool:
    if order.get("status") != ORDER_STATUS_PENDING_PAYMENT:
        return False
    if not order.get("stock_reserved"):
        return False
    reserved_until = _parse_iso_datetime(order.get("stock_reserved_until"))
    if not reserved_until:
        return False
    return reserved_until < datetime.now(timezone.utc)


async def _expire_local_reservation(order: dict, metadata_update: dict, source: str) -> dict:
    order_id = order["id"]
    if _is_paid_or_confirmed(order):
        return serialize_mongo_value(_normalize_order_payment_defaults(order))

    order, release_failure_fields = await _release_stock_for_terminal_payment(order, source)
    if _is_paid_or_confirmed(order) or order.get("stock_reservation_transition"):
        return serialize_mongo_value(_normalize_order_payment_defaults(order))

    now = _now_iso()
    release_update = release_failure_fields or {
        "stock_reserved": False,
        "stock_released_at": order.get("stock_released_at") or now,
    }
    result = await db.orders.update_one(
        _unpaid_unconfirmed_order_filter(order_id),
        {
            "$set": {
                **metadata_update,
                "payment_status": PAYMENT_STATUS_EXPIRED,
                "status": ORDER_STATUS_PAYMENT_EXPIRED,
                **release_update,
                "updated_at": now,
            },
            "$push": {
                "payment_events": _payment_event(
                    "local_reservation_expired",
                    source,
                    stock_reserved_until=order.get("stock_reserved_until"),
                )
            },
        }
    )
    if result.modified_count == 0:
        current_order = await _fetch_normalized_order(order_id, order)
        return serialize_mongo_value(current_order)

    expired_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(expired_order))


async def _mark_paid_stock_issue(order: dict, cashfree_data: dict, source: str) -> dict:
    # Do not release reserved stock in the PAID stock issue path. Payment succeeded,
    # so this must be handled by admin/manual reconciliation instead of the generic
    # failed/expired release flow.

    now = _now_iso()
    result = await db.orders.update_one(
        {
            "id": order["id"],
            "payment_status": {"$ne": PAYMENT_STATUS_PAID},
            "stock_deducted": {"$ne": True},
            "status": {"$ne": ORDER_STATUS_CONFIRMED},
        },
        {
            "$set": {
                "payment_status": PAYMENT_STATUS_PAID,
                "status": ORDER_STATUS_PAID_STOCK_ISSUE,
                "cashfree_order_status": cashfree_data.get("cashfree_order_status") or cashfree_data.get("order_status"),
                "cashfree_payment_status": cashfree_data.get("cashfree_payment_status"),
                "paid_at": order.get("paid_at") or now,
                "stock_deducted": False,
                "updated_at": now,
            },
            "$push": {
                "payment_events": _payment_event(
                    "paid_stock_issue",
                    source,
                    cashfree_order_status=cashfree_data.get("cashfree_order_status") or cashfree_data.get("order_status"),
                )
            },
        }
    )
    if result.modified_count == 0:
        updated_order = await _fetch_normalized_order(order["id"], order)
        await _record_coupon_usage_once(order["id"], source)
        return serialize_mongo_value(updated_order)

    await _record_coupon_usage_once(order["id"], source)
    updated_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(updated_order))


async def _send_paid_cashfree_notifications_once(order_id: str, source: str) -> None:
    result = await db.orders.update_one(
        {
            "id": order_id,
            "payment_status": PAYMENT_STATUS_PAID,
            "status": ORDER_STATUS_CONFIRMED,
            "payment_events.type": {"$ne": "paid_notifications_attempted"},
        },
        {
            "$push": {
                "payment_events": _payment_event("paid_notifications_attempted", source)
            }
        }
    )
    if result.modified_count == 0:
        return

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return
    order["tracking_token"] = await ensure_order_tracking_token(order)

    try:
        send_order_placed_email(order)
    except Exception as e:
        logger.error(f"Failed to send Cashfree paid order confirmation email: {e}")

    try:
        send_admin_new_order_alert(order)
    except Exception as e:
        logger.error(f"Failed to send Cashfree paid admin order alert email: {e}")

    try:
        whatsapp_result = send_order_status_whatsapp(order)
        if whatsapp_result and whatsapp_result.get("success"):
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"whatsapp_sent_at": _now_iso()}}
            )
    except Exception as e:
        logger.error(f"Failed to send Cashfree paid WhatsApp: {e}")


async def finalize_paid_cashfree_order(order_id: str, cashfree_data: dict, source: str = "status"):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order = _normalize_order_payment_defaults(order)
    cashfree_order_status = cashfree_data.get("cashfree_order_status") or cashfree_data.get("order_status")
    cashfree_payment_status = cashfree_data.get("cashfree_payment_status")

    metadata_update = {
        "cashfree_order_id": cashfree_data.get("cashfree_order_id") or cashfree_data.get("order_id") or order.get("cashfree_order_id"),
        "cashfree_cf_order_id": cashfree_data.get("cashfree_cf_order_id") or cashfree_data.get("cf_order_id") or order.get("cashfree_cf_order_id"),
        "cashfree_order_status": cashfree_order_status,
        "cashfree_payment_status": cashfree_payment_status,
        "updated_at": _now_iso(),
    }

    if cashfree_order_status == CASHFREE_ORDER_STATUS_PAID:
        if order.get("payment_status") == PAYMENT_STATUS_PAID and order.get("stock_deducted"):
            await db.orders.update_one(
                {
                    "id": order_id,
                    "payment_status": PAYMENT_STATUS_PAID,
                    "stock_deducted": True,
                    "status": ORDER_STATUS_CONFIRMED,
                },
                {
                    "$set": metadata_update,
                    "$push": {
                        "payment_events": _payment_event("cashfree_paid_noop", source)
                    },
                }
            )
            current_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
            await _record_coupon_usage_once(order_id, source)
            await _send_paid_cashfree_notifications_once(order_id, source)
            return serialize_mongo_value(_normalize_order_payment_defaults(current_order))

        if not _is_reservation_valid(order):
            current_order = await _fetch_normalized_order(order_id, order)
            if current_order.get("payment_status") == PAYMENT_STATUS_PAID and current_order.get("stock_deducted"):
                await _record_coupon_usage_once(order_id, source)
                await _send_paid_cashfree_notifications_once(order_id, source)
                return serialize_mongo_value(current_order)
            if current_order.get("stock_reservation_transition"):
                return serialize_mongo_value(current_order)
            return await _mark_paid_stock_issue(current_order, cashfree_data, source)

        order, confirmed = await confirm_reserved_stock(order, source)
        if not confirmed:
            current_order = await _fetch_normalized_order(order_id, order)
            if current_order.get("payment_status") == PAYMENT_STATUS_PAID and current_order.get("stock_deducted"):
                await _record_coupon_usage_once(order_id, source)
                await _send_paid_cashfree_notifications_once(order_id, source)
                return serialize_mongo_value(current_order)
            if current_order.get("stock_reservation_transition"):
                return serialize_mongo_value(current_order)
            return await _mark_paid_stock_issue(current_order, cashfree_data, source)

        now = _now_iso()
        result = await db.orders.update_one(
            {
                "id": order_id,
                "stock_deducted": True,
                "status": {"$ne": ORDER_STATUS_CONFIRMED},
            },
            {
                "$set": {
                    **metadata_update,
                    "payment_status": PAYMENT_STATUS_PAID,
                    "status": ORDER_STATUS_CONFIRMED,
                    "paid_at": order.get("paid_at") or now,
                },
                "$push": {
                    "payment_events": _payment_event(
                        "cashfree_payment_paid",
                        source,
                        cashfree_order_status=cashfree_order_status,
                    )
                },
            }
        )
        if result.modified_count == 0:
            current_order = await _fetch_normalized_order(order_id, order)
            if current_order.get("payment_status") == PAYMENT_STATUS_PAID and current_order.get("stock_deducted"):
                await _record_coupon_usage_once(order_id, source)
                await _send_paid_cashfree_notifications_once(order_id, source)
                return serialize_mongo_value(current_order)
            return await _mark_paid_stock_issue(current_order, cashfree_data, source)

        await _record_coupon_usage_once(order_id, source)
        await _send_paid_cashfree_notifications_once(order_id, source)
    elif cashfree_order_status == CASHFREE_ORDER_STATUS_EXPIRED:
        if _is_paid_or_confirmed(order):
            return serialize_mongo_value(order)
        order, release_failure_fields = await _release_stock_for_terminal_payment(order, source)
        if _is_paid_or_confirmed(order) or order.get("stock_reservation_transition"):
            return serialize_mongo_value(_normalize_order_payment_defaults(order))

        result = await db.orders.update_one(
            _unpaid_unconfirmed_order_filter(order_id),
            {
                "$set": {
                    **metadata_update,
                    **release_failure_fields,
                    "payment_status": PAYMENT_STATUS_EXPIRED,
                    "status": ORDER_STATUS_PAYMENT_EXPIRED,
                },
                "$push": {
                    "payment_events": _payment_event("cashfree_payment_expired", source)
                },
            }
        )
        if result.modified_count == 0:
            current_order = await _fetch_normalized_order(order_id, order)
            return serialize_mongo_value(current_order)
    elif cashfree_order_status == CASHFREE_ORDER_STATUS_TERMINATED:
        if _is_paid_or_confirmed(order):
            return serialize_mongo_value(order)
        order, release_failure_fields = await _release_stock_for_terminal_payment(order, source)
        if _is_paid_or_confirmed(order) or order.get("stock_reservation_transition"):
            return serialize_mongo_value(_normalize_order_payment_defaults(order))

        result = await db.orders.update_one(
            _unpaid_unconfirmed_order_filter(order_id),
            {
                "$set": {
                    **metadata_update,
                    **release_failure_fields,
                    "payment_status": PAYMENT_STATUS_FAILED,
                    "status": ORDER_STATUS_PAYMENT_FAILED,
                },
                "$push": {
                    "payment_events": _payment_event("cashfree_payment_failed", source)
                },
            }
        )
        if result.modified_count == 0:
            current_order = await _fetch_normalized_order(order_id, order)
            return serialize_mongo_value(current_order)
    elif cashfree_order_status in {CASHFREE_ORDER_STATUS_ACTIVE, CASHFREE_ORDER_STATUS_TERMINATION_REQUESTED}:
        if not _is_paid_or_confirmed(order) and _is_local_reservation_expired(order):
            return await _expire_local_reservation(order, metadata_update, source)
        if order.get("status") in {ORDER_STATUS_PAYMENT_EXPIRED, ORDER_STATUS_PAYMENT_FAILED}:
            return serialize_mongo_value(order)

        result = await db.orders.update_one(
            _unpaid_unconfirmed_order_filter(order_id),
            {
                "$set": {
                    **metadata_update,
                    "payment_status": PAYMENT_STATUS_PENDING,
                    "status": ORDER_STATUS_PENDING_PAYMENT,
                },
                "$push": {
                    "payment_events": _payment_event(
                        "cashfree_payment_pending",
                        source,
                        cashfree_order_status=cashfree_order_status,
                    )
                },
            }
        )
        if result.modified_count == 0:
            current_order = await _fetch_normalized_order(order_id, order)
            return serialize_mongo_value(current_order)
    else:
        await db.orders.update_one(
            {"id": order_id},
            {
                "$set": metadata_update,
                "$push": {
                    "payment_events": _payment_event(
                        "cashfree_payment_status_unknown",
                        source,
                        cashfree_order_status=cashfree_order_status,
                    )
                },
            }
        )

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(updated_order))


async def mark_cashfree_order_failed(order_id: str, reason: str, source: str = "create_session"):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order = _normalize_order_payment_defaults(order)
    if _is_paid_or_confirmed(order):
        return serialize_mongo_value(order)

    if order.get("stock_reserved"):
        order = await release_reserved_stock(order, source)
        if _is_paid_or_confirmed(order) or order.get("stock_reservation_transition"):
            return serialize_mongo_value(_normalize_order_payment_defaults(order))

    now = _now_iso()
    result = await db.orders.update_one(
        _unpaid_unconfirmed_order_filter(order_id),
        {
            "$set": {
                "payment_status": PAYMENT_STATUS_FAILED,
                "status": ORDER_STATUS_PAYMENT_FAILED,
                "updated_at": now,
            },
            "$push": {
                "payment_events": _payment_event(
                    "cashfree_order_failed",
                    source,
                    reason=reason,
                )
            },
        }
    )
    if result.modified_count == 0:
        current_order = await _fetch_normalized_order(order_id, order)
        return serialize_mongo_value(current_order)

    failed_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(failed_order))


async def sync_stale_pending_orders(extra_filter: Optional[dict] = None, limit: int = STALE_PENDING_SYNC_LIMIT) -> None:
    query = {
        "payment_provider": PAYMENT_PROVIDER_CASHFREE,
        "payment_status": PAYMENT_STATUS_PENDING,
        "status": ORDER_STATUS_PENDING_PAYMENT,
        "stock_reserved_until": {"$lte": _now_iso()},
    }
    if extra_filter:
        query = {"$and": [query, extra_filter]}

    stale_orders = await db.orders.find(
        query,
        {"_id": 0, "id": 1},
    ).sort("stock_reserved_until", 1).to_list(min(max(limit, 1), STALE_PENDING_SYNC_LIMIT))

    for stale_order in stale_orders:
        order_id = stale_order.get("id")
        if not order_id:
            continue
        try:
            cashfree_data = get_cashfree_order(order_id)
            await finalize_paid_cashfree_order(order_id, cashfree_data, source="stale_pending_sync")
        except HTTPException as exc:
            logger.warning(
                "Cashfree stale pending sync deferred for order_id=%s status_code=%s detail=%s",
                order_id,
                exc.status_code,
                exc.detail,
            )
        except Exception:
            logger.exception("Cashfree stale pending sync failed for order_id=%s", order_id)


async def request_order_cancellation(
    order_id: str,
    request: OrderCancellationRequest,
    user_id: str,
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this order")

    order = _normalize_order_payment_defaults(order)
    if order.get("status") != ORDER_STATUS_CONFIRMED:
        raise HTTPException(status_code=400, detail="Only confirmed orders can be cancelled")
    if order.get("payment_status") != PAYMENT_STATUS_PAID:
        raise HTTPException(status_code=400, detail="Only paid orders can be cancelled")
    if order.get("cancellation_status") in {"requested", "approved"}:
        raise HTTPException(status_code=400, detail="A cancellation request already exists for this order")

    created_at = _parse_iso_datetime(order.get("created_at"))
    if not created_at or datetime.now(timezone.utc) - created_at > CANCELLATION_WINDOW:
        raise HTTPException(status_code=400, detail="Cancellation window expired. Please contact support.")

    now = _now_iso()
    cancellation_reason_summary = _format_cancellation_reason_summary(
        request.cancellation_reasons,
        request.cancellation_reason_other,
    )
    result = await db.orders.update_one(
        {
            "id": order_id,
            "user_id": user_id,
            "status": ORDER_STATUS_CONFIRMED,
            "$or": [
                {"payment_status": PAYMENT_STATUS_PAID},
                {"payment_status": {"$exists": False}},
            ],
            "cancellation_status": {"$nin": ["requested", "approved"]},
        },
        {
            "$set": {
                "cancellation_status": "requested",
                "cancellation_requested_at": now,
                "cancellation_reason": cancellation_reason_summary,
                "cancellation_reasons": request.cancellation_reasons,
                "cancellation_reason_other": request.cancellation_reason_other,
                "cancellation_admin_note": None,
                "updated_at": now,
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Order is no longer eligible for cancellation")

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(updated_order))


async def _restore_cancelled_order_stock(order: dict) -> dict:
    if not order.get("stock_deducted") or order.get("stock_restored_at"):
        return order

    order_id = order["id"]
    now = _now_iso()
    claim = await db.orders.update_one(
        {
            "id": order_id,
            "cancellation_status": "approved",
            "stock_deducted": {"$ne": False},
            "stock_restored_at": {"$in": [None, ""]},
            "cancellation_stock_restore_transition": {"$exists": False},
        },
        {
            "$set": {
                "cancellation_stock_restore_transition": "restoring",
                "updated_at": now,
            }
        },
    )
    if claim.modified_count == 0:
        current_order = await _fetch_normalized_order(order_id, order)
        if current_order.get("stock_restored_at"):
            return current_order
        raise HTTPException(status_code=409, detail="Cancellation stock restoration is already in progress")

    try:
        await _move_reserved_stock(order, reserved_delta=0, stock_delta=1)
    except Exception:
        await db.orders.update_one(
            {"id": order_id, "cancellation_stock_restore_transition": "restoring"},
            {
                "$unset": {"cancellation_stock_restore_transition": ""},
                "$set": {"updated_at": _now_iso()},
            },
        )
        raise

    restored_at = _now_iso()
    await db.orders.update_one(
        {"id": order_id, "cancellation_stock_restore_transition": "restoring"},
        {
            "$set": {
                "stock_restored_at": restored_at,
                "updated_at": restored_at,
            },
            "$unset": {"cancellation_stock_restore_transition": ""},
        },
    )
    return await _fetch_normalized_order(order_id, order)


async def approve_order_cancellation(
    order_id: str,
    decision: OrderCancellationDecision,
    admin_id: str,
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order = _normalize_order_payment_defaults(order)
    should_send_confirmation_email = False

    can_retry_stock_restore = (
        order.get("cancellation_status") == "approved"
        and order.get("status") == ORDER_STATUS_CANCELLED
        and order.get("stock_deducted")
        and not order.get("stock_restored_at")
    )
    if not can_retry_stock_restore:
        if order.get("cancellation_status") != "requested":
            raise HTTPException(status_code=400, detail="Cancellation request is not pending approval")
        if order.get("status") in {ORDER_STATUS_SHIPPED, ORDER_STATUS_DELIVERED}:
            raise HTTPException(status_code=400, detail="Shipped or delivered orders cannot be cancelled")

        now = _now_iso()
        refund_amount = _round_money(order.get("total_after_discount", order.get("total_price", 0)))
        result = await db.orders.update_one(
            {
                "id": order_id,
                "cancellation_status": "requested",
                "status": {"$nin": [ORDER_STATUS_SHIPPED, ORDER_STATUS_DELIVERED, ORDER_STATUS_CANCELLED]},
            },
            {
                "$set": {
                    "cancellation_status": "approved",
                    "cancellation_admin_note": decision.note,
                    "status": ORDER_STATUS_CANCELLED,
                    "cancelled_at": now,
                    "cancelled_by": "admin",
                    "refund_status": "pending",
                    "refund_amount": refund_amount,
                    "refund_reason": order.get("cancellation_reason"),
                    "stock_deducted": bool(order.get("stock_deducted")),
                    "updated_at": now,
                    "updated_by": admin_id,
                }
            },
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=409, detail="Order is no longer eligible for cancellation approval")
        order = await _fetch_normalized_order(order_id, order)
        should_send_confirmation_email = True

    order = await _restore_cancelled_order_stock(order)
    if should_send_confirmation_email:
        try:
            send_order_cancellation_confirmation_email(order)
        except Exception as exc:
            logger.error("Failed to send cancellation confirmation email: %s", exc)
    return serialize_mongo_value(_normalize_order_payment_defaults(order))


async def reject_order_cancellation(
    order_id: str,
    decision: OrderCancellationDecision,
    admin_id: str,
):
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    if existing_order.get("cancellation_status") != "requested":
        raise HTTPException(status_code=400, detail="Cancellation request is not pending rejection")

    now = _now_iso()
    result = await db.orders.update_one(
        {"id": order_id, "cancellation_status": "requested"},
        {
            "$set": {
                "cancellation_status": "rejected",
                "cancellation_admin_note": decision.note,
                "status": ORDER_STATUS_CONFIRMED,
                "updated_at": now,
                "updated_by": admin_id,
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Cancellation request has already been resolved")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(order))


def _generate_refund_id(order_id: str) -> str:
    safe_order_id = "".join(char for char in order_id if char.isalnum())[:12] or "order"
    timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    return f"refund_{safe_order_id}_{timestamp}"


def _map_cashfree_refund_status(cashfree_data: dict) -> str:
    provider_status = str(cashfree_data.get("refund_status") or "").strip().lower()
    if provider_status in {"success", "completed", "successful", "refunded"}:
        return "success"
    if provider_status == "processing":
        return "processing"
    if provider_status in {"pending", "accepted"}:
        return "initiated"
    if provider_status in {"failed", "cancelled", "canceled"}:
        return "failed"
    return "initiated"


def _refund_provider_update_fields(cashfree_data: dict, synced_at: str) -> dict:
    refund_status = _map_cashfree_refund_status(cashfree_data)
    provider_status = cashfree_data.get("refund_status")
    failure_reason = cashfree_data.get("status_description") or (
        str(provider_status) if refund_status == "failed" and provider_status else None
    )
    return {
        "cf_refund_id": cashfree_data.get("cf_refund_id"),
        "cashfree_refund_status": provider_status,
        "refund_status": refund_status,
        "refund_completed_at": synced_at if refund_status == "success" else None,
        "refund_failed_reason": failure_reason if refund_status == "failed" else None,
        "refund_last_synced_at": synced_at,
        "updated_at": synced_at,
    }


def _cashfree_refund_lookup_filter(cashfree_data: dict) -> Optional[dict]:
    refund_id = cashfree_data.get("refund_id")
    cf_refund_id = cashfree_data.get("cf_refund_id")
    order_id = cashfree_data.get("order_id")

    base_filter = {"payment_provider": PAYMENT_PROVIDER_CASHFREE}
    if refund_id:
        return {**base_filter, "refund_id": refund_id}
    if cf_refund_id:
        return {**base_filter, "cf_refund_id": cf_refund_id}
    if order_id:
        return {
            **base_filter,
            "$or": [{"id": order_id}, {"cashfree_order_id": order_id}],
            "refund_id": {"$nin": [None, ""]},
        }
    return None


async def update_cashfree_refund_from_webhook(cashfree_data: dict, event_type: Optional[str] = None) -> Optional[dict]:
    lookup_filter = _cashfree_refund_lookup_filter(cashfree_data)
    refund_status = _map_cashfree_refund_status(cashfree_data)
    logger.info(
        "Cashfree refund webhook received: event_type=%s order_id=%s refund_id=%s "
        "cf_refund_id=%s mapped_refund_status=%s",
        event_type,
        cashfree_data.get("order_id"),
        cashfree_data.get("refund_id"),
        cashfree_data.get("cf_refund_id"),
        refund_status,
    )
    if not cashfree_data.get("refund_status"):
        logger.warning(
            "Cashfree refund webhook ignored without refund_status: event_type=%s "
            "order_id=%s refund_id=%s cf_refund_id=%s",
            event_type,
            cashfree_data.get("order_id"),
            cashfree_data.get("refund_id"),
            cashfree_data.get("cf_refund_id"),
        )
        return None
    if not lookup_filter:
        logger.warning(
            "Cashfree refund webhook ignored without lookup identifiers: event_type=%s "
            "order_id=%s refund_id=%s cf_refund_id=%s mapped_refund_status=%s",
            event_type,
            cashfree_data.get("order_id"),
            cashfree_data.get("refund_id"),
            cashfree_data.get("cf_refund_id"),
            refund_status,
        )
        return None

    order = await db.orders.find_one(lookup_filter, {"_id": 0})
    if not order:
        logger.warning(
            "Cashfree refund webhook order not found: event_type=%s order_id=%s "
            "refund_id=%s cf_refund_id=%s mapped_refund_status=%s",
            event_type,
            cashfree_data.get("order_id"),
            cashfree_data.get("refund_id"),
            cashfree_data.get("cf_refund_id"),
            refund_status,
        )
        return None

    order = _normalize_order_payment_defaults(order)
    webhook_received_at = _now_iso()
    update_fields = _refund_provider_update_fields(cashfree_data, webhook_received_at)
    update_fields["cf_refund_id"] = cashfree_data.get("cf_refund_id") or order.get("cf_refund_id")
    update_fields["refund_webhook_received_at"] = webhook_received_at
    if refund_status == "success" and order.get("refund_completed_at"):
        update_fields["refund_completed_at"] = order["refund_completed_at"]
    if refund_status == "failed":
        update_fields["refund_failed_reason"] = (
            update_fields.get("refund_failed_reason")
            or cashfree_data.get("refund_failed_reason")
            or order.get("refund_failed_reason")
            or str(cashfree_data.get("refund_status") or "")
        )

    write_filter = {"id": order["id"], "refund_id": order.get("refund_id")}
    await db.orders.update_one(write_filter, {"$set": update_fields})
    updated_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(updated_order))


async def initiate_order_refund(order_id: str, admin_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order = _normalize_order_payment_defaults(order)

    if order.get("status") != ORDER_STATUS_CANCELLED or order.get("cancellation_status") != "approved":
        raise HTTPException(status_code=400, detail="Refunds can be initiated only for approved cancellations")
    if order.get("payment_provider") != PAYMENT_PROVIDER_CASHFREE:
        raise HTTPException(status_code=400, detail="Only Cashfree payments can be refunded here")
    if order.get("payment_status") != PAYMENT_STATUS_PAID:
        raise HTTPException(status_code=400, detail="Only paid orders can be refunded")
    if _round_money(order.get("refund_amount")) <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")
    if order.get("refund_id") or order.get("cf_refund_id"):
        raise HTTPException(status_code=409, detail="A Cashfree refund has already been initiated for this order")
    if order.get("refund_status") != "pending":
        raise HTTPException(status_code=400, detail="Refund is not pending initiation")

    now = _now_iso()
    refund_id = _generate_refund_id(order_id)
    refund_note = f"Cancellation refund for order {order_id}"
    claim = await db.orders.update_one(
        {
            "id": order_id,
            "status": ORDER_STATUS_CANCELLED,
            "cancellation_status": "approved",
            "payment_provider": PAYMENT_PROVIDER_CASHFREE,
            "payment_status": PAYMENT_STATUS_PAID,
            "refund_status": "pending",
            "refund_id": {"$in": [None, ""]},
            "cf_refund_id": {"$in": [None, ""]},
        },
        {
            "$set": {
                "refund_status": "initiated",
                "refund_id": refund_id,
                "refund_note": refund_note,
                "refund_initiated_at": now,
                "refund_failed_reason": None,
                "updated_at": now,
                "updated_by": admin_id,
            }
        },
    )
    if claim.modified_count == 0:
        raise HTTPException(status_code=409, detail="A refund has already been initiated or is no longer eligible")

    provider_order_id = order.get("cashfree_order_id") or order_id
    try:
        cashfree_data = create_cashfree_refund(
            provider_order_id,
            refund_id,
            _round_money(order.get("refund_amount")),
            refund_note,
        )
    except HTTPException as exc:
        failure_reason = exc.detail.get("message") if isinstance(exc.detail, dict) else str(exc.detail)
        await db.orders.update_one(
            {"id": order_id, "refund_id": refund_id},
            {"$set": {"refund_status": "failed", "refund_failed_reason": failure_reason, "updated_at": _now_iso()}},
        )
        raise

    synced_at = _now_iso()
    update_fields = _refund_provider_update_fields(cashfree_data, synced_at)
    update_fields["cf_refund_id"] = cashfree_data.get("cf_refund_id")
    await db.orders.update_one(
        {"id": order_id, "refund_id": refund_id},
        {"$set": update_fields},
    )
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return serialize_mongo_value(_normalize_order_payment_defaults(updated_order))


async def sync_order_refund(order_id: str, admin_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order = _normalize_order_payment_defaults(order)
    if order.get("status") != ORDER_STATUS_CANCELLED or order.get("cancellation_status") != "approved":
        raise HTTPException(status_code=400, detail="Refund status is available only for approved cancellations")
    if order.get("payment_provider") != PAYMENT_PROVIDER_CASHFREE:
        raise HTTPException(status_code=400, detail="Only Cashfree refunds can be synced here")
    if not order.get("refund_id"):
        raise HTTPException(status_code=400, detail="No Cashfree refund has been initiated for this order")

    provider_order_id = order.get("cashfree_order_id") or order_id
    logger.info(
        "Manual Cashfree refund sync started: order_id=%s stored_refund_id=%s "
        "stored_cf_refund_id=%s cashfree_order_id=%s",
        order_id,
        order.get("refund_id"),
        order.get("cf_refund_id"),
        provider_order_id,
    )
    try:
        cashfree_data = get_cashfree_refund(provider_order_id, order["refund_id"])
    except HTTPException:
        logger.warning(
            "Manual Cashfree refund sync lookup failed: order_id=%s stored_refund_id=%s "
            "stored_cf_refund_id=%s cashfree_order_id=%s",
            order_id,
            order.get("refund_id"),
            order.get("cf_refund_id"),
            provider_order_id,
        )
        raise

    synced_at = _now_iso()
    update_fields = _refund_provider_update_fields(cashfree_data, synced_at)
    update_fields["cf_refund_id"] = cashfree_data.get("cf_refund_id") or order.get("cf_refund_id")
    update_fields["updated_by"] = admin_id
    logger.info(
        "Manual Cashfree refund sync mapped response: order_id=%s stored_refund_id=%s "
        "stored_cf_refund_id=%s cashfree_order_id=%s response_keys=%s data_keys=%s "
        "refund_item_count=%s response_refund_id=%s response_cf_refund_id=%s "
        "raw_refund_status=%s raw_status=%s mapped_refund_status=%s",
        order_id,
        order.get("refund_id"),
        order.get("cf_refund_id"),
        provider_order_id,
        cashfree_data.get("_cashfree_response_keys"),
        cashfree_data.get("_cashfree_data_keys"),
        cashfree_data.get("_cashfree_refund_item_count"),
        cashfree_data.get("refund_id"),
        cashfree_data.get("cf_refund_id"),
        cashfree_data.get("_cashfree_raw_refund_status") or cashfree_data.get("refund_status"),
        cashfree_data.get("_cashfree_raw_status"),
        update_fields.get("refund_status"),
    )
    result = await db.orders.update_one(
        {"id": order_id, "refund_id": order["refund_id"]},
        {"$set": update_fields},
    )
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    normalized_updated_order = _normalize_order_payment_defaults(updated_order or {})
    logger.info(
        "Manual Cashfree refund sync DB updated: order_id=%s stored_refund_id=%s "
        "cashfree_order_id=%s modified_count=%s updated_refund_status=%s "
        "updated_cashfree_refund_status=%s updated_cf_refund_id=%s",
        order_id,
        order.get("refund_id"),
        provider_order_id,
        getattr(result, "modified_count", None),
        normalized_updated_order.get("refund_status"),
        normalized_updated_order.get("cashfree_refund_status"),
        normalized_updated_order.get("cf_refund_id"),
    )
    return serialize_mongo_value(normalized_updated_order)


def _ensure_order_is_shiprocket_eligible(order: dict) -> None:
    if order.get("shiprocket_order_id") or order.get("shiprocket_shipment_id"):
        raise HTTPException(status_code=409, detail="Shiprocket shipment already exists for this order")

    status = order.get("status")
    payment_status = order.get("payment_status")
    blocked_statuses = {
        ORDER_STATUS_PENDING_PAYMENT,
        ORDER_STATUS_PAYMENT_FAILED,
        ORDER_STATUS_PAYMENT_EXPIRED,
        ORDER_STATUS_CANCELLED,
    }
    blocked_payment_statuses = {
        PAYMENT_STATUS_PENDING,
        PAYMENT_STATUS_FAILED,
        PAYMENT_STATUS_EXPIRED,
        PAYMENT_STATUS_REFUNDED,
    }

    if status in blocked_statuses or payment_status in blocked_payment_statuses:
        raise HTTPException(status_code=400, detail="Order is not eligible for shipment")

    if payment_status != PAYMENT_STATUS_PAID or status not in PAID_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Order must be paid and confirmed before shipment")

    if order.get("cancellation_status") in {"requested", "approved"}:
        raise HTTPException(status_code=400, detail="Resolve cancellation before creating shipment")

    if order.get("refund_status") in {"initiated", "processing", "success"}:
        raise HTTPException(status_code=400, detail="Refunded orders are not eligible for shipment")


async def create_shiprocket_shipment_for_order(order_id: str, admin_id: Optional[str] = None):
    ensure_shiprocket_configured()

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    _normalize_order_payment_defaults(order)
    _ensure_order_is_shiprocket_eligible(order)

    payload = build_shiprocket_order_payload(order)
    if not payload.get("order_items"):
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    try:
        shiprocket_response = create_shiprocket_order(payload)
    except HTTPException as exc:
        if exc.status_code != 503:
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"shipment_error": str(exc.detail)[:500], "updated_at": _now_iso()}},
            )
        raise

    normalized_response = normalize_shiprocket_order_response(shiprocket_response)
    now = _now_iso()
    update_fields = {
        "shipping_provider": "shiprocket",
        "shiprocket_order_id": normalized_response.get("shiprocket_order_id"),
        "shiprocket_shipment_id": normalized_response.get("shiprocket_shipment_id"),
        "shiprocket_awb_code": normalized_response.get("shiprocket_awb_code"),
        "shiprocket_courier_name": normalized_response.get("shiprocket_courier_name"),
        "shiprocket_tracking_url": normalized_response.get("shiprocket_tracking_url"),
        "shipment_status": normalized_response.get("shipment_status") or "created",
        "shipment_created_at": now,
        "shipment_error": None,
        "updated_at": now,
        "updated_by": admin_id,
    }

    result = await db.orders.update_one(
        {
            "id": order_id,
            "$or": [
                {"shiprocket_order_id": {"$exists": False}},
                {"shiprocket_order_id": None},
                {"shiprocket_order_id": ""},
            ],
            "shiprocket_shipment_id": {"$in": [None, ""]},
        },
        {"$set": update_fields},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Shiprocket shipment already exists for this order")

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    logger.info(
        "Shiprocket shipment stored: order_id=%s shipment_status=%s shiprocket_order_id=%s "
        "shipment_id=%s awb=%s courier=%s",
        order_id,
        update_fields.get("shipment_status"),
        update_fields.get("shiprocket_order_id"),
        update_fields.get("shiprocket_shipment_id"),
        update_fields.get("shiprocket_awb_code"),
        update_fields.get("shiprocket_courier_name"),
    )
    return serialize_mongo_value(_normalize_order_payment_defaults(updated_order))


async def get_user_orders(user_id: str, limit: int = 100):
    await sync_stale_pending_orders({"user_id": user_id})
    limit = min(limit, MAX_LIMIT)
    orders = await db.orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)

    for order in orders:
        order["billing_phone"] = format_phone(order.get("billing_phone") or "")
        _normalize_order_payment_defaults(order)

    return serialize_mongo_value(orders)


async def get_public_tracked_order(tracking_token: str):
    if not tracking_token:
        raise HTTPException(status_code=404, detail="Order not found")

    order = await db.orders.find_one({"tracking_token": tracking_token}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return serialize_mongo_value(_redact_order_for_tracking(order))


async def get_order(order_id: str, user: dict):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    user_email = user.get("email")
    is_owner = order.get("user_id") == user.get("id")
    is_admin = bool(user_email and user_email == "mariso.store@gmail.com")

    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to view this order")

    await sync_stale_pending_orders({"id": order_id}, limit=1)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    order["billing_phone"] = format_phone(order.get("billing_phone") or "")
    return serialize_mongo_value(_normalize_order_payment_defaults(order))

async def get_all_orders(
    order_status: Optional[str] = None,
    cancellation_status: Optional[str] = None,
    period: str = "all",
    month: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = MAX_LIMIT,
):
    query = build_order_period_filter(period, start_date, end_date, month)
    await sync_stale_pending_orders(query)
    if order_status:
        query["status"] = order_status
    if cancellation_status:
        query["cancellation_status"] = cancellation_status

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
        _normalize_order_payment_defaults(order)

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

    if (
        existing_order.get("cancellation_status") == "requested"
        and status_update.status != old_status
    ):
        raise HTTPException(status_code=400, detail="Resolve the cancellation request before updating fulfillment status")

    if status_update.status != old_status and status_update.status not in allowed_transitions.get(old_status, []):
        raise HTTPException(status_code=400, detail="Invalid status transition")
    
    update_fields = {
        "status": status_update.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin_id,
    }
    if status_update.status == "delivered":
        update_fields["delivered_at"] = update_fields["updated_at"]

    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_fields
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
    _normalize_order_payment_defaults(order)

    if old_status != status_update.status:
        logger.info("DEBUG status changed, applying notification strategy")

        status = status_update.status
        feedback_email_ready = True
        if status in ["packed", "shipped", "delivered"]:
            order["tracking_token"] = await ensure_order_tracking_token(order)
        if status == "delivered":
            try:
                order["feedback_token"] = await ensure_order_feedback_token(order)
            except Exception:
                feedback_email_ready = False
                logger.exception(
                    "Delivered feedback email skipped because a feedback token could not be prepared for order_id=%s",
                    order_id,
                )

        # EMAIL → send only for shipped and delivered from admin status updates.
        # Confirmed is already sent at checkout.
        if status in ["shipped", "delivered"] and feedback_email_ready:
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

        if status == "delivered":
            if order.get("feedback_whatsapp_sent_at"):
                logger.info("Feedback reward WhatsApp skipped: already sent for order_id=%s", order_id)
            else:
                try:
                    feedback_whatsapp_result = send_feedback_reward_whatsapp(order)
                    if feedback_whatsapp_result and feedback_whatsapp_result.get("success"):
                        feedback_whatsapp_sent_at = _now_iso()
                        await db.orders.update_one(
                            {"id": order_id, "feedback_whatsapp_sent_at": {"$in": [None, ""]}},
                            {"$set": {"feedback_whatsapp_sent_at": feedback_whatsapp_sent_at}},
                        )
                        order["feedback_whatsapp_sent_at"] = feedback_whatsapp_sent_at
                except Exception as e:
                    logger.error(f"Failed to send feedback reward WhatsApp: {e}")

    else:
        logger.info("DEBUG status did not change, skipping notifications")
    
    return serialize_mongo_value(order)
