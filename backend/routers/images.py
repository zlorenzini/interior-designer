"""Image upload and management router."""
import uuid
import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from config import settings

router = APIRouter()

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


def _image_path(image_id: str) -> Path:
    return settings.upload_dir / image_id


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile = File(...)):
    """Upload a room image. Returns a stable image_id used by other endpoints."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: {ALLOWED_MIME}",
        )

    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    image_id = f"{uuid.uuid4()}{suffix}"
    dest = _image_path(image_id)

    size = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 64):
            size += len(chunk)
            if size > MAX_SIZE_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File exceeds 20 MB limit.",
                )
            out.write(chunk)

    return {"image_id": image_id, "filename": file.filename, "size_bytes": size}


@router.get("/", response_model=List[dict])
async def list_images():
    """List all uploaded images."""
    images = []
    for p in sorted(settings.upload_dir.iterdir()):
        if p.is_file() and p.name != ".gitkeep":
            images.append({"image_id": p.name, "size_bytes": p.stat().st_size})
    return images


@router.get("/{image_id}")
async def get_image(image_id: str):
    """Download / display an uploaded image."""
    path = _image_path(image_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(str(path))


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(image_id: str):
    """Delete an uploaded image."""
    path = _image_path(image_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")
    path.unlink()
