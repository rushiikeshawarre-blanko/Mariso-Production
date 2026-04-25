from fastapi import APIRouter, Depends
from models.address import AddressCreate
from core.auth import get_current_user
from services.address_service import add_address, delete_address, get_addresses


router = APIRouter(prefix="/api", tags=["addresses"])

# ==================== ADDRESS ROUTES ====================
@router.get("/addresses", response_model=list[dict])
async def get_addresses_route(user: dict = Depends(get_current_user)):
    return await get_addresses(user["id"])


@router.post("/addresses", response_model=dict)
async def add_address_route(address: AddressCreate, user: dict = Depends(get_current_user)):
    return await add_address(user["id"], address)


@router.delete("/addresses/{address_id}", response_model=dict)
async def delete_address_route(address_id: str, user: dict = Depends(get_current_user)):
    return await delete_address(user["id"], address_id)
