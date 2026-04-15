"""ML model service wrapper.

Wraps a diffusion pipeline (ControlNet + Stable Diffusion) for:
  - Image-to-image interior redesign  (generate)
  - LoRA / DreamBooth fine-tuning     (fine_tune)

The heavy import of diffusers/torch is deferred so the backend starts
even when those packages are absent (useful for front-end dev).
"""
import asyncio
import io
import uuid
from pathlib import Path
from typing import Callable, List, Optional

from config import settings


class ModelService:
    """Singleton wrapper around the inference pipeline."""

    def __init__(self):
        self._pipeline = None
        self._fine_tuned: dict[str, Path] = {}  # style_name -> LoRA weights path

    # ── Pipeline loading ──────────────────────────────────────────────────────

    def _load_pipeline(self):
        """Lazy-load the diffusion pipeline on first use."""
        try:
            import torch
            from diffusers import StableDiffusionImg2ImgPipeline
        except ImportError as exc:
            raise RuntimeError(
                "diffusers and torch are required for inference. "
                "Install them: pip install torch diffusers transformers accelerate"
            ) from exc

        device = settings.device
        dtype = torch.float16 if device == "cuda" else torch.float32

        pipeline = StableDiffusionImg2ImgPipeline.from_pretrained(
            settings.model_id,
            torch_dtype=dtype,
            safety_checker=None,       # disable for interior design use-case
        )
        pipeline = pipeline.to(device)
        pipeline.enable_attention_slicing()  # reduce VRAM usage
        return pipeline

    @property
    def pipeline(self):
        if self._pipeline is None:
            self._pipeline = self._load_pipeline()
        return self._pipeline

    # ── Inference ─────────────────────────────────────────────────────────────

    async def generate(
        self,
        image_path: Path,
        prompt: str,
        negative_prompt: str = "low quality, blurry",
        strength: float = 0.75,
        steps: int = 20,
        guidance_scale: float = 7.5,
        fine_tuned_model: Optional[str] = None,
    ) -> tuple[bytes, str]:
        """
        Run inference and return (png_bytes, result_image_id).
        If fine_tuned_model is specified and its LoRA weights exist, they are loaded.
        """

        def _infer() -> bytes:
            from PIL import Image

            pipe = self.pipeline

            # Optionally load LoRA weights for a fine-tuned style
            if fine_tuned_model and fine_tuned_model in self._fine_tuned:
                lora_path = self._fine_tuned[fine_tuned_model]
                pipe.unet.load_attn_procs(str(lora_path))

            src_image = Image.open(image_path).convert("RGB")
            result = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=src_image,
                strength=strength,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
            ).images[0]

            buf = io.BytesIO()
            result.save(buf, format="PNG")
            return buf.getvalue()

        png_bytes = await asyncio.get_event_loop().run_in_executor(None, _infer)

        result_id = f"result_{uuid.uuid4()}.png"
        (settings.upload_dir / result_id).write_bytes(png_bytes)
        return png_bytes, result_id

    # ── Fine-tuning ───────────────────────────────────────────────────────────

    async def fine_tune(
        self,
        job_id: str,
        image_ids: List[str],
        style_name: str,
        epochs: int = 5,
        learning_rate: float = 1e-4,
        base_model_id: Optional[str] = None,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ) -> None:
        """
        Placeholder fine-tuning routine using LoRA via the PEFT library.
        Replace the body with your actual DreamBooth / LoRA training loop.
        """
        try:
            import torch
            from diffusers import StableDiffusionPipeline
            from peft import LoraConfig, get_peft_model
        except ImportError as exc:
            raise RuntimeError(
                "Fine-tuning requires: pip install peft diffusers torch accelerate"
            ) from exc

        output_dir = settings.model_dir / style_name
        output_dir.mkdir(parents=True, exist_ok=True)

        # ── Simulated training loop (replace with real training code) ─────────
        total_steps = epochs * max(len(image_ids), 1)
        for step in range(total_steps):
            await asyncio.sleep(0.1)   # simulate GPU work
            progress = (step + 1) / total_steps
            if progress_callback:
                progress_callback(progress, f"step {step + 1}/{total_steps}")

        # In a real implementation: save LoRA adapter weights here
        weights_path = output_dir / "lora_weights"
        weights_path.mkdir(exist_ok=True)
        (weights_path / "README.txt").write_text(
            f"LoRA weights for style '{style_name}' would be saved here.\n"
            f"job_id={job_id}, epochs={epochs}, lr={learning_rate}\n"
        )

        self._fine_tuned[style_name] = weights_path


model_service = ModelService()
