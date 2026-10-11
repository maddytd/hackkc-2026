from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LARP_", env_file=ROOT / ".env", extra="ignore")
    storage_dir: Path = ROOT / "storage"
    cors_origins: list[str] = ["http://localhost:5173"]
    judge_mode: Literal["gemini", "aws", "demo"] = "gemini"
    demo_seed_scores: bool = False
    # Allow the demo day-switcher even in gemini mode (for testing prompts with real scoring).
    allow_day_override: bool = True
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-3.8-flash"
    # AWS mode is independent of Gemini. Copy exact model/profile IDs from Bedrock.
    aws_region: str = "us-east-1"
    aws_accuracy_model: str = ""
    aws_accuracy_fallback_model: str = ""
    aws_video_model: str = "twelvelabs.pegasus-1-2-v1:0"
    aws_video_region: str = "us-east-1"
    # Optional second Pegasus endpoint; verify availability in the selected region.
    aws_video_fallback_region: str = ""
    aws_video_fallback_model: str = ""
    aws_question_model: str = "amazon.nova-micro-v1:0"
    max_ai_calls_per_attempt: int = Field(default=6, ge=2, le=12)
    provider_cooldown_seconds: int = Field(default=60, ge=1, le=3600)
    questions_file: Path = ROOT / "content/questions_niche.json"
    invite_code: str = ""
    max_upload_bytes: int = Field(default=12 * 1024 * 1024, ge=1024, le=12 * 1024 * 1024)
    max_daily_jobs: int = Field(default=100, ge=1)
    max_replacements: int = Field(default=3, ge=0, le=3)
    max_judge_tries: int = Field(default=3, ge=1, le=3)
    ffprobe: str = "ffprobe"
    ffmpeg: str = "ffmpeg"
    recording_seconds: int = 30
    upload_grace_seconds: int = 120

    @property
    def db_path(self):
        return self.storage_dir / "game.db"

    @property
    def media_dir(self):
        return self.storage_dir / "recordings"

    @property
    def judge_policy(self):
        if self.judge_mode != "aws":
            # Preserve existing Gemini/demo competition-day locks.
            return self.gemini_model
        import json

        from app.ai.aws_pipeline import ACCURACY_PROMPT, VIDEO_PROMPT

        return json.dumps(
            {
                "version": 1,
                "performance_prompt": VIDEO_PROMPT,
                "accuracy_prompt": ACCURACY_PROMPT,
                "accuracy": [
                    {"model": model, "region": self.aws_region}
                    for model in (self.aws_accuracy_model, self.aws_accuracy_fallback_model)
                    if model
                ],
                "video": [
                    {"model": self.aws_video_model, "region": self.aws_video_region},
                    *(
                        [
                            {
                                "model": self.aws_video_fallback_model,
                                "region": self.aws_video_fallback_region,
                            }
                        ]
                        if self.aws_video_fallback_region and self.aws_video_fallback_model
                        else []
                    ),
                ],
                "max_calls": self.max_ai_calls_per_attempt,
            },
            sort_keys=True,
        )
