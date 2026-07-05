import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.constants import ORDER_STATUS_DELIVERED
from core.database import db
from email_service import send_feedback_reward_email
from services.order_service import ensure_order_feedback_token
from services.settings_service import get_admin_settings
from whatsapp_service import send_feedback_reward_whatsapp


logger = logging.getLogger(__name__)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw_value = os.environ.get(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError:
        logger.warning("Invalid integer environment value: %s=%s; using %s", name, raw_value, default)
        value = default
    return max(value, minimum)


FEEDBACK_SCHEDULER_INTERVAL_MINUTES = _env_int("FEEDBACK_SCHEDULER_INTERVAL_MINUTES", 15)
FEEDBACK_SCHEDULER_DRY_RUN = (
    os.environ.get("FEEDBACK_SCHEDULER_DRY_RUN", "true").strip().lower() != "false"
)
FEEDBACK_SCHEDULER_ENABLED = (
    os.environ.get("FEEDBACK_SCHEDULER_ENABLED", "true").strip().lower() != "false"
)
FEEDBACK_PROCESSING_LOCK_MINUTES = _env_int("FEEDBACK_PROCESSING_LOCK_MINUTES", 120)
FEEDBACK_BATCH_LIMIT = _env_int("FEEDBACK_BATCH_LIMIT", 100)

_scheduler_task: Optional[asyncio.Task] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _stale_processing_cutoff() -> str:
    return (_now() - timedelta(minutes=FEEDBACK_PROCESSING_LOCK_MINUTES)).isoformat()


def _channel_sent_field(channel: str) -> str:
    return f"feedback_{channel}_sent_at"


def _channel_error_field(channel: str) -> str:
    return f"feedback_{channel}_error"


def _channel_failed_field(channel: str) -> str:
    return f"feedback_{channel}_failed_at"


async def _find_due_feedback_orders(delay_hours: int) -> list[dict]:
    due_before = (_now() - timedelta(hours=delay_hours)).isoformat()
    query = {
        "status": ORDER_STATUS_DELIVERED,
        "delivered_at": {"$lte": due_before},
        "$and": [
            {
                "$or": [
                    {"feedback_sent_at": {"$exists": False}},
                    {"feedback_sent_at": None},
                    {"feedback_sent_at": ""},
                ]
            },
            {
                "$or": [
                    {"feedback_processing_started_at": {"$exists": False}},
                    {"feedback_processing_started_at": None},
                    {"feedback_processing_started_at": ""},
                ]
            },
            {
                "$or": [
                    {"feedback_email_sent_at": {"$exists": False}},
                    {"feedback_email_sent_at": None},
                    {"feedback_email_sent_at": ""},
                    {"feedback_whatsapp_sent_at": {"$exists": False}},
                    {"feedback_whatsapp_sent_at": None},
                    {"feedback_whatsapp_sent_at": ""},
                ]
            },
        ],
    }
    return await db.orders.find(query, {"_id": 0}).sort("delivered_at", 1).to_list(FEEDBACK_BATCH_LIMIT)


async def _reset_stale_feedback_locks() -> int:
    result = await db.orders.update_many(
        {
            "$or": [
                {"feedback_sent_at": {"$exists": False}},
                {"feedback_sent_at": None},
                {"feedback_sent_at": ""},
            ],
            "feedback_processing_started_at": {
                "$type": "string",
                "$lte": _stale_processing_cutoff(),
            },
        },
        {
            "$set": {
                "feedback_processing_started_at": None,
                "updated_at": _now_iso(),
            }
        },
    )
    reset_count = getattr(result, "modified_count", 0)
    if reset_count:
        logger.warning("Feedback scheduler reset stale processing locks: count=%s", reset_count)
    return reset_count


async def _claim_feedback_order(order_id: str, delay_hours: int) -> Optional[dict]:
    due_before = (_now() - timedelta(hours=delay_hours)).isoformat()
    return await db.orders.find_one_and_update(
        {
            "id": order_id,
            "status": ORDER_STATUS_DELIVERED,
            "delivered_at": {"$lte": due_before},
            "$and": [
                {
                    "$or": [
                        {"feedback_sent_at": {"$exists": False}},
                        {"feedback_sent_at": None},
                        {"feedback_sent_at": ""},
                    ]
                },
                {
                    "$or": [
                        {"feedback_processing_started_at": {"$exists": False}},
                        {"feedback_processing_started_at": None},
                        {"feedback_processing_started_at": ""},
                    ]
                },
                {
                    "$or": [
                        {"feedback_email_sent_at": {"$exists": False}},
                        {"feedback_email_sent_at": None},
                        {"feedback_email_sent_at": ""},
                        {"feedback_whatsapp_sent_at": {"$exists": False}},
                        {"feedback_whatsapp_sent_at": None},
                        {"feedback_whatsapp_sent_at": ""},
                    ]
                }
            ],
        },
        {"$set": {"feedback_processing_started_at": _now_iso(), "updated_at": _now_iso()}},
        projection={"_id": 0},
    )


async def _mark_feedback_channel_sent(order_id: str, channel: str) -> None:
    sent_field = _channel_sent_field(channel)
    error_field = _channel_error_field(channel)
    now = _now_iso()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                sent_field: now,
                "updated_at": now,
            },
            "$unset": {
                error_field: "",
            },
        },
    )


async def _mark_feedback_channel_failed(order_id: str, channel: str, error: str) -> None:
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                _channel_failed_field(channel): _now_iso(),
                _channel_error_field(channel): str(error or "send_failed")[:500],
                "updated_at": _now_iso(),
            },
        },
    )


async def _release_feedback_order_lock(order_id: str) -> None:
    await db.orders.update_one(
        {
            "id": order_id,
            "$or": [
                {"feedback_sent_at": {"$exists": False}},
                {"feedback_sent_at": None},
                {"feedback_sent_at": ""},
            ],
        },
        {"$set": {"feedback_processing_started_at": None, "updated_at": _now_iso()}},
    )


async def _mark_feedback_complete_if_ready(order_id: str) -> None:
    order = await db.orders.find_one(
        {"id": order_id},
        {
            "_id": 0,
            "feedback_email_sent_at": 1,
            "feedback_whatsapp_sent_at": 1,
            "feedback_sent_at": 1,
        },
    )
    if not order or order.get("feedback_sent_at"):
        return
    if not order.get("feedback_email_sent_at") or not order.get("feedback_whatsapp_sent_at"):
        return

    await db.orders.update_one(
        {
            "id": order_id,
            "$or": [
                {"feedback_sent_at": {"$exists": False}},
                {"feedback_sent_at": None},
                {"feedback_sent_at": ""},
            ],
        },
        {
            "$set": {
                "feedback_sent_at": _now_iso(),
                "feedback_processing_started_at": None,
                "updated_at": _now_iso(),
            }
        },
    )


async def _send_feedback_email(order: dict) -> bool:
    order_id = order.get("id")
    if order.get("feedback_email_sent_at"):
        logger.info("Feedback email skipped already sent: order_id=%s", order_id)
        return False

    try:
        result = send_feedback_reward_email(order)
        if not result.get("success"):
            await _mark_feedback_channel_failed(order_id, "email", result.get("error"))
            logger.warning("Feedback email failed: order_id=%s error=%s", order_id, result.get("error"))
            return False

        await _mark_feedback_channel_sent(order_id, "email")
        logger.info("Feedback email sent: order_id=%s", order_id)
        return True
    except Exception as exc:
        await _mark_feedback_channel_failed(order_id, "email", exc.__class__.__name__)
        logger.exception("Feedback email failed unexpectedly: order_id=%s", order_id)
        return False


async def _send_feedback_whatsapp(order: dict) -> bool:
    order_id = order.get("id")
    if order.get("feedback_whatsapp_sent_at"):
        logger.info("Feedback WhatsApp skipped already sent: order_id=%s", order_id)
        return False

    try:
        result = send_feedback_reward_whatsapp(order)
        if not result.get("success"):
            await _mark_feedback_channel_failed(order_id, "whatsapp", result.get("error"))
            logger.warning("Feedback WhatsApp failed: order_id=%s error=%s", order_id, result.get("error"))
            return False

        await _mark_feedback_channel_sent(order_id, "whatsapp")
        logger.info("Feedback WhatsApp sent: order_id=%s", order_id)
        return True
    except Exception as exc:
        await _mark_feedback_channel_failed(order_id, "whatsapp", exc.__class__.__name__)
        logger.exception("Feedback WhatsApp failed unexpectedly: order_id=%s", order_id)
        return False


async def process_due_feedback_notifications(*, dry_run: Optional[bool] = None) -> dict:
    settings = await get_admin_settings()
    delay_hours = settings["feedback_delay_hours"]
    dry_run_enabled = FEEDBACK_SCHEDULER_DRY_RUN if dry_run is None else dry_run
    reset_count = await _reset_stale_feedback_locks()
    due_orders = await _find_due_feedback_orders(delay_hours)

    logger.info(
        "Feedback scheduler scan: eligible_orders=%s delay_hours=%s dry_run=%s",
        len(due_orders),
        delay_hours,
        dry_run_enabled,
    )

    stats = {
        "eligible_orders": len(due_orders),
        "processed_orders": 0,
        "email_sent": 0,
        "email_failed": 0,
        "whatsapp_sent": 0,
        "whatsapp_failed": 0,
        "dry_run": dry_run_enabled,
        "feedback_delay_hours": delay_hours,
        "stale_locks_reset": reset_count,
    }

    for order in due_orders:
        order_id = order.get("id")
        delivered_at = _parse_iso_datetime(order.get("delivered_at"))
        if not order_id or not delivered_at:
            logger.warning("Feedback scheduler skipped malformed order: order_id=%s", order_id)
            continue

        logger.info("Feedback scheduler processing order_id=%s", order_id)
        if dry_run_enabled:
            stats["processed_orders"] += 1
            continue

        claimed_order = await _claim_feedback_order(order_id, delay_hours)
        if not claimed_order:
            logger.info("Feedback scheduler skipped already claimed or sent order_id=%s", order_id)
            continue
        logger.info("Feedback order claimed by scheduler: order_id=%s", order_id)
        order = claimed_order

        try:
            order["feedback_token"] = await ensure_order_feedback_token(order)
        except Exception:
            logger.exception("Feedback scheduler skipped order without feedback token: order_id=%s", order_id)
            stats["processed_orders"] += 1
            stats["email_failed"] += 1
            stats["whatsapp_failed"] += 1
            await _release_feedback_order_lock(order_id)
            continue

        email_sent = True
        whatsapp_sent = True

        if not order.get("feedback_email_sent_at"):
            email_sent = await _send_feedback_email(order)
            stats["email_sent" if email_sent else "email_failed"] += 1

        if not order.get("feedback_whatsapp_sent_at"):
            whatsapp_sent = await _send_feedback_whatsapp(order)
            stats["whatsapp_sent" if whatsapp_sent else "whatsapp_failed"] += 1

        await _mark_feedback_complete_if_ready(order_id)
        await _release_feedback_order_lock(order_id)
        stats["processed_orders"] += 1

        logger.info(
            "Feedback scheduler processed order_id=%s email_sent=%s whatsapp_sent=%s",
            order_id,
            email_sent,
            whatsapp_sent,
        )

    return stats


async def _feedback_scheduler_loop() -> None:
    interval_seconds = max(FEEDBACK_SCHEDULER_INTERVAL_MINUTES, 1) * 60
    while True:
        try:
            await process_due_feedback_notifications()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Feedback scheduler run failed")
        await asyncio.sleep(interval_seconds)


def start_feedback_scheduler() -> Optional[asyncio.Task]:
    global _scheduler_task
    if not FEEDBACK_SCHEDULER_ENABLED:
        logger.info("Feedback scheduler disabled: FEEDBACK_SCHEDULER_ENABLED=false")
        return None
    if _scheduler_task and not _scheduler_task.done():
        return _scheduler_task

    _scheduler_task = asyncio.create_task(_feedback_scheduler_loop())
    logger.info(
        "Feedback scheduler started: interval_minutes=%s dry_run=%s",
        FEEDBACK_SCHEDULER_INTERVAL_MINUTES,
        FEEDBACK_SCHEDULER_DRY_RUN,
    )
    return _scheduler_task


async def stop_feedback_scheduler() -> None:
    global _scheduler_task
    if not _scheduler_task:
        return
    _scheduler_task.cancel()
    try:
        await _scheduler_task
    except asyncio.CancelledError:
        logger.info("Feedback scheduler stopped")
    _scheduler_task = None
