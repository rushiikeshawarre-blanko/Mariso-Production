from typing import List, Dict, Optional
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from core.database import db
from utils.helpers import allocate_unique_slug, generate_slug, slug_exists


def normalize_category_doc(category: dict) -> dict:
    return {
        "slug": "",
        "parent_id": None,
        "show_in_nav": False,
        "sort_order": 0,
        "is_active": True,
        **category,
    }


# ==================== CORE CATEGORY FUNCTIONS ====================

async def get_all_categories(active_only: bool = False) -> List[dict]:
    query = {"is_active": {"$ne": False}} if active_only else {}
    categories = await db.categories.find(query, {"_id": 0}).to_list(500)
    normalized = [normalize_category_doc(category) for category in categories]
    return sorted(normalized, key=lambda c: (c.get("sort_order", 0), c.get("name", "").lower()))


async def get_category_by_id(category_id: str, active_only: bool = False) -> dict:
    query = {"id": category_id}
    if active_only:
        query["is_active"] = {"$ne": False}
    category = await db.categories.find_one(query, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return normalize_category_doc(category)


async def get_optional_category_by_id(category_id: Optional[str]) -> Optional[dict]:
    if not category_id:
        return None
    category = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not category:
        return None
    return normalize_category_doc(category)


async def validate_parent_category(parent_id: Optional[str]) -> Optional[dict]:
    if not parent_id:
        return None

    parent = await get_optional_category_by_id(parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent category not found")

    if parent.get("parent_id"):
        raise HTTPException(status_code=400, detail="Parent category must be a top-level category")

    if not parent.get("is_active", True):
        raise HTTPException(status_code=400, detail="Parent category must be active")

    return parent


async def ensure_category_exists(category_id: str) -> None:
    category = await get_optional_category_by_id(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")


# ==================== CATEGORY MAP (USED BY PRODUCTS) ====================

async def get_parent_categories(active_only: bool = False, nav_only: bool = False) -> List[dict]:
    query = {"$or": [{"parent_id": None}, {"parent_id": ""}, {"parent_id": {"$exists": False}}]}
    if active_only:
        query["is_active"] = {"$ne": False}
    if nav_only:
        query["show_in_nav"] = True

    categories = await db.categories.find(query, {"_id": 0}).to_list(200)
    normalized = [normalize_category_doc(category) for category in categories]
    return sorted(normalized, key=lambda c: (c.get("sort_order", 0), c.get("name", "").lower()))


async def get_child_categories(parent_id: str, active_only: bool = False) -> List[dict]:
    query = {"parent_id": parent_id}
    if active_only:
        query["is_active"] = {"$ne": False}

    categories = await db.categories.find(query, {"_id": 0}).to_list(500)
    normalized = [normalize_category_doc(category) for category in categories]
    return sorted(normalized, key=lambda c: (c.get("sort_order", 0), c.get("name", "").lower()))


async def get_category_tree(active_only: bool = False, nav_only: bool = False) -> List[dict]:
    parents = await get_parent_categories(active_only=active_only, nav_only=nav_only)
    tree = []

    for parent in parents:
        children = await get_child_categories(parent["id"], active_only=active_only)
        tree.append({
            **parent,
            "children": children,
        })

    return tree

async def build_category_map_from_products(products: List[dict]) -> Dict[str, str]:
    category_ids = list({p.get("category_id") for p in products if p.get("category_id")})

    if not category_ids:
        return {}

    categories = await db.categories.find(
        {"id": {"$in": category_ids}},
        {"_id": 0}
    ).to_list(len(category_ids))

    normalized = [normalize_category_doc(category) for category in categories]
    return {c["id"]: c["name"] for c in normalized}


async def create_category_doc(category_data: dict) -> dict:
    await validate_parent_category(category_data.get("parent_id"))
    requested_slug = (category_data.get("slug") or "").strip()
    generated_slug = not requested_slug
    if requested_slug:
        slug = generate_slug(requested_slug)
        if not slug:
            raise HTTPException(status_code=400, detail="Category slug must contain letters or numbers")
        if await slug_exists(db.categories, slug):
            raise HTTPException(status_code=409, detail="A category with this slug already exists")
    else:
        slug = await allocate_unique_slug(db.categories, category_data.get("name", ""))
        if not slug:
            raise HTTPException(status_code=400, detail="Category name cannot generate a valid slug")
    category_data["slug"] = slug
    category_data = normalize_category_doc(category_data)
    try:
        await db.categories.insert_one(category_data)
    except DuplicateKeyError:
        if not generated_slug:
            raise HTTPException(status_code=409, detail="A category with this slug already exists")
        category_data["slug"] = await allocate_unique_slug(db.categories, category_data.get("name", ""))
        try:
            await db.categories.insert_one(category_data)
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="Unable to allocate a unique category slug")
    return category_data


async def update_category_doc(category_id: str, update_data: dict) -> dict:
    existing = await get_optional_category_by_id(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")

    next_parent_id = update_data.get("parent_id", existing.get("parent_id"))

    if next_parent_id == category_id:
        raise HTTPException(status_code=400, detail="Category cannot be its own parent")

    await validate_parent_category(next_parent_id)

    normalized_update = {
        key: value
        for key, value in update_data.items()
        if key in {"name", "description", "image", "slug", "parent_id", "show_in_nav", "sort_order", "is_active"}
    }

    if "slug" in normalized_update:
        requested_slug = (normalized_update.pop("slug") or "").strip()
        if requested_slug:
            normalized_slug = generate_slug(requested_slug)
            if not normalized_slug:
                raise HTTPException(status_code=400, detail="Category slug must contain letters or numbers")
            if await slug_exists(db.categories, normalized_slug, exclude_id=category_id):
                raise HTTPException(status_code=409, detail="A category with this slug already exists")
            normalized_update["slug"] = normalized_slug
        elif not (existing.get("slug") or "").strip():
            generated_slug = await allocate_unique_slug(
                db.categories,
                normalized_update.get("name", existing.get("name", "")),
                exclude_id=category_id,
            )
            if not generated_slug:
                raise HTTPException(status_code=400, detail="Category name cannot generate a valid slug")
            normalized_update["slug"] = generated_slug

    try:
        await db.categories.update_one({"id": category_id}, {"$set": normalized_update})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A category with this slug already exists")
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Category not found")
    return normalize_category_doc(updated)


async def delete_category_doc(category_id: str) -> dict:
    child_count = await db.categories.count_documents({"parent_id": category_id})
    if child_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete category with child categories")

    product_count = await db.products.count_documents({"category_id": category_id})
    if product_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete category that is assigned to products")

    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}
