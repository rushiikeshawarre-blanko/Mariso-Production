from fastapi import APIRouter, UploadFile, File, Depends
from core.auth import get_current_user
from services.upload_service import upload_image, get_image

router = APIRouter(prefix="/api", tags=["uploads"])

# ==================== IMAGE UPLOAD ROUTE ====================

@router.post("/upload", response_model=dict)
async def upload_image_route(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    return await upload_image(file)


@router.get("/images/{image_id}")
async def get_image_route(image_id: str):
    return await get_image(image_id)