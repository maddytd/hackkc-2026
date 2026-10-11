import pytest

from app.ai.client import judge
from app.config import Settings
from app.schemas import Judgment
from app.services.scoring import score


def test_confident_wrong_answer_scores_independently():
    result = Judgment.model_validate(
        {
            name: {"rating": rating, "feedback": "Evidence"}
            for name, rating in [("accuracy", 0), ("confidence", 5000), ("delivery", 5000)]
        }
    )
    assert score(result)["final_score"] == 3333
    assert score(result)["accuracy"] == 0


@pytest.mark.parametrize("mime,video_format", [("video/webm", "webm"), ("video/mp4", "mp4")])
def test_strands_agent_configuration_and_video(monkeypatch, tmp_path, mime, video_format):
    video = tmp_path / "clip"
    video.write_bytes(b"video")
    monkeypatch.setattr("app.ai.client.pegasus_video_bytes", lambda *args: b"video")
    captured = {}
    judgment = Judgment.model_validate(
        {
            name: {"rating": 8, "feedback": "Observed evidence"}
            for name in ("accuracy", "confidence", "delivery")
        }
    )

    class FakeClient:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.aio = self

        async def aclose(self):
            captured["async_closed"] = True

        def close(self):
            captured["sync_closed"] = True

    monkeypatch.setattr("app.ai.client.genai.Client", FakeClient)

    def model_factory(**kwargs):
        captured["model"] = kwargs
        return "test-model-instance"

    class FakeAgent:
        def __init__(self, **kwargs):
            captured["agent"] = kwargs

        async def structured_output_async(self, schema, prompt):
            captured["schema"] = schema
            captured["prompt"] = prompt
            return judgment

    monkeypatch.setattr("app.ai.client.VideoGeminiModel", model_factory)
    monkeypatch.setattr("app.ai.client.Agent", FakeAgent)
    result = judge(
        Settings(gemini_api_key="test-key", _env_file=None),
        {"media_path": str(video), "mime": mime, "question": "Question"},
        {"mode": "gemini", "model": "test-model", "rubric": "Rubric"},
    )
    assert result.accuracy.rating == 8
    assert captured["client"]["api_key"] == "test-key"
    assert captured["client"]["http_options"]["retry_options"] == {"attempts": 1}
    assert captured["model"]["model_id"] == "test-model"
    assert captured["agent"] == {
        "model": "test-model-instance",
        "system_prompt": "Rubric",
        "tools": [],
        "callback_handler": None,
    }
    assert captured["async_closed"] and captured["sync_closed"]
    assert captured["schema"] is Judgment
    assert captured["prompt"][1] == {"video": {"format": "mp4", "source": {"bytes": b"video"}}}


def test_provider_failure_propagates_for_worker_retry(monkeypatch, tmp_path):
    video = tmp_path / "clip"
    video.write_bytes(b"video")
    monkeypatch.setattr("app.ai.client.pegasus_video_bytes", lambda *args: b"video")
    monkeypatch.setattr("app.ai.client.VideoGeminiModel", lambda **kwargs: None)

    class BrokenAgent:
        def __init__(self, **kwargs):
            pass

        async def structured_output_async(self, *args):
            raise TimeoutError("Provider timeout")

    monkeypatch.setattr("app.ai.client.Agent", BrokenAgent)
    with pytest.raises(TimeoutError):
        judge(
            Settings(gemini_api_key="test-key", _env_file=None),
            {"media_path": str(video), "mime": "video/webm", "question": "Question"},
            {"mode": "gemini", "model": "test-model", "rubric": "Rubric"},
        )


def test_demo_does_not_construct_agent(monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("Demo must not call a provider")

    monkeypatch.setattr("app.ai.client.Agent", forbidden)
    assert judge(Settings(_env_file=None), {}, {"mode": "demo"}).accuracy.rating == 3000


def test_key_is_redacted_in_settings():
    settings = Settings(gemini_api_key="sensitive-test-value", _env_file=None)
    assert "sensitive-test-value" not in repr(settings)
    assert "sensitive-test-value" not in settings.model_dump_json()


def test_extra_judge_fields_rejected():
    with pytest.raises(ValueError):
        Judgment.model_validate({"final_score": 5000})


@pytest.mark.parametrize("video_format,mime", [("mp4", "video/mp4"), ("webm", "video/webm")])
def test_real_provider_preserves_video(video_format, mime):
    from app.ai.video_model import VideoGeminiModel

    model = VideoGeminiModel(model_id="test-model", client_args={"api_key": "test-key"})
    part = model._format_request_content_part(
        {"video": {"format": video_format, "source": {"bytes": b"video-with-audio"}}}, {}
    )
    assert part.inline_data.data == b"video-with-audio"
    assert part.inline_data.mime_type == mime


def test_real_provider_preserves_text():
    from app.ai.video_model import VideoGeminiModel

    model = VideoGeminiModel(model_id="test-model", client_args={"api_key": "test-key"})
    assert (
        model._format_request_content_part({"text": "private reference"}, {}).text
        == "private reference"
    )


def test_agent_to_provider_native_structured_output(monkeypatch, tmp_path):
    """Run the real Strands Agent/provider; replace only Google's network client."""
    from types import SimpleNamespace

    from google.genai import types

    video = tmp_path / "clip"
    video.write_bytes(b"video-with-audio")
    monkeypatch.setattr("app.ai.client.pegasus_video_bytes", lambda *args: b"video-with-audio")
    expected = Judgment.model_validate(
        {
            name: {"rating": 7, "feedback": "Observed evidence"}
            for name in ("accuracy", "confidence", "delivery")
        }
    )
    captured = {}

    class FakeAsyncClient:
        def __init__(self):
            self.models = self

        async def __aenter__(self):
            return self

        async def aclose(self):
            captured["closed"] = True

        async def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                parsed=expected,
                text=expected.model_dump_json(),
                candidates=[SimpleNamespace(finish_reason="STOP")],
            )

    monkeypatch.setattr(
        "app.ai.client.genai.Client",
        lambda **kwargs: SimpleNamespace(aio=FakeAsyncClient(), close=lambda: None),
    )
    result = judge(
        Settings(gemini_api_key="test-key", _env_file=None),
        {"media_path": str(video), "mime": "video/webm", "question": "Question"},
        {"mode": "gemini", "model": "test-model", "rubric": "Rubric"},
    )
    assert result == expected
    assert captured["model"] == "test-model"
    content = types.Content.model_validate(captured["contents"][0])
    assert content.parts[1].inline_data.mime_type == "video/mp4"
    assert (
        types.GenerateContentConfig.model_validate(captured["config"]).system_instruction
        == "Rubric"
    )
    assert (
        types.GenerateContentConfig.model_validate(captured["config"]).response_json_schema
        == Judgment.model_json_schema()
    )
    assert captured["closed"] is True


@pytest.mark.parametrize("finish_reason", ["MAX_TOKENS", "SAFETY"])
def test_provider_rejects_incomplete_judgment(finish_reason):
    import asyncio
    from types import SimpleNamespace

    from app.ai.video_model import VideoGeminiModel

    async def generate_content(**kwargs):
        return SimpleNamespace(candidates=[SimpleNamespace(finish_reason=finish_reason)], text="{}")

    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    )
    model = VideoGeminiModel(client=client, model_id="test-model")

    async def run():
        async for _ in model.structured_output(
            Judgment, [{"role": "user", "content": [{"text": "test"}]}]
        ):
            raise AssertionError("Incomplete responses must not produce scores")

    with pytest.raises(ValueError, match="did not complete"):
        asyncio.run(run())
