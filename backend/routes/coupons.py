from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import List, Optional

from core.auth import get_admin_user, get_current_user
from models.coupon import (
    AvailableCouponResponse,
    AvailableCouponsRequest,
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
    get_available_coupons as fetch_available_coupons,
    get_coupon as fetch_coupon,
    get_coupons as fetch_coupons,
    toggle_coupon as toggle_coupon_doc,
    update_coupon as update_coupon_doc,
    validate_coupon as validate_coupon_doc,
)


router = APIRouter(prefix="/api", tags=["Coupons"])
optional_security = HTTPBearer(auto_error=False)


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> Optional[dict]:
    if credentials is None:
        return None
    return await get_current_user(credentials)


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
async def validate_coupon(
    coupon: CouponValidationRequest,
    user: Optional[dict] = Depends(get_optional_current_user),
):
    return await validate_coupon_doc(coupon, current_user=user)


@router.post("/coupons/available", response_model=List[AvailableCouponResponse], response_model_exclude_none=True)
async def get_available_coupons(
    payload: AvailableCouponsRequest,
    user: Optional[dict] = Depends(get_optional_current_user),
):
    return await fetch_available_coupons(payload, current_user=user)
