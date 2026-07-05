import os
from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo import ReturnDocument
from pydantic import BaseModel, Field

from core.database import db


SYSTEM_SETTINGS_KEY = "system"
DEFAULT_FEEDBACK_DELAY_HOURS = 28
MIN_FEEDBACK_DELAY_HOURS = 1
MAX_FEEDBACK_DELAY_HOURS = 168


class AdminSettingsUpdate(BaseModel):
    feedback_delay_hours: int = Field(
        ...,
        ge=MIN_FEEDBACK_DELAY_HOURS,
        le=MAX_FEEDBACK_DELAY_HOURS,
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_feedback_delay_hours() -> int:
    raw_value = os.environ.get("FEEDBACK_DELAY_HOURS", str(DEFAULT_FEEDBACK_DELAY_HOURS)).strip()
    try:
        delay_hours = int(raw_value)
    except ValueError:
        delay_hours = DEFAULT_FEEDBACK_DELAY_HOURS
    return min(max(delay_hours, MIN_FEEDBACK_DELAY_HOURS), MAX_FEEDBACK_DELAY_HOURS)


def default_admin_settings() -> dict:
    return {
        "feedback_delay_hours": _env_feedback_delay_hours(),
    }


async def get_admin_settings() -> dict:
    settings = await db.system_settings.find_one({"key": SYSTEM_SETTINGS_KEY}, {"_id": 0})
    defaults = default_admin_settings()
    if not settings:
        return defaults

    feedback_delay_hours = settings.get("feedback_delay_hours", defaults["feedback_delay_hours"])
    try:
        feedback_delay_hours = int(feedback_delay_hours)
    except (TypeError, ValueError):
        feedback_delay_hours = defaults["feedback_delay_hours"]

    return {
        **settings,
        "feedback_delay_hours": min(
            max(feedback_delay_hours, MIN_FEEDBACK_DELAY_HOURS),
            MAX_FEEDBACK_DELAY_HOURS,
        ),
    }


async def update_admin_settings(payload: AdminSettingsUpdate) -> dict:
    if not MIN_FEEDBACK_DELAY_HOURS <= payload.feedback_delay_hours <= MAX_FEEDBACK_DELAY_HOURS:
        raise HTTPException(status_code=400, detail="feedback_delay_hours must be between 1 and 168")

    now = _now_iso()
    updated = await db.system_settings.find_one_and_update(
        {"key": SYSTEM_SETTINGS_KEY},
        {
            "$set": {
                "key": SYSTEM_SETTINGS_KEY,
                "feedback_delay_hours": payload.feedback_delay_hours,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    return updated
