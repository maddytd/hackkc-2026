"""Strands judging agent using Gemini's native multimodal structured output."""

import asyncio

from google import genai
from strands import Agent

from app.ai.recording import pegasus_video_bytes
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
        video_bytes = await asyncio.to_thread(pegasus_video_bytes, attempt["media_path"], settings)
        prompt = [
            {"text": "Question and private reference guide:\n" + attempt["question"]},
            {
                "video": {
                    "format": "mp4",
                    "source": {"bytes": video_bytes},
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
                    "rating": 3000,
                    "feedback": "DEMO: fixed placeholder rating; this recording was not evaluated.",
                }
                for name in ("accuracy", "confidence", "delivery")
            }
        )
    if challenge["mode"] == "aws":
        from app.ai.aws_pipeline import judge_aws

        return judge_aws(settings, attempt, challenge)
    return asyncio.run(_judge_with_agent(settings, attempt, challenge))
