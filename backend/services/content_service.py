

from datetime import datetime, timezone
import uuid
from typing import List

from fastapi import HTTPException
from pymongo import ReturnDocument

from core.constants import MAX_LIMIT
from core.database import db
from models.content import (
    ContentPageCreate,
    ContentPageUpdate,
    FAQCreate,
    FAQUpdate,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def list_content_pages(active_only: bool = True, footer_only: bool = False) -> List[dict]:
    query = {}
    if active_only:
        query["is_active"] = True
    if footer_only:
        query["show_in_footer"] = True

    pages = await db.content_pages.find(query, {"_id": 0}).sort("sort_order", 1).to_list(MAX_LIMIT)
    return pages


async def get_content_page_by_slug(slug: str, active_only: bool = True) -> dict:
    query = {"slug": slug}
    if active_only:
        query["is_active"] = True

    page = await db.content_pages.find_one(query, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Content page not found")
    return page


async def create_content_page(page: ContentPageCreate) -> dict:
    existing_slug = await db.content_pages.find_one({"slug": page.slug}, {"_id": 0, "id": 1})
    if existing_slug:
        raise HTTPException(status_code=400, detail="A content page with this slug already exists")

    now = utc_now_iso()
    page_doc = {
        "id": str(uuid.uuid4()),
        "title": page.title,
        "slug": page.slug,
        "footer_label": page.footer_label,
        "content": page.content,
        "is_active": page.is_active,
        "show_in_footer": page.show_in_footer,
        "sort_order": page.sort_order,
        "external_url": page.external_url,
        "created_at": now,
        "updated_at": now,
    }

    await db.content_pages.insert_one(page_doc)
    created = await db.content_pages.find_one({"id": page_doc["id"]}, {"_id": 0})
    return created


async def update_content_page(page_id: str, page: ContentPageUpdate) -> dict:
    existing = await db.content_pages.find_one({"id": page_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Content page not found")

    update_data = page.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    new_slug = update_data.get("slug")
    if new_slug and new_slug != existing.get("slug"):
        slug_conflict = await db.content_pages.find_one({"slug": new_slug, "id": {"$ne": page_id}}, {"_id": 0, "id": 1})
        if slug_conflict:
            raise HTTPException(status_code=400, detail="A content page with this slug already exists")

    update_data["updated_at"] = utc_now_iso()

    updated = await db.content_pages.find_one_and_update(
        {"id": page_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Content page not found")
    return updated


async def delete_content_page(page_id: str) -> dict:
    result = await db.content_pages.delete_one({"id": page_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Content page not found")
    return {"message": "Content page deleted"}


async def list_faqs(active_only: bool = True, homepage_only: bool = False) -> List[dict]:
    query = {}
    if active_only:
        query["is_active"] = True
    if homepage_only:
        query["show_on_homepage"] = True

    faqs = await db.faqs.find(query, {"_id": 0}).sort("sort_order", 1).to_list(MAX_LIMIT)
    return faqs


async def create_faq(faq: FAQCreate) -> dict:
    now = utc_now_iso()
    faq_doc = {
        "id": str(uuid.uuid4()),
        "question": faq.question,
        "answer": faq.answer,
        "is_active": faq.is_active,
        "show_on_homepage": faq.show_on_homepage,
        "sort_order": faq.sort_order,
        "created_at": now,
        "updated_at": now,
    }

    await db.faqs.insert_one(faq_doc)
    created = await db.faqs.find_one({"id": faq_doc["id"]}, {"_id": 0})
    return created


async def update_faq(faq_id: str, faq: FAQUpdate) -> dict:
    existing = await db.faqs.find_one({"id": faq_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="FAQ not found")

    update_data = faq.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    update_data["updated_at"] = utc_now_iso()

    updated = await db.faqs.find_one_and_update(
        {"id": faq_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return updated


async def delete_faq(faq_id: str) -> dict:
    result = await db.faqs.delete_one({"id": faq_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return {"message": "FAQ deleted"}