

from typing import List, Optional

from fastapi import APIRouter, Depends, Response

from core.auth import get_admin_user
from models.content import (
    ContentPageCreate,
    ContentPageUpdate,
    ContentPageResponse,
    FAQCreate,
    FAQUpdate,
    FAQResponse,
    HomepageSettingsPayload,
    HomepageSettingsResponse,
)
from services.content_service import (
    get_homepage_settings,
    upsert_homepage_settings,
    list_content_pages,
    get_content_page_by_slug,
    create_content_page,
    update_content_page,
    delete_content_page,
    list_faqs,
    create_faq,
    update_faq,
    delete_faq,
)

router = APIRouter(prefix="/api/content", tags=["Content"])
CACHE_CONTROL_PUBLIC_CATALOG = "public, max-age=60, stale-while-revalidate=300"


@router.get("/homepage", response_model=Optional[HomepageSettingsResponse])
async def get_homepage(response: Response):
    response.headers["Cache-Control"] = CACHE_CONTROL_PUBLIC_CATALOG
    return await get_homepage_settings()


@router.get("/homepage/admin", response_model=Optional[HomepageSettingsResponse])
async def get_admin_homepage(admin: dict = Depends(get_admin_user)):
    return await get_homepage_settings()


@router.put("/homepage/admin", response_model=HomepageSettingsResponse)
async def update_admin_homepage(
    settings: HomepageSettingsPayload,
    admin: dict = Depends(get_admin_user),
):
    return await upsert_homepage_settings(settings)


@router.get("/pages", response_model=List[ContentPageResponse])
async def get_pages(
    response: Response,
    footer_only: bool = False,
):
    response.headers["Cache-Control"] = CACHE_CONTROL_PUBLIC_CATALOG
    return await list_content_pages(active_only=True, footer_only=footer_only)


@router.get("/pages/admin", response_model=List[ContentPageResponse])
async def get_admin_pages(
    footer_only: bool = False,
    admin: dict = Depends(get_admin_user),
):
    return await list_content_pages(active_only=False, footer_only=footer_only)


@router.get("/pages/{slug}", response_model=ContentPageResponse)
async def get_page_by_slug(
    slug: str,
):
    return await get_content_page_by_slug(slug=slug, active_only=True)


@router.post("/pages/admin", response_model=ContentPageResponse)
async def create_page(
    page: ContentPageCreate,
    admin: dict = Depends(get_admin_user),
):
    return await create_content_page(page)


@router.put("/pages/admin/{page_id}", response_model=ContentPageResponse)
async def update_page(
    page_id: str,
    page: ContentPageUpdate,
    admin: dict = Depends(get_admin_user),
):
    return await update_content_page(page_id, page)


@router.delete("/pages/admin/{page_id}", response_model=dict)
async def delete_page(
    page_id: str,
    admin: dict = Depends(get_admin_user),
):
    return await delete_content_page(page_id)


@router.get("/faqs", response_model=List[FAQResponse])
async def get_faqs(
    homepage_only: bool = False,
):
    return await list_faqs(active_only=True, homepage_only=homepage_only)


@router.get("/faqs/homepage", response_model=List[FAQResponse])
async def get_homepage_faqs(response: Response):
    response.headers["Cache-Control"] = CACHE_CONTROL_PUBLIC_CATALOG
    return await list_faqs(active_only=True, homepage_only=True)


@router.post("/faqs/admin", response_model=FAQResponse)
async def create_faq_item(
    faq: FAQCreate,
    admin: dict = Depends(get_admin_user),
):
    return await create_faq(faq)


@router.put("/faqs/admin/{faq_id}", response_model=FAQResponse)
async def update_faq_item(
    faq_id: str,
    faq: FAQUpdate,
    admin: dict = Depends(get_admin_user),
):
    return await update_faq(faq_id, faq)


@router.delete("/faqs/admin/{faq_id}", response_model=dict)
async def delete_faq_item(
    faq_id: str,
    admin: dict = Depends(get_admin_user),
):
    return await delete_faq(faq_id)

@router.get("/faqs/admin", response_model=List[FAQResponse])
async def get_admin_faqs(
    homepage_only: bool = False,
    admin: dict = Depends(get_admin_user),
):
    return await list_faqs(active_only=False, homepage_only=homepage_only)
