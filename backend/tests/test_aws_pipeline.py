import io
import json
import time
import traceback
from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError
from conftest import start, upload

from app.ai.aws_pipeline import CallBudgetExhausted, RequestLedger, combine
from app.ai.client import judge
from app.database import connect, initialize
from app.schemas import AccuracyJudgment, PerformanceEvidence
from app.services import attempts
from app.worker import run_once


def configure(settings):
    settings.judge_mode = "aws"
    settings.aws_accuracy_model = "primary-accuracy"
    settings.aws_accuracy_fallback_model = "backup-accuracy"
    settings.gemini_api_key = ""


def performance():
    return {
        "audio_assessable": True,
        "video_assessable": True,
        "transcript": "The answer is Enceladus.",
        "observations": [
            {"seconds": 2, "channel": "visual", "description": "Player gestures toward camera."},
            {
                "seconds": 3,
                "channel": "audio",
                "description": "Clear spoken answer after a short pause.",
            },
        ],
        "confidence": {
            "directness": 95,
            "fluency": 85,
            "voice": 90,
            "presence": 90,
            "feedback": "Committed vocal emphasis and gesture.",
        },
        "delivery": {
            "clarity": 90,
            "pacing": 70,
            "structure": 75,
            "expression": 80,
            "feedback": "Clear articulation with a brief pause.",
        },
    }


def fake_aws(monkeypatch, *, fail_accuracy=None, video_result=None, video_error=None):
    requests = []

    class FakeClient:
        def __init__(self, region, config):
            self.region = region
            self.meta = SimpleNamespace(region_name=region)
            assert config.retries["total_max_attempts"] == 1

        def invoke_model(self, **kwargs):
            requests.append((self.region, kwargs))
            if video_error:
                raise video_error
            body = json.loads(kwargs["body"])
            assert "base64String" in body["mediaSource"]
            assert "responseFormat" not in body
            assert '"audio_assessable"' in body["inputPrompt"]
            return {
                "body": io.BytesIO(
                    json.dumps(
                        {
                            "finishReason": "stop",
                            "message": json.dumps(video_result or performance()),
                        }
                    ).encode()
                )
            }

        def converse_stream(self, **kwargs):
            requests.append((self.region, kwargs))
            model = kwargs["modelId"]
            if fail_accuracy and fail_accuracy(model):
                raise ClientError(
                    {
                        "Error": {"Code": "ThrottlingException"},
                        "ResponseMetadata": {"HTTPStatusCode": 429},
                    },
                    "ConverseStream",
                )
            tool_name = kwargs["toolConfig"]["tools"][0]["toolSpec"]["name"]
            return {
                "stream": [
                    {"messageStart": {"role": "assistant"}},
                    {
                        "contentBlockStart": {
                            "contentBlockIndex": 0,
                            "start": {"toolUse": {"toolUseId": "test", "name": tool_name}},
                        }
                    },
                    {
                        "contentBlockDelta": {
                            "contentBlockIndex": 0,
                            "delta": {
                                "toolUse": {
                                    "input": json.dumps(
                                        {
                                            "accuracy": {
                                                "rating": 2,
                                                "feedback": "Most of the required answer is missing.",
                                            }
                                        }
                                    )
                                }
                            },
                        }
                    },
                    {"contentBlockStop": {"contentBlockIndex": 0}},
                    {"messageStop": {"stopReason": "tool_use"}},
                    {
                        "metadata": {
                            "usage": {"inputTokens": 20, "outputTokens": 20, "totalTokens": 40},
                            "metrics": {"latencyMs": 1},
                        }
                    },
                ]
            }

        def close(self):
            pass

    class FakeSession:
        def __init__(self, region_name=None):
            self.region = region_name

        def client(self, service_name=None, *, config, region_name=None, **kwargs):
            assert service_name == "bedrock-runtime"
            return FakeClient(region_name or self.region, config)

    monkeypatch.setattr("boto3.Session", FakeSession)
    monkeypatch.setattr(
        "app.ai.aws_pipeline.pegasus_video_bytes", lambda path, settings: b"test-mp4"
    )
    return requests


def test_real_strands_pipeline_falls_back_and_keeps_ratings_independent(setup, monkeypatch):
    client, settings, headers = setup
    configure(settings)
    calls = fake_aws(monkeypatch, fail_accuracy=lambda model: model == "primary-accuracy")
    aid = start(client, headers)["id"]
    upload(client, headers, aid)

    def checked_judge(*args):
        try:
            return judge(*args)
        except Exception:  # noqa: BLE001 -- preserve the full mock-provider failure in the test
            pytest.fail(traceback.format_exc())

    assert run_once(settings, checked_judge)
    result = client.get(f"/attempts/{aid}", headers=headers).json()
    assert result["status"] == "completed"
    assert result["score"]["accuracy"] == 1000
    assert result["score"]["confidence"] == 4500
    assert result["score"]["delivery"] == 4000
    assert len(calls) == 3
    with connect(settings) as db:
        assert (
            db.execute("SELECT count(*) FROM ai_calls WHERE attempt_id=?", (aid,)).fetchone()[0]
            == 3
        )
        provenance = json.loads(
            db.execute(
                "SELECT metadata FROM judgment_provenance WHERE attempt_id=?", (aid,)
            ).fetchone()[0]
        )
        assert provenance["accuracy"]["model"] == "backup-accuracy"
        assert db.execute("SELECT count(*) FROM ai_stage_results").fetchone()[0] == 0
    accuracy_prompt = json.dumps(calls[-1][1]["messages"])
    assert "Committed vocal" not in accuracy_prompt
    assert "reference" in accuracy_prompt and "transcript" in accuracy_prompt
    assert "transcript" not in json.dumps(result)


def test_retry_reuses_video_evidence(setup, monkeypatch):
    client, settings, headers = setup
    configure(settings)
    state = {"fail": True}
    calls = fake_aws(monkeypatch, fail_accuracy=lambda _: state["fail"])
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    run_once(settings)
    assert client.get(f"/attempts/{aid}", headers=headers).json()["score"] is None
    with connect(settings, write=True) as db:
        db.execute("UPDATE attempts SET next_run=0")
        db.execute("UPDATE provider_cooldowns SET until=0")
    state["fail"] = False
    run_once(settings)
    assert client.get(f"/attempts/{aid}", headers=headers).json()["status"] == "completed"
    assert sum("body" in request for _, request in calls) == 1


def test_known_cooldowns_do_not_spend_worker_try(setup, monkeypatch):
    client, settings, headers = setup
    configure(settings)
    calls = fake_aws(monkeypatch)
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    until = time.time() + 60
    with connect(settings, write=True) as db:
        db.execute(
            "INSERT INTO provider_cooldowns VALUES (?,?)",
            (settings.aws_video_region + ":" + settings.aws_video_model, until),
        )
    run_once(settings)
    assert not calls
    with connect(settings) as db:
        row = db.execute("SELECT * FROM attempts WHERE id=?", (aid,)).fetchone()
        assert row["tries"] == 0 and row["status"] == "queued"
        assert row["next_run"] == until


def test_budget_is_durable_and_counts_unfinished_requests(setup):
    client, settings, headers = setup
    configure(settings)
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    with connect(settings, write=True) as db:
        db.execute(
            "UPDATE attempts SET status='processing',lease='owner',lease_until=?",
            (time.time() + 300,),
        )
    ledger = RequestLedger(settings, {"id": aid, "lease": "owner"}, 2)
    endpoint = {"model": "test-model", "region": "us-east-1"}
    ledger.reserve("accuracy", endpoint)
    # Simulated restart: previous unfinished reservation still consumes capacity.
    restarted = RequestLedger(settings, {"id": aid, "lease": "owner"}, 2)
    restarted.reserve("accuracy", endpoint)
    with pytest.raises(CallBudgetExhausted):
        restarted.reserve("accuracy", endpoint)


def test_audio_unavailable_never_produces_score(setup, monkeypatch):
    client, settings, headers = setup
    configure(settings)
    evidence = performance()
    evidence["audio_assessable"] = False
    calls = fake_aws(monkeypatch, video_result=evidence)
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    run_once(settings)
    assert len(calls) == 1
    assert client.get(f"/attempts/{aid}", headers=headers).json()["score"] is None


def test_permission_failure_does_not_try_another_model(setup, monkeypatch):
    client, settings, headers = setup
    configure(settings)
    settings.aws_video_fallback_region = "us-west-2"
    settings.aws_video_fallback_model = settings.aws_video_model
    error = ClientError(
        {"Error": {"Code": "AccessDeniedException"}, "ResponseMetadata": {"HTTPStatusCode": 403}},
        "InvokeModel",
    )
    calls = fake_aws(monkeypatch, video_error=error)
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    run_once(settings)
    assert len(calls) == 1
    # Access may be granted shortly after; the same recording waits, then retries.
    waiting = client.get(f"/attempts/{aid}", headers=headers).json()
    assert waiting["status"] == "queued"
    assert "waiting for AWS model access" in waiting["failure"]
    assert not run_once(settings)
    for _ in range(settings.max_judge_tries - 1):
        with connect(settings, write=True) as db:
            db.execute("UPDATE attempts SET next_run=0")
        run_once(settings)
    blocked = client.get(f"/attempts/{aid}", headers=headers).json()
    assert blocked["status"] == "judge_failed"
    assert "blocked by AWS model access" in blocked["failure"]
    assert blocked["score"] is None


def test_aws_daily_policy_locked_without_gemini_dependency(setup):
    client, settings, headers = setup
    configure(settings)
    first = start(client, headers)
    settings.gemini_model = "unused-gemini-model"
    assert start(client, headers)["id"] == first["id"]
    with connect(settings) as db:
        assert attempts.challenge_for(db, settings, first["day"])
    settings.aws_accuracy_fallback_model = "changed-backup"
    with connect(settings) as db, pytest.raises(Exception, match="locked"):
        attempts.challenge_for(db, settings, first["day"])


def test_schema_migration_preserves_existing_competition(setup):
    client, settings, headers = setup
    first = start(client, headers)
    with connect(settings, write=True) as db:
        db.execute("PRAGMA user_version=1")
    initialize(settings)
    initialize(settings)
    with connect(settings) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert db.execute("SELECT id FROM attempts").fetchone()[0] == first["id"]


@pytest.mark.parametrize(
    ("transcript", "accuracy_rating", "expected_confidence"),
    [
        ("", 0, 0),  # silence
        ("you", 0, 0),  # a stray word invented from silence
        ("Helium.", 10, 4500),  # a correct one-word answer keeps its performance scores
        ("It is definitely hydrogen, no doubt.", 0, 4500),  # a real bluff still earns points
    ],
)
def test_silence_earns_nothing_but_a_spoken_bluff_still_scores(
    transcript, accuracy_rating, expected_confidence
):
    evidence = PerformanceEvidence.model_validate({**performance(), "transcript": transcript})
    accuracy = AccuracyJudgment.model_validate(
        {"accuracy": {"rating": accuracy_rating, "feedback": "Graded against the guide."}}
    )
    result = combine(evidence, accuracy)
    assert result.accuracy.rating == accuracy_rating * 500
    assert result.confidence.rating == expected_confidence
    assert result.delivery.rating == (4000 if expected_confidence else 0)


def test_one_weak_signal_moves_the_score_by_its_weight():
    accuracy = AccuracyJudgment.model_validate({"accuracy": {"rating": 10, "feedback": "Right."}})
    hedged = performance()
    hedged["confidence"]["directness"] = 31
    result = combine(PerformanceEvidence.model_validate(hedged), accuracy)
    assert result.confidence.rating == 3540
    looked_away = performance()
    looked_away["confidence"]["presence"] = 26
    result = combine(PerformanceEvidence.model_validate(looked_away), accuracy)
    assert result.confidence.rating == 4180
