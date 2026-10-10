from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LARP_", env_file=".env", extra="ignore")
    storage_dir: Path = ROOT / "storage"
    cors_origins: list[str] = ["http://localhost:5173"]
    judge_mode: Literal["gemini", "demo"] = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    invite_code: str = ""
    max_upload_bytes: int = Field(default=12 * 1024 * 1024, ge=1024, le=12 * 1024 * 1024)
    max_daily_jobs: int = Field(default=100, ge=1)
    max_replacements: int = Field(default=3, ge=0, le=3)
    max_judge_tries: int = Field(default=3, ge=1, le=3)
    ffprobe: str = "ffprobe"
    recording_seconds: int = 30
    upload_grace_seconds: int = 120

    @property
    def db_path(self):
        return self.storage_dir / "game.db"

    @property
    def media_dir(self):
        return self.storage_dir / "recordings"
