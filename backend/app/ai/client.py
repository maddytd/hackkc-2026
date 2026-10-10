import base64
import json
from pathlib import Path
from urllib.parse import quote

import httpx

from app.schemas import Judgment


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
    media = base64.b64encode(Path(attempt["media_path"]).read_bytes()).decode()
    body = {
        "systemInstruction": {"parts": [{"text": challenge["rubric"]}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": "Question and private reference guide:\n" + attempt["question"]},
                    {"inlineData": {"mimeType": attempt["mime"], "data": media}},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
            "responseJsonSchema": Judgment.model_json_schema(),
        },
    }
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + quote(challenge["model"], safe="")
        + ":generateContent"
    )
    with httpx.Client(timeout=httpx.Timeout(90, connect=10)) as client:
        response = client.post(url, headers={"x-goog-api-key": settings.gemini_api_key}, json=body)
        response.raise_for_status()
    data = response.json()
    candidate = data["candidates"][0]
    if candidate.get("finishReason") != "STOP":
        raise ValueError("Judge did not complete a valid response")
    text = "".join(
        p.get("text", "") for p in candidate["content"]["parts"] if not p.get("thought", False)
    )
    return Judgment.model_validate(json.loads(text))
