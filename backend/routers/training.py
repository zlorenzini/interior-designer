"""Model training / fine-tuning endpoints."""
import asyncio
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel

from services.model_service import model_service

router = APIRouter()

# In-memory job registry (replace with a DB / Redis for production)
_jobs: Dict[str, dict] = {}


class TrainingRequest(BaseModel):
    image_ids: List[str]           # images to train on
    style_name: str                # e.g. "scandinavian", "industrial"
    epochs: int = 5
    learning_rate: float = 1e-4
    base_model_id: Optional[str] = None  # overrides config default


class TrainingStatus(BaseModel):
    job_id: str
    status: str                    # queued | running | completed | failed
    progress: float                # 0.0 – 1.0
    message: str = ""


async def _run_training(job_id: str, request: TrainingRequest):
    _jobs[job_id]["status"] = "running"
    try:
        await model_service.fine_tune(
            job_id=job_id,
            image_ids=request.image_ids,
            style_name=request.style_name,
            epochs=request.epochs,
            learning_rate=request.learning_rate,
            base_model_id=request.base_model_id,
            progress_callback=lambda p, msg: _jobs[job_id].update(
                {"progress": p, "message": msg}
            ),
        )
        _jobs[job_id].update({"status": "completed", "progress": 1.0})
    except Exception as exc:  # noqa: BLE001
        _jobs[job_id].update({"status": "failed", "message": str(exc)})


@router.post("/start", response_model=TrainingStatus, status_code=status.HTTP_202_ACCEPTED)
async def start_training(request: TrainingRequest, background_tasks: BackgroundTasks):
    """Kick off a fine-tuning job in the background."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"job_id": job_id, "status": "queued", "progress": 0.0, "message": ""}
    background_tasks.add_task(_run_training, job_id, request)
    return TrainingStatus(**_jobs[job_id])


@router.get("/{job_id}", response_model=TrainingStatus)
async def get_training_status(job_id: str):
    """Poll the status of a training job."""
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return TrainingStatus(**job)


@router.get("/", response_model=List[TrainingStatus])
async def list_jobs():
    """List all training jobs (in-memory)."""
    return [TrainingStatus(**j) for j in _jobs.values()]


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_job(job_id: str):
    """Remove a job record (does not interrupt a running job)."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found.")
    del _jobs[job_id]
