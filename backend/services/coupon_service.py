from datetime import datetime, timedelta, timezone
from typing import List, Optional
import secrets
import uuid

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from core.constants import MAX_LIMIT, PAYMENT_STATUS_PAID
from core.database import db
from models.coupon import AvailableCouponsRequest, CouponCreate, CouponUpdate, CouponValidationRequest
from utils.helpers import format_phone


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {value}")
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _round_money(value: float) -> float:
    return round(max(value, 0), 2)


def _coupon_snapshot(coupon: dict) -> dict:
    return {
        "id": coupon["id"],
        "code": coupon["code"],
        "coupon_type": coupon.get("coupon_type", "general"),
        "description": coupon.get("description", ""),
        "visibility": coupon.get("visibility", "private"),
        "display_title": coupon.get("display_title", ""),
        "display_description": coupon.get("display_description", ""),
        "show_on_cart": coupon.get("show_on_cart", True),
        "show_on_checkout": coupon.get("show_on_checkout", True),
        "discount_type": coupon["discount_type"],
        "discount_value": coupon["discount_value"],
        "max_discount_amount": coupon.get("max_discount_amount"),
        "minimum_order_amount": coupon.get("minimum_order_amount", 0),
        "applies_to": coupon.get("applies_to", "all"),
        "applicable_category_ids": coupon.get("applicable_category_ids", []),
        "applicable_product_ids": coupon.get("applicable_product_ids", []),
        "start_date": coupon.get("start_date"),
        "end_date": coupon.get("end_date"),
        "influencer_name": coupon.get("influencer_name", ""),
        "influencer_handle": coupon.get("influencer_handle", ""),
        "source": coupon.get("source"),
        "allow_stacking": False,
    }


def _normalize_optional_email(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "").strip().lower()
    return normalized or None


def _normalize_optional_phone(value: Optional[str]) -> Optional[str]:
    return format_phone(str(value or "")) or None


def _reward_validation_request(
    request: CouponValidationRequest,
    current_user: Optional[dict],
) -> Optional[CouponValidationRequest]:
    user_id = str((current_user or {}).get("id") or "").strip()
    if not user_id:
        return None
    return request.model_copy(update={"user_id": user_id, "email": None, "phone": None})


def _validate_coupon_dates(start_date: Optional[str], end_date: Optional[str]) -> None:
    start = _parse_iso_datetime(start_date)
    end = _parse_iso_datetime(end_date)
    if start and end and start >= end:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")


def _validate_effective_coupon(coupon: dict) -> None:
    visibility = coupon.get("visibility", "private")
    if visibility not in {"public", "private", "influencer"}:
        raise HTTPException(status_code=400, detail="Invalid visibility")

    discount_type = coupon.get("discount_type")
    discount_value = coupon.get("discount_value")
    if discount_type == "percentage":
        if discount_value is None or discount_value <= 0 or discount_value > 100:
            raise HTTPException(status_code=400, detail="Percentage discount value must be between 0 and 100")
    elif discount_type == "fixed":
        if discount_value is None or discount_value <= 0:
            raise HTTPException(status_code=400, detail="Fixed discount value must be positive")
    else:
        raise HTTPException(status_code=400, detail="Invalid discount_type")

    applies_to = coupon.get("applies_to", "all")
    if applies_to == "categories" and not coupon.get("applicable_category_ids"):
        raise HTTPException(status_code=400, detail="Category scoped coupons require applicable_category_ids")
    if applies_to == "products" and not coupon.get("applicable_product_ids"):
        raise HTTPException(status_code=400, detail="Product scoped coupons require applicable_product_ids")

    _validate_coupon_dates(coupon.get("start_date"), coupon.get("end_date"))


async def get_coupons() -> List[dict]:
    return await db.coupons.find({"deleted_at": {"$exists": False}}, {"_id": 0}).sort("created_at", -1).to_list(MAX_LIMIT)


async def get_coupon(coupon_id: str) -> dict:
    coupon = await db.coupons.find_one({"id": coupon_id, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return coupon


async def create_coupon(coupon: CouponCreate) -> dict:
    _validate_coupon_dates(coupon.start_date, coupon.end_date)

    now = _now_iso()
    coupon_doc = {
        **coupon.model_dump(),
        "id": str(uuid.uuid4()),
        "used_count": 0,
        "allow_stacking": False,
        "created_at": now,
        "updated_at": now,
    }

    try:
        await db.coupons.insert_one(coupon_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Coupon code already exists")

    return await get_coupon(coupon_doc["id"])


async def create_feedback_reward_coupon(
    *,
    order: dict,
    submission_id: str,
    reward_rule: dict,
) -> dict:
    existing = await db.coupons.find_one(
        {
            "source": "feedback_reward",
            "source_feedback_submission_id": submission_id,
            "deleted_at": {"$exists": False},
        },
        {"_id": 0},
    )
    if existing:
        return existing

    now = _now_iso()
    end_date = reward_rule.get("end_date")
    validity_days = int(reward_rule.get("validity_days") or 0)
    if validity_days > 0:
        end_date = (datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=validity_days)).isoformat()

    for _ in range(8):
        code = f"THANKYOU-{secrets.token_urlsafe(6).replace('-', '').replace('_', '').upper()[:8]}"
        coupon_doc = {
            "id": str(uuid.uuid4()),
            "code": code,
            "coupon_type": "personal",
            "description": reward_rule.get("description") or reward_rule.get("name") or "Feedback reward",
            "visibility": "private",
            "display_title": reward_rule.get("display_title") or "Your feedback reward",
            "display_description": reward_rule.get("display_description") or "",
            "show_on_cart": False,
            "show_on_checkout": False,
            "discount_type": reward_rule["discount_type"],
            "discount_value": reward_rule["discount_value"],
            "max_discount_amount": reward_rule.get("max_discount_amount"),
            "minimum_order_amount": reward_rule.get("coupon_minimum_order_amount", 0),
            "applies_to": "all",
            "applicable_category_ids": [],
            "applicable_product_ids": [],
            "start_date": now,
            "end_date": end_date,
            "usage_limit_total": 1,
            "usage_limit_per_customer": 1,
            "used_count": 0,
            "influencer_name": "",
            "influencer_handle": "",
            "is_active": True,
            "allow_stacking": False,
            "assigned_user_id": order.get("user_id"),
            "assigned_email": _normalize_optional_email(order.get("billing_email")),
            "assigned_phone": _normalize_optional_phone(order.get("billing_phone")),
            "source": "feedback_reward",
            "source_order_id": order.get("id"),
            "source_feedback_submission_id": submission_id,
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.coupons.insert_one(coupon_doc)
            return await get_coupon(coupon_doc["id"])
        except DuplicateKeyError:
            existing = await db.coupons.find_one(
                {
                    "source": "feedback_reward",
                    "source_feedback_submission_id": submission_id,
                    "deleted_at": {"$exists": False},
                },
                {"_id": 0},
            )
            if existing:
                return existing
            continue

    raise HTTPException(status_code=500, detail="Unable to create reward coupon")


async def update_coupon(coupon_id: str, coupon: CouponUpdate) -> dict:
    existing = await get_coupon(coupon_id)
    update_data = coupon.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    update_data["allow_stacking"] = False
    effective = {**existing, **update_data}
    _validate_effective_coupon(effective)
    update_data["updated_at"] = _now_iso()

    try:
        updated = await db.coupons.find_one_and_update(
            {"id": coupon_id, "deleted_at": {"$exists": False}},
            {"$set": update_data},
            return_document=ReturnDocument.AFTER,
            projection={"_id": 0},
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Coupon code already exists")

    if not updated:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return updated


async def toggle_coupon(coupon_id: str, is_active: Optional[bool] = None) -> dict:
    existing = await get_coupon(coupon_id)
    next_active = (not existing.get("is_active", True)) if is_active is None else is_active
    updated = await db.coupons.find_one_and_update(
        {"id": coupon_id, "deleted_at": {"$exists": False}},
        {"$set": {"is_active": next_active, "updated_at": _now_iso()}},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return updated


async def delete_coupon(coupon_id: str) -> dict:
    existing = await get_coupon(coupon_id)
    await db.coupons.update_one(
        {"id": existing["id"]},
        {"$set": {"is_active": False, "deleted_at": _now_iso(), "updated_at": _now_iso()}},
    )
    return {"message": "Coupon deleted"}


def _calculate_subtotals(coupon: dict, items: list) -> tuple[float, float]:
    cart_subtotal = 0.0
    eligible_subtotal = 0.0
    applies_to = coupon.get("applies_to", "all")
    category_ids = set(coupon.get("applicable_category_ids", []))
    product_ids = set(coupon.get("applicable_product_ids", []))

    for item in items:
        line_total = float(item.price) * item.quantity
        cart_subtotal += line_total

        if applies_to == "all":
            eligible_subtotal += line_total
        elif applies_to == "categories" and item.category_id in category_ids:
            eligible_subtotal += line_total
        elif applies_to == "products" and item.product_id in product_ids:
            eligible_subtotal += line_total

    return _round_money(cart_subtotal), _round_money(eligible_subtotal)


def _format_money(value: float) -> str:
    return f"₹{_round_money(value):,.2f}"


async def _customer_usage_count(coupon_id: str, request: CouponValidationRequest) -> int:
    identifiers = []
    if request.user_id:
        identifiers.append({"user_id": request.user_id})
    if request.email:
        identifiers.append({"billing_email": request.email.strip().lower()})
    if request.phone:
        normalized_phone = _normalize_optional_phone(request.phone)
        if normalized_phone:
            identifiers.append({"billing_phone": normalized_phone})

    if not identifiers:
        return 0

    # Phase 1 does not attach coupons to orders yet. These field options let the
    # limit begin working safely once the payment-success phase stores any one of
    # the expected coupon references on paid orders.
    coupon_filters = [
        {"coupon_id": coupon_id},
        {"coupon.coupon_id": coupon_id},
        {"coupon_snapshot.id": coupon_id},
        {"coupon_snapshot.coupon_id": coupon_id},
    ]
    return await db.orders.count_documents({
        "$and": [
            {"$or": identifiers},
            {"$or": coupon_filters},
            {
                "$or": [
                    {"coupon_usage_recorded": True},
                    {"payment_status": PAYMENT_STATUS_PAID},
                ]
            },
        ]
    })


async def _evaluate_coupon(coupon: dict, request: CouponValidationRequest, *, locked_minimum: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    start = _parse_iso_datetime(coupon.get("start_date"))
    end = _parse_iso_datetime(coupon.get("end_date"))

    if not coupon.get("is_active", True):
        return {"valid": False, "message": "Coupon is inactive", "hide_from_available": True}
    if start and now < start:
        return {"valid": False, "message": "Coupon is not active yet", "hide_from_available": True}
    if end and now > end:
        return {"valid": False, "message": "Coupon has expired", "hide_from_available": True}

    assigned_user_id = coupon.get("assigned_user_id")
    assigned_email = _normalize_optional_email(coupon.get("assigned_email"))
    assigned_phone = _normalize_optional_phone(coupon.get("assigned_phone"))
    if assigned_user_id or assigned_email or assigned_phone:
        request_email = _normalize_optional_email(request.email)
        request_phone = _normalize_optional_phone(request.phone)
        matches_assignee = (
            bool(assigned_user_id and request.user_id == assigned_user_id)
            or bool(assigned_email and request_email == assigned_email)
            or bool(assigned_phone and request_phone == assigned_phone)
        )
        if not matches_assignee:
            return {"valid": False, "message": "Coupon is not assigned to this customer", "hide_from_available": True}

    usage_limit_total = coupon.get("usage_limit_total")
    used_count = coupon.get("used_count", 0)
    if usage_limit_total is not None and used_count >= usage_limit_total:
        return {"valid": False, "message": "Coupon usage limit reached", "hide_from_available": True}

    usage_limit_per_customer = coupon.get("usage_limit_per_customer")
    if usage_limit_per_customer is not None:
        customer_used_count = await _customer_usage_count(coupon["id"], request)
        if customer_used_count >= usage_limit_per_customer:
            return {"valid": False, "message": "Coupon usage limit reached for this customer", "hide_from_available": True}

    cart_subtotal, eligible_subtotal = _calculate_subtotals(coupon, request.items)
    if eligible_subtotal <= 0:
        return {"valid": False, "message": "Coupon is not applicable to these items"}

    minimum_order_amount = coupon.get("minimum_order_amount") or 0
    if eligible_subtotal < minimum_order_amount:
        shortfall = _round_money(minimum_order_amount - eligible_subtotal)
        message = (
            f"Add {_format_money(shortfall)} more to unlock this coupon"
            if locked_minimum
            else f"Minimum eligible amount for this coupon is {minimum_order_amount}"
        )
        return {
            "valid": False,
            "message": message,
            "eligible_subtotal": eligible_subtotal,
            "cart_subtotal": cart_subtotal,
        }

    if coupon["discount_type"] == "percentage":
        discount_amount = eligible_subtotal * (coupon["discount_value"] / 100)
        max_discount_amount = coupon.get("max_discount_amount")
        if max_discount_amount is not None:
            discount_amount = min(discount_amount, max_discount_amount)
    else:
        discount_amount = min(coupon["discount_value"], eligible_subtotal)

    discount_amount = _round_money(discount_amount)
    final_total = _round_money(cart_subtotal - discount_amount)

    return {
        "valid": True,
        "code": coupon["code"],
        "coupon_id": coupon["id"],
        "discount_amount": discount_amount,
        "eligible_subtotal": eligible_subtotal,
        "cart_subtotal": cart_subtotal,
        "final_total": final_total,
        "message": "Coupon applied successfully",
        "coupon_snapshot": _coupon_snapshot(coupon),
    }


async def validate_coupon(request: CouponValidationRequest, *, current_user: Optional[dict] = None) -> dict:
    coupon = await db.coupons.find_one({"code": request.code, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not coupon:
        return {"valid": False, "message": "Coupon not found"}

    if coupon.get("source") == "feedback_reward":
        if not coupon.get("assigned_user_id"):
            return {"valid": False, "message": "Coupon is not available"}
        request = _reward_validation_request(request, current_user)
        if request is None:
            return {"valid": False, "message": "Coupon is not available"}

    return await _evaluate_coupon(coupon, request)


def _available_coupon_payload(coupon: dict, result: dict) -> dict:
    return {
        "code": coupon["code"],
        "coupon_id": coupon["id"],
        "description": coupon.get("description", ""),
        "name": coupon.get("display_title") or coupon.get("description") or coupon["code"],
        "display_title": coupon.get("display_title") or coupon.get("description") or coupon["code"],
        "display_description": coupon.get("display_description") or coupon.get("description", ""),
        "discount_type": coupon["discount_type"],
        "discount_value": coupon["discount_value"],
        "max_discount_amount": coupon.get("max_discount_amount"),
        "minimum_order_amount": coupon.get("minimum_order_amount", 0),
        "discount_amount": result.get("discount_amount"),
        "eligible_subtotal": result.get("eligible_subtotal"),
        "cart_subtotal": result.get("cart_subtotal"),
        "final_total": result.get("final_total"),
        "expiry_date": coupon.get("end_date"),
        "end_date": coupon.get("end_date"),
        "source": coupon.get("source"),
        "is_applicable": bool(result.get("valid")),
        "message": "Coupon available" if result.get("valid") else result.get("message", "Coupon unavailable"),
    }


def _feedback_reward_sort_date(coupon: dict) -> datetime:
    for field in ("created_at", "end_date", "expiry_date"):
        try:
            parsed = _parse_iso_datetime(coupon.get(field))
        except HTTPException:
            parsed = None
        if parsed:
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


async def get_available_coupons(request: AvailableCouponsRequest, *, current_user: Optional[dict] = None) -> List[dict]:
    surface_field = "show_on_cart" if request.surface == "cart" else "show_on_checkout"
    authenticated_user_id = str((current_user or {}).get("id") or "").strip()

    visibility_filters = [
        {
            "visibility": "public",
            "source": {"$ne": "feedback_reward"},
            "$or": [{surface_field: True}, {surface_field: {"$exists": False}}],
        }
    ]
    if authenticated_user_id:
        visibility_filters.append({
            "visibility": "private",
            "coupon_type": "personal",
            "source": "feedback_reward",
            "assigned_user_id": authenticated_user_id,
        })

    query = {
        "deleted_at": {"$exists": False},
        "is_active": True,
        "$or": visibility_filters,
    }
    coupons = await db.coupons.find(query, {"_id": 0}).sort("created_at", -1).to_list(MAX_LIMIT)
    available = []
    matching_feedback_rewards = []

    for coupon in coupons:
        validation_request = CouponValidationRequest(
            code=coupon["code"],
            items=request.items,
            user_id=request.user_id,
            email=request.email,
            phone=request.phone,
        )
        if coupon.get("source") == "feedback_reward":
            validation_request = _reward_validation_request(validation_request, current_user)
            if validation_request is None or not coupon.get("assigned_user_id"):
                continue
        result = await _evaluate_coupon(coupon, validation_request, locked_minimum=True)
        if result.get("hide_from_available"):
            continue

        if coupon.get("source") == "feedback_reward":
            try:
                used_count = int(coupon.get("used_count") or 0)
            except (TypeError, ValueError):
                used_count = 0
            if used_count > 0:
                continue
            matching_feedback_rewards.append((coupon, result))
            continue

        available.append(_available_coupon_payload(coupon, result))

    if matching_feedback_rewards:
        latest_coupon, latest_result = max(
            matching_feedback_rewards,
            key=lambda item: _feedback_reward_sort_date(item[0]),
        )
        available.append(_available_coupon_payload(latest_coupon, latest_result))

    return available


async def increment_coupon_usage(coupon_id: Optional[str] = None, coupon_code: Optional[str] = None) -> bool:
    query = {"deleted_at": {"$exists": False}}
    if coupon_id:
        query["id"] = coupon_id
    elif coupon_code:
        query["code"] = coupon_code.strip().upper()
    else:
        return False

    result = await db.coupons.update_one(
        query,
        {
            "$inc": {"used_count": 1},
            "$set": {"updated_at": _now_iso()},
        },
    )
    return result.modified_count > 0
