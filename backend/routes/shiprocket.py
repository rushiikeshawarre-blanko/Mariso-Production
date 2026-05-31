from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.shiprocket_service import check_shiprocket_serviceability, is_valid_india_pincode


router = APIRouter(prefix="/api/shiprocket", tags=["Shiprocket"])


class ShiprocketServiceabilityRequest(BaseModel):
    pincode: str
    product_id: Optional[str] = None
    quantity: int = 1


@router.post("/serviceability", response_model=dict)
async def shiprocket_serviceability(payload: ShiprocketServiceabilityRequest):
    pincode = str(payload.pincode or "").strip()
    if not is_valid_india_pincode(pincode):
        raise HTTPException(status_code=400, detail="Enter a valid 6-digit India pincode")

    return check_shiprocket_serviceability(
        pincode=pincode,
        product_id=payload.product_id,
        quantity=payload.quantity,
    )
