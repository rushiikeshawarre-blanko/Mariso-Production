from typing import List, Optional
from fastapi import APIRouter, Depends
from models.order import OrderCreate, OrderStatusUpdate
from core.auth import get_current_user, get_admin_user
from services.order_service import (
    create_order,
    get_user_orders,
    get_order,
    get_all_orders,
    update_order_status,
)

router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/orders", response_model=dict)
async def create_order_route(order: OrderCreate, user: dict = Depends(get_current_user)):
    return await create_order(order, user)


@router.get("/orders", response_model=List[dict])
async def get_user_orders_route(user: dict = Depends(get_current_user), limit: int = 100):
    return await get_user_orders(user["id"], limit)


@router.get("/orders/{order_id}", response_model=dict)
async def get_order_route(order_id: str, user: dict = Depends(get_current_user)):
    return await get_order(order_id, user)


@router.get("/admin/orders", response_model=List[dict])
async def get_all_orders_route(order_status: Optional[str] = None, admin: dict = Depends(get_admin_user), limit: int = 1000):
    return await get_all_orders(order_status, limit)


@router.put("/admin/orders/{order_id}/status", response_model=dict)
async def update_order_status_route(order_id: str, status_update: OrderStatusUpdate, admin: dict = Depends(get_admin_user)):
    return await update_order_status(order_id, status_update, admin["id"])