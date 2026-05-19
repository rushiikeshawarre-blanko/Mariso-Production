from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from services.category_service import (
    get_all_categories,
    get_category_by_id,
    create_category_doc,
    update_category_doc,
    delete_category_doc,
    get_parent_categories,
    get_child_categories,
    get_category_tree as get_category_tree_data,
)

from core.auth import get_admin_user

router = APIRouter(prefix="/api/categories", tags=["Categories"])
CACHE_CONTROL_PUBLIC_CATALOG = "public, max-age=60, stale-while-revalidate=300"

# ==================== MODELS ====================

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    image: Optional[str] = ""
    slug: Optional[str] = ""
    parent_id: Optional[str] = None
    show_in_nav: bool = False
    sort_order: int = 0
    is_active: bool = True

class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    image: str
    slug: str
    parent_id: Optional[str] = None
    show_in_nav: bool
    sort_order: int
    is_active: bool
    created_at: str

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    slug: Optional[str] = None
    parent_id: Optional[str] = None
    show_in_nav: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None



@router.get("", response_model=List[CategoryResponse])
async def get_categories(response: Response):
    response.headers["Cache-Control"] = CACHE_CONTROL_PUBLIC_CATALOG
    return await get_all_categories()

@router.get("/parents", response_model=List[CategoryResponse])
async def get_parent_category_list():
    return await get_parent_categories()

@router.get("/tree", response_model=List[dict])
async def get_category_tree():
    return await get_category_tree_data()

@router.get("/{parent_id}/children", response_model=List[CategoryResponse])
async def get_child_category_list(parent_id: str):
    return await get_child_categories(parent_id)

@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: str):
    return await get_category_by_id(category_id)


@router.post("/admin", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, admin: dict = Depends(get_admin_user)):
    category_doc = {
        "id": str(uuid.uuid4()),
        "name": category.name,
        "description": category.description or "",
        "image": category.image or "",
        "slug": category.slug or "",
        "parent_id": category.parent_id,
        "show_in_nav": category.show_in_nav,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return await create_category_doc(category_doc)


@router.delete("/admin/{category_id}", response_model=dict)
async def delete_category(category_id: str, admin: dict = Depends(get_admin_user)):
    return await delete_category_doc(category_id)

@router.put("/admin/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, category: CategoryUpdate, admin: dict = Depends(get_admin_user)):
    update_data = category.model_dump(exclude_unset=True)
    return await update_category_doc(category_id, update_data)
