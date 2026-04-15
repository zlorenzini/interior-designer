"""Room generation / inference endpoints."""
import base64
import io
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from services.model_service import model_service

router = APIRouter()


class GenerateRequest(BaseModel):
    image_id: str                       # source room image
    style: str = "modern"               # target interior style
    prompt: Optional[str] = None        # optional free-form text prompt
    negative_prompt: str = "low quality, blurry, distorted"
    strength: float = 0.75             # img2img denoising strength 0–1
    steps: Optional[int] = None        # overrides config default
    guidance_scale: Optional[float] = None  # overrides config default
    fine_tuned_model: Optional[str] = None  # style_name from a training job


class GenerateResponse(BaseModel):
    result_image_id: str
    base64_image: str    # data:image/png;base64,…


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Generate a redesigned room image from the source image."""
    src = settings.upload_dir / request.image_id
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source image not found.")

    prompt = request.prompt or f"interior design, {request.style} style, photorealistic"

    result_bytes, result_id = await model_service.generate(
        image_path=src,
        prompt=prompt,
        negative_prompt=request.negative_prompt,
        strength=request.strength,
        steps=request.steps or settings.inference_steps,
        guidance_scale=request.guidance_scale or settings.guidance_scale,
        fine_tuned_model=request.fine_tuned_model,
    )

    b64 = base64.b64encode(result_bytes).decode()
    return GenerateResponse(
        result_image_id=result_id,
        base64_image=f"data:image/png;base64,{b64}",
    )


@router.get("/result/{result_id}")
async def get_result(result_id: str):
    """Stream back a previously generated result image."""
    path = settings.upload_dir / result_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Result not found.")
    return StreamingResponse(path.open("rb"), media_type="image/png")
