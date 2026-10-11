"""Generate the day's recall question with Gemini via a Strands agent.

Runs once per competition day (when that day's challenge is first created) and the result
is stored, so every player gets the same AI-written prompt and model answer.
"""

import asyncio

from google import genai
from strands import Agent

from app.ai.video_model import VideoGeminiModel
from app.schemas import GeneratedQuestion

GENERATOR_PROMPT = """You write one daily question for a 30-second spoken quiz game.
Produce a single "remember and recall" factual question with a single objective, verifiable
answer — the kind someone either knows or doesn't (facts, lists, definitions, names, dates).
Good examples: "List the three primary stages of cellular respiration." or "Name the four
nucleotide bases in DNA." Avoid opinion, prediction, math that needs scratch work, anything
ambiguous or contested, and anything that needs more than ~30 seconds to answer aloud.
Vary the subject area day to day (science, history, geography, literature, civics, the arts).
Return ONLY the structured fields:
- text: the question shown to the player.
- category: one lowercase word for the subject (e.g. biology, history, geography).
- difficulty: easy, medium, or hard.
- context: a short public hint, e.g. "List all three." or "Name the city."
- guide: the private model answer with the correct response, acceptable alternatives, and
  common wrong answers to penalize. This is used to grade accuracy, so make it precise."""


async def _generate(settings, day):
    api_key = settings.gemini_api_key.get_secret_value()
    if not api_key:
        raise ValueError("Gemini API key is not configured")
    client = genai.Client(
        api_key=api_key,
        http_options={"timeout": 60_000, "retry_options": {"attempts": 1}},
    )
    try:
        model = VideoGeminiModel(
            client=client,
            model_id=settings.gemini_model,
            params={"temperature": 1.1, "max_output_tokens": 1024},
        )
        agent = Agent(
            model=model,
            system_prompt=GENERATOR_PROMPT,
            tools=[],
            callback_handler=None,
        )
        prompt = [{"text": f"Competition day: {day}. Write today's question now."}]
        async with asyncio.timeout(60):
            result = await agent.structured_output_async(GeneratedQuestion, prompt)
        return GeneratedQuestion.model_validate(result)
    finally:
        try:
            await client.aio.aclose()
        finally:
            client.close()


def generate_question(settings, day):
    return asyncio.run(_generate(settings, day))
