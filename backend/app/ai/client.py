"""Strands judging agent using Gemini's native multimodal structured output."""

import asyncio
from pathlib import Path
import subprocess

from google import genai
from strands import Agent

from app.ai.video_model import VideoGeminiModel
from app.schemas import Judgment


async def _judge_with_agent(settings, attempt, challenge):
    formats = {"video/webm": "webm", "video/mp4": "mp4"}
    if attempt["mime"] not in formats:
        raise ValueError("Unsupported recording type")
    api_key = settings.gemini_api_key.get_secret_value()
    if not api_key:
        raise ValueError("Gemini API key is not configured")

    client = genai.Client(
        api_key=api_key,
        http_options={
            "timeout": 90_000,
            # The persistent worker owns retries and enforces the call budget.
            "retry_options": {"attempts": 1},
        },
    )
    try:
        model = VideoGeminiModel(
            client=client,
            model_id=challenge["model"],
            params={"temperature": 0, "max_output_tokens": 4096},
        )
        agent = Agent(
            model=model,
            system_prompt=challenge["rubric"],
            tools=[],
            callback_handler=None,
        )
        
        processed_path = reduce_media_quality(attempt["media_path"])
        prompt = [
            {"text": "Question and private reference guide:\n" + attempt["question"]},
            {
                "video": {
                    "format": formats[attempt["mime"]],
                    "source": {"bytes": Path(processed_path).read_bytes()},
                }
            },
        ]
        # The provider-native path makes one call, without a tool loop or shared history.
        async with asyncio.timeout(100):
            result = await agent.structured_output_async(Judgment, prompt)
        return Judgment.model_validate(result)
    finally:
        # Strands leaves injected clients open; close both transports even on failure.
        try:
            await client.aio.aclose()
        finally:
            client.close()


def judge(settings, attempt, challenge):
    if challenge["mode"] == "demo":
        return Judgment.model_validate(
            {
                name: {
                    "rating": 6,
                    "feedback": "DEMO: fixed placeholder rating; this recording was not evaluated.",
                }
                for name in ("accuracy", "confidence", "delivery")
            }
        )
    return asyncio.run(_judge_with_agent(settings, attempt, challenge))

def reduce_media_quality(media_path: str, output_path: str | None = None) -> str:
    input_path = Path(media_path)
    output_file = Path(output_path) if output_path else input_path.with_name(f"{input_path.stem}_ai.mp4")

    # Goal:
    # - max width 540
    # - 24 fps
    # - audio sample rate 48k
    # - keep format compatible with Gemini
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(input_path),
        "-vf",
        "scale='min(960,iw)':'min(540,ih)':force_original_aspect_ratio=decrease,fps=24",
        "-r", "24",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "28",
        "-c:a", "aac",
        "-ar", "48000",
        "-movflags", "+faststart",
        str(output_file),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to reduce media quality for {media_path}: "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )

    return str(output_file)

