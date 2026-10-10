import json

import httpx
import pytest

from app.ai.client import judge
from app.config import Settings
from app.schemas import Judgment
from app.services.scoring import score


def test_confident_wrong_answer_scores_independently():
    result = Judgment.model_validate(
        {
            name: {"rating": rating, "feedback": "Evidence"}
            for name, rating in [("accuracy", 0), ("confidence", 10), ("delivery", 10)]
        }
    )
    assert score(result)["final_score"] == 3333
    assert score(result)["accuracy"] == 0


def test_gemini_request_and_response(monkeypatch, tmp_path):
    video = tmp_path / "clip"
    video.write_bytes(b"video")
    judgment = {
        name: {"rating": 8, "feedback": "Observed evidence"}
        for name in ("accuracy", "confidence", "delivery")
    }

    def handler(request):
        body = json.loads(request.content)
        assert request.headers["x-goog-api-key"] == "test-key"
        assert body["contents"][0]["parts"][1]["inlineData"]["mimeType"] == "video/webm"
        assert body["generationConfig"]["responseJsonSchema"]["properties"]["accuracy"]
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(judgment)}]}}
                ]
            },
        )

    original = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler))
    )
    result = judge(
        Settings(gemini_api_key="test-key"),
        {"media_path": str(video), "mime": "video/webm", "question": "Question"},
        {"mode": "gemini", "model": "test-model", "rubric": "Rubric"},
    )
    assert result.accuracy.rating == 8


def test_extra_judge_fields_rejected():
    with pytest.raises(ValueError):
        Judgment.model_validate({"final_score": 5000})
