"""Interior design ML model placeholder / registry.

This module defines the data model used to describe a loaded or available
interior design model — decoupled from the diffusion pipeline itself.
"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import json


@dataclass
class InteriorModel:
    """Metadata for a trained or downloaded model."""

    name: str                          # human-readable name / style
    model_id: str                      # HuggingFace repo ID or local path
    lora_path: Optional[Path] = None   # LoRA adapter weights (fine-tuned)
    description: str = ""
    tags: list = field(default_factory=list)

    # ── Serialisation helpers ─────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "model_id": self.model_id,
            "lora_path": str(self.lora_path) if self.lora_path else None,
            "description": self.description,
            "tags": self.tags,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "InteriorModel":
        lora = data.get("lora_path")
        return cls(
            name=data["name"],
            model_id=data["model_id"],
            lora_path=Path(lora) if lora else None,
            description=data.get("description", ""),
            tags=data.get("tags", []),
        )

    # ── Registry helpers ──────────────────────────────────────────────────────

    @staticmethod
    def load_registry(registry_path: Path) -> list["InteriorModel"]:
        """Load a JSON registry file produced by the training pipeline."""
        if not registry_path.exists():
            return []
        with registry_path.open() as f:
            entries = json.load(f)
        return [InteriorModel.from_dict(e) for e in entries]

    @staticmethod
    def save_registry(models: list["InteriorModel"], registry_path: Path) -> None:
        """Persist the model registry to disk."""
        registry_path.parent.mkdir(parents=True, exist_ok=True)
        with registry_path.open("w") as f:
            json.dump([m.to_dict() for m in models], f, indent=2)


# ── Built-in model catalogue ──────────────────────────────────────────────────
# Add pre-configured base models here so the frontend can offer them without
# requiring a training job.

BUILTIN_MODELS: list[InteriorModel] = [
    InteriorModel(
        name="Stable Diffusion img2img (base)",
        model_id="runwayml/stable-diffusion-v1-5",
        description="General-purpose img2img — no interior-specific fine-tuning.",
        tags=["base"],
    ),
    InteriorModel(
        name="Interior Design ControlNet",
        model_id="lllyasviel/control_v11p_sd15_lineart",
        description="ControlNet conditioned on line-art for precise room layout control.",
        tags=["controlnet", "lineart"],
    ),
]
