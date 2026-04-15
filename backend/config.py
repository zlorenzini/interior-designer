"""Application configuration loaded from environment variables."""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Server
    app_title: str = "Interior Designer AI"
    app_version: str = "0.1.0"
    debug: bool = False

    # Paths
    base_dir: Path = Path(__file__).parent
    upload_dir: Path = base_dir / "uploads"
    model_dir: Path = base_dir / "model_weights"

    # CORS — comma-separated origins, e.g. "http://localhost:3000,http://localhost:8080"
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"

    # Google Drive
    google_credentials_file: str = "credentials.json"   # OAuth2 client_secrets
    google_token_file: str = "token.json"               # persisted user token
    google_drive_folder_id: str = ""                    # optional root folder

    # Model inference
    model_id: str = "lllyasviel/control_v11p_sd15_lineart"  # default ControlNet
    device: str = "cpu"           # set to "cuda" or "mps" for GPU
    inference_steps: int = 20
    guidance_scale: float = 7.5

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure required directories exist at import time
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.model_dir.mkdir(parents=True, exist_ok=True)
