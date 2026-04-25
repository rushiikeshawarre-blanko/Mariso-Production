from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from core.auth import get_admin_user
from services.admin_service import (
    get_dashboard_stats_service,
    export_orders_excel_service,
    get_customers_service,
)

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/admin/dashboard", response_model=dict)
async def get_dashboard_stats(
    period: str = Query("monthly"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    month: Optional[str] = None,
    admin: dict = Depends(get_admin_user),
):
    return await get_dashboard_stats_service(period, start_date, end_date, month)


@router.get("/admin/export-orders")
async def export_orders_excel(
    period: str = Query("monthly"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    month: Optional[str] = None,
    admin: dict = Depends(get_admin_user),
):
    return await export_orders_excel_service(period, start_date, end_date, month)


@router.get("/admin/customers", response_model=List[dict])
async def get_customers(admin: dict = Depends(get_admin_user)):
    return await get_customers_service()