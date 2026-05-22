from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from core.constants import MAX_LIMIT, ORDER_STATUS_DELIVERED
from core.database import db
from models.feedback import (
    FeedbackQuestionCreate,
    FeedbackQuestionUpdate,
    FeedbackRewardRuleCreate,
    FeedbackRewardRuleUpdate,
    FeedbackSubmissionHomepageUpdate,
    FeedbackSubmitRequest,
)
from services.coupon_service import create_feedback_reward_coupon
from utils.helpers import serialize_mongo_value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _round_money(value: float) -> float:
    return round(max(float(value or 0), 0), 2)


def _safe_order_summary(order: dict) -> dict:
    items = [
        {
            "product_name": item.get("product_name"),
            "product_image": item.get("product_image"),
            "quantity": item.get("quantity"),
            "color_name": item.get("color_name") or "",
            "flavor_name": item.get("flavor_name") or "",
        }
        for item in order.get("items", [])
    ]
    return {
        "order_number": str(order.get("id", ""))[:8].upper(),
        "status": order.get("status"),
        "created_at": order.get("created_at"),
        "delivered_at": order.get("delivered_at") or order.get("updated_at"),
        "item_count": sum(int(item.get("quantity") or 0) for item in items),
        "items": items,
        "total_price": order.get("total_after_discount") or order.get("total_price"),
    }


def _reward_card(coupon: Optional[dict], reward_rule: Optional[dict]) -> Optional[dict]:
    if not coupon:
        return None
    return {
        "coupon_code": coupon.get("code"),
        "discount_type": coupon.get("discount_type"),
        "discount_value": coupon.get("discount_value"),
        "max_discount_amount": coupon.get("max_discount_amount"),
        "expiry_date": coupon.get("end_date"),
        "validity_days": reward_rule.get("validity_days") if reward_rule else None,
    }


def _validate_effective_reward_rule(rule: dict) -> None:
    min_amount = float(rule.get("min_order_amount") or 0)
    max_amount = rule.get("max_order_amount")
    if max_amount is not None and float(max_amount) < min_amount:
        raise HTTPException(status_code=400, detail="max_order_amount must be greater than or equal to min_order_amount")

    discount_type = rule.get("discount_type")
    discount_value = rule.get("discount_value")
    if discount_type == "percentage":
        if discount_value is None or discount_value <= 0 or discount_value > 100:
            raise HTTPException(status_code=400, detail="Percentage discount value must be between 0 and 100")
    elif discount_type == "fixed":
        if discount_value is None or discount_value <= 0:
            raise HTTPException(status_code=400, detail="Fixed discount value must be positive")
    else:
        raise HTTPException(status_code=400, detail="Invalid discount_type")


async def _get_delivered_order_by_token(feedback_token: str) -> dict:
    if not feedback_token:
        raise HTTPException(status_code=404, detail="Feedback link not found")

    order = await db.orders.find_one({"feedback_token": feedback_token}, {"_id": 0})
    if not order or str(order.get("status", "")).lower() != ORDER_STATUS_DELIVERED:
        raise HTTPException(status_code=404, detail="Feedback link not found")
    return order


async def get_public_feedback(feedback_token: str) -> dict:
    order = await _get_delivered_order_by_token(feedback_token)
    questions = await db.feedback_questions.find(
        {
            "deleted_at": {"$exists": False},
            "is_active": True,
        },
        {"_id": 0},
    ).sort([("sort_order", 1), ("created_at", 1)]).to_list(MAX_LIMIT)
    submission = await db.feedback_submissions.find_one({"order_id": order["id"]}, {"_id": 0})

    return serialize_mongo_value({
        "order": _safe_order_summary(order),
        "questions": questions,
        "already_submitted": bool(submission),
        "submitted_at": submission.get("created_at") if submission else None,
        "reward": _reward_card(
            await db.coupons.find_one({"id": submission.get("reward_coupon_id")}, {"_id": 0}) if submission and submission.get("reward_coupon_id") else None,
            submission.get("reward_rule_snapshot") if submission else None,
        ),
    })


async def list_homepage_feedback_reviews(limit: int = 10) -> List[dict]:
    safe_limit = min(max(int(limit or 10), 1), 10)
    submissions = await db.feedback_submissions.find(
        {
            "show_on_homepage": True,
            "homepage_status": "approved",
            "review_text": {"$type": "string", "$gt": ""},
        },
        {
            "_id": 0,
            "id": 1,
            "customer_name": 1,
            "review_text": 1,
            "rating": 1,
            "created_at": 1,
        },
    ).sort("created_at", -1).to_list(safe_limit)

    reviews = []
    for submission in submissions:
        name = str(submission.get("customer_name") or "").strip() or "Mariso Customer"
        text = str(submission.get("review_text") or "").strip()
        if not text:
            continue
        reviews.append({
            "id": submission.get("id"),
            "name": name,
            "text": text,
            "rating": submission.get("rating"),
            "created_at": submission.get("created_at"),
        })

    return serialize_mongo_value(reviews)


async def _find_matching_reward_rule(order_amount: float) -> Optional[dict]:
    rules = await db.feedback_reward_rules.find(
        {
            "deleted_at": {"$exists": False},
            "is_active": True,
            "min_order_amount": {"$lte": order_amount},
            "$or": [
                {"max_order_amount": None},
                {"max_order_amount": {"$exists": False}},
                {"max_order_amount": {"$gte": order_amount}},
            ],
        },
        {"_id": 0},
    ).sort([("priority", 1), ("min_order_amount", -1), ("created_at", -1)]).to_list(1)
    return rules[0] if rules else None


async def submit_public_feedback(feedback_token: str, payload: FeedbackSubmitRequest) -> dict:
    order = await _get_delivered_order_by_token(feedback_token)
    now = _now_iso()
    order_amount = _round_money(order.get("total_after_discount") or order.get("total_price") or 0)
    reward_rule = await _find_matching_reward_rule(order_amount)
    submission_id = str(uuid.uuid4())
    submission_doc = {
        "id": submission_id,
        "order_id": order["id"],
        "order_number": str(order.get("id", ""))[:8].upper(),
        "feedback_token": feedback_token,
        "user_id": order.get("user_id"),
        "customer_name": order.get("billing_name"),
        "customer_email": order.get("billing_email"),
        "customer_phone": order.get("billing_phone"),
        "order_amount": order_amount,
        "answers": [answer.model_dump() for answer in payload.answers],
        "review_text": (payload.review_text or "").strip(),
        "rating": payload.rating,
        "show_on_homepage": False,
        "homepage_status": "pending",
        "reward_rule_id": reward_rule.get("id") if reward_rule else None,
        "reward_rule_snapshot": reward_rule,
        "reward_coupon_id": None,
        "reward_coupon_code": None,
        "created_at": now,
        "updated_at": now,
    }

    try:
        await db.feedback_submissions.insert_one(submission_doc)
    except DuplicateKeyError:
        existing = await db.feedback_submissions.find_one({"order_id": order["id"]}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=409, detail="Feedback already submitted")
        coupon = await db.coupons.find_one({"id": existing.get("reward_coupon_id")}, {"_id": 0}) if existing.get("reward_coupon_id") else None
        existing_reward_rule = existing.get("reward_rule_snapshot")
        if not coupon and existing_reward_rule:
            coupon = await create_feedback_reward_coupon(
                order=order,
                submission_id=existing["id"],
                reward_rule=existing_reward_rule,
            )
            await db.feedback_submissions.update_one(
                {"id": existing["id"], "reward_coupon_id": None},
                {
                    "$set": {
                        "reward_coupon_id": coupon["id"],
                        "reward_coupon_code": coupon["code"],
                        "updated_at": _now_iso(),
                    }
                },
            )
        return serialize_mongo_value({
            "already_submitted": True,
            "submission_id": existing["id"],
            "reward": _reward_card(coupon, existing_reward_rule),
        })

    coupon = None
    if reward_rule:
        coupon = await create_feedback_reward_coupon(
            order=order,
            submission_id=submission_id,
            reward_rule=reward_rule,
        )
        await db.feedback_submissions.update_one(
            {"id": submission_id},
            {
                "$set": {
                    "reward_coupon_id": coupon["id"],
                    "reward_coupon_code": coupon["code"],
                    "updated_at": _now_iso(),
                }
            },
        )

    return serialize_mongo_value({
        "already_submitted": False,
        "submission_id": submission_id,
        "reward": _reward_card(coupon, reward_rule),
    })


async def list_feedback_questions() -> List[dict]:
    questions = await db.feedback_questions.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0},
    ).sort([("sort_order", 1), ("created_at", -1)]).to_list(MAX_LIMIT)
    return serialize_mongo_value(questions)


async def create_feedback_question(payload: FeedbackQuestionCreate) -> dict:
    now = _now_iso()
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
    }
    await db.feedback_questions.insert_one(doc)
    return serialize_mongo_value({key: value for key, value in doc.items() if key != "_id"})


async def update_feedback_question(question_id: str, payload: FeedbackQuestionUpdate) -> dict:
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    existing = await db.feedback_questions.find_one({"id": question_id, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Feedback question not found")
    effective = {**existing, **update_data}
    FeedbackQuestionCreate(**{key: effective[key] for key in ["question", "question_type", "options", "sort_order", "is_required", "is_active"]})

    update_data["updated_at"] = _now_iso()
    updated = await db.feedback_questions.find_one_and_update(
        {"id": question_id, "deleted_at": {"$exists": False}},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Feedback question not found")
    return serialize_mongo_value(updated)


async def delete_feedback_question(question_id: str) -> dict:
    result = await db.feedback_questions.update_one(
        {"id": question_id, "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": _now_iso(), "is_active": False, "updated_at": _now_iso()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Feedback question not found")
    return {"message": "Feedback question deleted"}


async def list_feedback_reward_rules() -> List[dict]:
    rules = await db.feedback_reward_rules.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0},
    ).sort([("priority", 1), ("min_order_amount", 1), ("created_at", -1)]).to_list(MAX_LIMIT)
    return serialize_mongo_value(rules)


async def create_feedback_reward_rule(payload: FeedbackRewardRuleCreate) -> dict:
    now = _now_iso()
    doc = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
    }
    await db.feedback_reward_rules.insert_one(doc)
    return serialize_mongo_value({key: value for key, value in doc.items() if key != "_id"})


async def update_feedback_reward_rule(rule_id: str, payload: FeedbackRewardRuleUpdate) -> dict:
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    existing = await db.feedback_reward_rules.find_one({"id": rule_id, "deleted_at": {"$exists": False}}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Feedback reward rule not found")
    _validate_effective_reward_rule({**existing, **update_data})

    update_data["updated_at"] = _now_iso()
    updated = await db.feedback_reward_rules.find_one_and_update(
        {"id": rule_id, "deleted_at": {"$exists": False}},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Feedback reward rule not found")
    return serialize_mongo_value(updated)


async def delete_feedback_reward_rule(rule_id: str) -> dict:
    result = await db.feedback_reward_rules.update_one(
        {"id": rule_id, "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": _now_iso(), "is_active": False, "updated_at": _now_iso()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Feedback reward rule not found")
    return {"message": "Feedback reward rule deleted"}


async def list_feedback_submissions(limit: int = MAX_LIMIT) -> List[dict]:
    submissions = await db.feedback_submissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, MAX_LIMIT))
    return serialize_mongo_value(submissions)


async def update_feedback_submission_homepage_status(
    submission_id: str,
    payload: FeedbackSubmissionHomepageUpdate,
) -> dict:
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    if payload.show_on_homepage is True and "homepage_status" not in update_data:
        update_data["homepage_status"] = "approved"
    if payload.homepage_status in {"hidden", "pending"} and "show_on_homepage" not in update_data:
        update_data["show_on_homepage"] = False

    update_data["updated_at"] = _now_iso()
    updated = await db.feedback_submissions.find_one_and_update(
        {"id": submission_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Feedback submission not found")
    return serialize_mongo_value(updated)
