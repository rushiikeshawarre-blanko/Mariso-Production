from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from core.auth import get_admin_user, get_current_user
from services.upload_service import (
    upload_image,
    get_image,
    create_presigned_upload,
    is_homepage_upload_folder,
)

router = APIRouter(prefix="/api", tags=["uploads"])

class PresignUploadRequest(BaseModel):
    filename: str
    content_type: str
    folder: str

@router.post("/uploads/presign", response_model=dict)
async def create_presigned_upload_route(
    payload: PresignUploadRequest,
    user: dict = Depends(get_current_user),
):
    if is_homepage_upload_folder(payload.folder):
        raise HTTPException(status_code=403, detail="Homepage media uploads require admin access")

    return await create_presigned_upload(
        filename=payload.filename,
        content_type=payload.content_type,
        folder=payload.folder,
    )

@router.post("/uploads/homepage/presign", response_model=dict)
async def create_homepage_presigned_upload_route(
    payload: PresignUploadRequest,
    admin: dict = Depends(get_admin_user),
):
    if not is_homepage_upload_folder(payload.folder):
        raise HTTPException(status_code=400, detail="Unsupported homepage upload folder")

    return await create_presigned_upload(
        filename=payload.filename,
        content_type=payload.content_type,
        folder=payload.folder,
    )

# ==================== IMAGE UPLOAD ROUTE ====================

@router.post("/upload", response_model=dict)
async def upload_image_route(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    return await upload_image(file)


@router.get("/images/{image_id}")
async def get_image_route(image_id: str):
    return await get_image(image_id)
