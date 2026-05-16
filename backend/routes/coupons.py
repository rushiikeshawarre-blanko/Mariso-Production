from fastapi import APIRouter, Depends
from typing import List

from core.auth import get_admin_user
from models.coupon import (
    CouponCreate,
    CouponResponse,
    CouponToggle,
    CouponUpdate,
    CouponValidationRequest,
    CouponValidationResponse,
)
from services.coupon_service import (
    create_coupon as create_coupon_doc,
    delete_coupon as delete_coupon_doc,
    get_coupon as fetch_coupon,
    get_coupons as fetch_coupons,
    toggle_coupon as toggle_coupon_doc,
    update_coupon as update_coupon_doc,
    validate_coupon as validate_coupon_doc,
)


router = APIRouter(prefix="/api", tags=["Coupons"])


@router.get("/admin/coupons", response_model=List[CouponResponse])
async def get_admin_coupons(admin: dict = Depends(get_admin_user)):
    return await fetch_coupons()


@router.post("/admin/coupons", response_model=CouponResponse)
async def create_admin_coupon(coupon: CouponCreate, admin: dict = Depends(get_admin_user)):
    return await create_coupon_doc(coupon)


@router.get("/admin/coupons/{coupon_id}", response_model=CouponResponse)
async def get_admin_coupon(coupon_id: str, admin: dict = Depends(get_admin_user)):
    return await fetch_coupon(coupon_id)


@router.put("/admin/coupons/{coupon_id}", response_model=CouponResponse)
async def update_admin_coupon(coupon_id: str, coupon: CouponUpdate, admin: dict = Depends(get_admin_user)):
    return await update_coupon_doc(coupon_id, coupon)


@router.patch("/admin/coupons/{coupon_id}/toggle", response_model=CouponResponse)
async def toggle_admin_coupon(
    coupon_id: str,
    payload: CouponToggle = CouponToggle(),
    admin: dict = Depends(get_admin_user),
):
    return await toggle_coupon_doc(coupon_id, payload.is_active)


@router.delete("/admin/coupons/{coupon_id}", response_model=dict)
async def delete_admin_coupon(coupon_id: str, admin: dict = Depends(get_admin_user)):
    return await delete_coupon_doc(coupon_id)


@router.post("/coupons/validate", response_model=CouponValidationResponse, response_model_exclude_none=True)
async def validate_coupon(coupon: CouponValidationRequest):
    return await validate_coupon_doc(coupon)
