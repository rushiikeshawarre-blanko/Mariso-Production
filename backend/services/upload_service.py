from fastapi import UploadFile, HTTPException
from fastapi.responses import Response
from datetime import datetime, timezone
import base64
import uuid

from core.database import db


async def upload_image(file: UploadFile):
    contents = await file.read()

    allowed_types = ["image/jpeg", "image/png", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    max_size = 5 * 1024 * 1024  # 5MB
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")

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