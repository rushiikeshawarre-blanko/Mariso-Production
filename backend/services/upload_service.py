from datetime import datetime, timezone
from pathlib import Path
import base64
import uuid

import boto3
from botocore.client import Config as BotoConfig
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from core.config import (
    AWS_ACCESS_KEY_ID,
    AWS_REGION,
    AWS_SECRET_ACCESS_KEY,
    CLOUDFRONT_BASE_URL,
    S3_BUCKET_NAME,
)
from core.database import db


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4": ".mp4",
}
ALLOWED_MEDIA_TYPES = {
    **ALLOWED_IMAGE_TYPES,
    **ALLOWED_VIDEO_TYPES,
}
MAX_IMAGE_SIZE_BYTES = 30 * 1024 * 1024  # 30MB
MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024  # 100MB
STATIC_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable"
HOMEPAGE_UPLOAD_FOLDERS = {
    "homepage/hero",
    "homepage/category-cards",
    "homepage/story",
    "homepage/artisans",
    "homepage/craft-process/images",
    "homepage/craft-process/videos",
    "homepage/journey",
}
HOMEPAGE_VIDEO_UPLOAD_FOLDERS = {
    "homepage/craft-process/videos",
}
ALLOWED_UPLOAD_FOLDERS = {
    "products/default",
    "products/gallery",
    "products/colors",
    "products/flavors",
    "products/videos",
    "categories/images",
} | HOMEPAGE_UPLOAD_FOLDERS

def _get_s3_client():
    if not AWS_REGION or not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY or not S3_BUCKET_NAME:
        raise HTTPException(
            status_code=500,
            detail="Image upload is not configured on the server",
        )

    return boto3.client(
        "s3",
        region_name=AWS_REGION,
        endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )


def _validate_content_type(content_type: str) -> str:
    normalized = (content_type or "").strip().lower()
    if normalized not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed types: JPG, PNG, GIF, WEBP, MP4",
        )
    return normalized


def _validate_folder(folder: str) -> str:
    normalized = (folder or "").strip().strip("/")
    if normalized not in ALLOWED_UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="Unsupported upload folder")
    return normalized


def is_homepage_upload_folder(folder: str) -> bool:
    return (folder or "").strip().strip("/") in HOMEPAGE_UPLOAD_FOLDERS


def _validate_homepage_media_type(folder: str, content_type: str) -> None:
    if folder not in HOMEPAGE_UPLOAD_FOLDERS:
        return

    if folder in HOMEPAGE_VIDEO_UPLOAD_FOLDERS:
        if content_type not in ALLOWED_VIDEO_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Homepage craft process videos must be MP4 files",
            )
        return

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Homepage image uploads must be JPG, PNG, GIF, or WEBP files",
        )


def _build_object_key(folder: str, content_type: str, filename: str | None = None) -> str:
    extension = ALLOWED_MEDIA_TYPES[content_type]

    if filename:
        suffix = Path(filename).suffix.lower()
        if suffix in ALLOWED_MEDIA_TYPES.values():
            extension = suffix

    return f"{folder}/{uuid.uuid4()}{extension}"


def _resolve_max_size_bytes(content_type: str) -> int:
    if content_type in ALLOWED_VIDEO_TYPES:
        return MAX_VIDEO_SIZE_BYTES
    return MAX_IMAGE_SIZE_BYTES


def build_delivery_url(object_key: str) -> str:
    if CLOUDFRONT_BASE_URL:
        return f"{CLOUDFRONT_BASE_URL}/{object_key}"

    return f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{object_key}"


async def create_presigned_upload(
    *,
    filename: str,
    content_type: str,
    folder: str,
    max_size_bytes: int | None = None,
) -> dict:
    validated_content_type = _validate_content_type(content_type)
    validated_folder = _validate_folder(folder)
    _validate_homepage_media_type(validated_folder, validated_content_type)
    resolved_max_size_bytes = max_size_bytes or _resolve_max_size_bytes(validated_content_type)
    object_key = _build_object_key(validated_folder, validated_content_type, filename)

    upload_url = _get_s3_client().generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": S3_BUCKET_NAME,
            "Key": object_key,
            "ContentType": validated_content_type,
            "CacheControl": STATIC_MEDIA_CACHE_CONTROL,
        },
        ExpiresIn=900,
    )

    return {
        "upload_url": upload_url,
        "key": object_key,
        "file_url": build_delivery_url(object_key),
        "content_type": validated_content_type,
        "cache_control": STATIC_MEDIA_CACHE_CONTROL,
        "max_size_bytes": resolved_max_size_bytes,
        "expires_in": 900,
    }


# ==================== LEGACY DIRECT-UPLOAD HELPERS ====================
# Kept temporarily so older test flows do not break while the new S3 upload
# path is being integrated into the admin UI.


async def upload_image(file: UploadFile):
    contents = await file.read()

    allowed_types = ["image/jpeg", "image/png", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds 30MB limit")

    encoded = base64.b64encode(contents).decode("utf-8")

    image_id = str(uuid.uuid4())
    image_doc = {
        "id": image_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "data": encoded,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.images.insert_one(image_doc)

    return {"url": f"/api/images/{image_id}", "id": image_id}


async def get_image(image_id: str):
    image = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    content = base64.b64decode(image["data"])
    return Response(content=content, media_type=image["content_type"])
