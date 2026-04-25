
from fastapi import APIRouter, Depends
from typing import List
from core.auth import get_current_user
from models.wishlist import WishlistItem
from services.wishlist_service import add_to_wishlist, remove_from_wishlist, get_wishlist

router = APIRouter(prefix="/api", tags=["wishlist"])
# ==================== WISHLIST ROUTES ====================

@router.post("/wishlist", response_model=dict)
async def add_wishlist_item(item: WishlistItem, user: dict = Depends(get_current_user)):
    return await add_to_wishlist(user["id"], item.product_id)


@router.delete("/wishlist/{product_id}", response_model=dict)
async def delete_wishlist_item(product_id: str, user: dict = Depends(get_current_user)):
    return await remove_from_wishlist(user["id"], product_id)


@router.get("/wishlist", response_model=List[dict])
async def get_wishlist_items(user: dict = Depends(get_current_user)):
    return await get_wishlist(user["id"])