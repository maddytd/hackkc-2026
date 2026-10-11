import time

import pytest
from conftest import start, upload
from google.genai.errors import ClientError, ServerError
from pydantic import SecretStr

from app.ai.gemini_errors import classify_gemini_error
from app.database import connect
from app.worker import run_once


def provider_error(code=429, details=None):
    kind = ServerError if code >= 500 else ClientError
    return kind(
        code,
        {
            "error": {
                "code": code,
                "message": "private-provider-payload-and-key",
                "status": "RESOURCE_EXHAUSTED" if code == 429 else "OTHER",
                "details": details or [],
            }
        },
    )


def quota(quota_id, value=None):
    violation = {"quotaId": quota_id}
    if value is not None:
        violation["quotaValue"] = value
    return {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [violation]}


def queued_gemini(setup):
    client, settings, headers = setup
    settings.judge_mode = "gemini"
    settings.gemini_api_key = SecretStr("test-key")
    aid = start(client, headers)["id"]
    assert upload(client, headers, aid).status_code == 202
    return client, settings, headers, aid


@pytest.mark.parametrize(
    "quota_id",
    [
        "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
        "GenerateContentInputTokensPerModelPerDay",
    ],
)
def test_daily_quota_stops_without_wasting_retries_or_fabricating_scores(setup, caplog, quota_id):
    client, settings, headers, aid = queued_gemini(setup)
    calls = []

    def exhausted(*args):
        calls.append(1)
        raise provider_error(details=[quota(quota_id)])

    assert run_once(settings, exhausted)
    assert not run_once(settings, exhausted)
    result = client.get(f"/attempts/{aid}", headers=headers).json()
    assert result["status"] == "judge_failed"
    assert "daily request or token quota is exhausted" in result["failure"]
    assert result["score"] is None and len(calls) == 1
    assert "private-provider-payload" not in str(result) + caplog.text
    assert "quota_exhausted" in caplog.text


def test_rate_limit_waits_for_retry_info_and_preserves_recording(setup):
    client, settings, headers, aid = queued_gemini(setup)
    seen = []
    error = provider_error(
        details=[
            {
                "@type": "type.googleapis.com/google.rpc.RetryInfo",
                "retryDelay": "125.5s",
            }
        ]
    )

    def throttled(settings, attempt, challenge):
        seen.append(attempt["media_path"])
        raise error

    before = time.time()
    for index in range(settings.max_judge_tries):
        assert run_once(settings, throttled)
        result = client.get(f"/attempts/{aid}", headers=headers).json()
        assert "Gemini's request or token limit" in result["failure"]
        with connect(settings, write=True) as db:
            row = db.execute("SELECT * FROM attempts WHERE id=?", (aid,)).fetchone()
            assert row["next_run"] >= before + 125.5
            if index < settings.max_judge_tries - 1:
                assert result["status"] == "queued"
                assert "automatically" in result["failure"]
            db.execute("UPDATE attempts SET next_run=0 WHERE id=?", (aid,))
    assert result["status"] == "judge_failed" and result["score"] is None
    assert len(set(seen)) == 1
    assert not run_once(settings, throttled)


@pytest.mark.parametrize(
    "code,phrase",
    [
        (400, "rejected the scoring request"),
        (401, "authorize"),
        (403, "authorize"),
        (404, "model is unavailable"),
    ],
)
def test_configuration_failure_stops_with_specific_message(setup, code, phrase):
    client, settings, headers, aid = queued_gemini(setup)

    def fail(*args):
        raise provider_error(code)

    run_once(settings, fail)
    result = client.get(f"/attempts/{aid}", headers=headers).json()
    assert result["status"] == "judge_failed"
    assert phrase in result["failure"]
    assert not run_once(settings, fail)


def test_wrapped_provider_error_and_invalid_key_are_classified():
    wrapper = RuntimeError("Strands wrapper")
    wrapper.__cause__ = provider_error(400, [{"reason": "API_KEY_INVALID"}])
    assert classify_gemini_error(wrapper).code == "access_denied"
    wrapper.__cause__ = wrapper
    assert classify_gemini_error(wrapper) is None


def test_zero_quota_does_not_promise_a_reset_or_retry():
    result = classify_gemini_error(provider_error(details=[quota("RequestsPerMinute", "0")]))
    assert not result.retryable
    assert "no available quota" in result.message


@pytest.mark.parametrize("delay", ["nan", "-5s", "bad", None, float("inf")])
def test_malformed_retry_hint_has_safe_default(delay):
    result = classify_gemini_error(
        provider_error(
            details=[
                {
                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                    "retryDelay": delay,
                }
            ]
        )
    )
    assert result.retryable and result.delay == 60


def test_service_unavailable_is_not_reported_as_quota():
    result = classify_gemini_error(provider_error(503))
    assert result.retryable and result.code == "service_unavailable"
    assert "quota" not in result.message


def test_real_strands_preserves_quota_error(monkeypatch):
    from types import SimpleNamespace

    from app.ai.client import judge
    from app.config import Settings

    calls = []

    async def generate_content(**kwargs):
        calls.append(1)
        raise provider_error(details=[quota("GenerateRequestsPerDay-FreeTier")])

    async def close():
        pass

    monkeypatch.setattr("app.ai.client.pegasus_video_bytes", lambda *args: b"fake-mp4")
    monkeypatch.setattr(
        "app.ai.client.genai.Client",
        lambda **kwargs: SimpleNamespace(
            aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate_content), aclose=close
            ),
            close=lambda: None,
        ),
    )
    with pytest.raises(Exception) as caught:
        judge(
            Settings(gemini_api_key="test-key", _env_file=None),
            {"media_path": "unused", "mime": "video/webm", "question": "private question"},
            {"mode": "gemini", "model": "test-model", "rubric": "rubric"},
        )
    assert classify_gemini_error(caught.value).code == "quota_exhausted"
    assert len(calls) == 1


@pytest.mark.parametrize(
    "detail",
    [
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": None},
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": "many"},
        {"@type": None, "violations": []},
    ],
)
def test_malformed_quota_details_are_classified_without_crashing(detail):
    result = classify_gemini_error(provider_error(details=[detail]))
    assert result.code == "rate_limited"
