from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from core.auth import get_admin_user
from services.product_service import (
    get_products as fetch_products,
    get_featured_products as fetch_featured_products,
    get_bestsellers as fetch_bestseller_products,
    get_product as fetch_product_by_id,
    create_product as create_product_doc,
    update_product as update_product_doc,
    delete_product as delete_product_doc,
    generate_product_variants as generate_product_variants_for_product,
    get_product_variant_stock as fetch_product_variant_stock,
)
from models.product import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter(prefix="/api/products", tags=["Products"])


# ==================== PRODUCT ROUTES ====================

@router.get("", response_model=List[ProductResponse])
async def get_products(
    category_id: Optional[str] = None,
    search: Optional[str] = None,
    on_sale: Optional[bool] = None,
    featured: Optional[bool] = None,
    bestseller: Optional[bool] = None,
    new_arrival: Optional[bool] = None,
    active_only: Optional[bool] = True,
):
    return await fetch_products(
        category_id=category_id,
        search=search,
        on_sale=on_sale,
        featured=featured,
        bestseller=bestseller,
        new_arrival=new_arrival,
        active_only=active_only,
    )


@router.get("/featured", response_model=List[ProductResponse])
async def get_featured_products():
    return await fetch_featured_products()


@router.get("/bestsellers", response_model=List[ProductResponse])
async def get_bestsellers():
    return await fetch_bestseller_products()


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    return await fetch_product_by_id(product_id)


@router.post("/admin", response_model=ProductResponse)
async def create_product(product: ProductCreate, admin: dict = Depends(get_admin_user)):
    return await create_product_doc(product)


@router.put("/admin/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product: ProductUpdate, admin: dict = Depends(get_admin_user)):
    return await update_product_doc(product_id, product)


@router.delete("/admin/{product_id}", response_model=dict)
async def delete_product(product_id: str, admin: dict = Depends(get_admin_user)):
    return await delete_product_doc(product_id)


@router.post("/admin/{product_id}/generate-variants", response_model=ProductResponse)
async def generate_product_variants(product_id: str, admin: dict = Depends(get_admin_user)):
    return await generate_product_variants_for_product(product_id)


@router.get("/{product_id}/stock", response_model=dict)
async def get_product_variant_stock(product_id: str, color_id: Optional[str] = None, flavor_id: Optional[str] = None):
    return await fetch_product_variant_stock(
        product_id=product_id,
        color_id=color_id,
        flavor_id=flavor_id,
    )