import json
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from conftest import start, upload
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import connect
from app.main import create_app
from app.schemas import Judgment
from app.services import attempts
from app.worker import main as worker_main
from app.worker import run_once


@pytest.mark.parametrize("judge_mode", ["demo", "gemini"])
def test_demo_seed_toggle_adds_and_removes_only_demo_scores(tmp_path, judge_mode):
    settings = Settings(
        storage_dir=tmp_path,
        judge_mode=judge_mode,
        demo_seed_scores=True,
        _env_file=None,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        board = client.get("/leaderboard").json()
        entries = board["entries"]
        assert board["demo"] is True
        assert len(entries) == 50
        assert all(entry["alias"].startswith("Demo_") for entry in entries)

        response = client.post(
            "/auth/register", json={"alias": "contestant", "password": "test-password"}
        )
        assert response.status_code == 201
        player_id = response.json()["player_id"]

        day = attempts.day_at(time.time(), settings)
        with connect(settings, write=True) as db:
            challenge = db.execute(
                "SELECT questions FROM challenges WHERE day=?", (day,)
            ).fetchone()
            question = json.loads(challenge["questions"])[0]
            attempt_id = "real-attempt"
            db.execute(
                "INSERT INTO attempts (id,player_id,day,question,status,created,deadline) "
                "VALUES (?,?,?,?,'completed',?,?)",
                (attempt_id, player_id, day, json.dumps(question), time.time(), time.time()),
            )
            db.execute(
                "INSERT INTO scores VALUES (?,?,?,?,?,?,?,?)",
                (attempt_id, player_id, day, 3200, 3300, 3400, 3300, "{}"),
            )

    with TestClient(app) as client:
        assert len(client.get("/leaderboard?limit=100").json()["entries"]) == 51

    settings.demo_seed_scores = False
    with TestClient(app) as client:
        board = client.get("/leaderboard").json()
        entries = board["entries"]
        assert board["demo"] is (judge_mode == "demo")
        assert [entry["alias"] for entry in entries] == ["contestant"]
        with connect(settings) as db:
            assert db.execute("SELECT count(*) FROM players").fetchone()[0] == 1
            assert db.execute("SELECT count(*) FROM scores").fetchone()[0] == 1


def test_full_flow_and_duplicate_requests(setup):
    client, settings, headers = setup
    attempt = start(client, headers)
    assert "guide" not in attempt["question"]
    assert start(client, headers)["id"] == attempt["id"]
    aid = attempt["id"]
    assert upload(client, headers, aid).json()["status"] == "queued"
    assert upload(client, headers, aid).json()["status"] == "queued"
    assert run_once(settings)
    result = client.get(f"/attempts/{aid}", headers=headers).json()
    assert result["status"] == "completed"
    assert result["score"]["final_score"] == 3000
    assert result["demo"] is True
    assert not list(settings.media_dir.iterdir())
    assert start(client, headers)["id"] == aid
    assert not run_once(settings)
    leaderboard = client.get("/leaderboard").json()
    assert leaderboard["entries"][0]["rank"] == 1
    assert leaderboard["demo"] is True
    assert len(leaderboard["entries"]) == 1
    assert "media_path" not in json.dumps(result)


def test_failed_upload_same_prompt_and_limit(setup):
    client, settings, headers = setup
    attempt = start(client, headers)
    qid = attempt["question"]["id"]
    for i in range(4):
        # The daily prompt is shared, so every retry keeps the same question.
        assert attempt["question"]["id"] == qid
        aid = attempt["id"]
        assert upload(client, headers, aid, b"").status_code == 422
        replacement = client.post(f"/attempts/{aid}/replacement", headers=headers)
        if i == 3:
            assert replacement.status_code == 409
        else:
            assert replacement.status_code == 200
            attempt = replacement.json()
            assert attempt["day"] == attempts.day_at(time.time(), settings)
            assert upload(client, headers, aid).status_code == 409
    assert not list(settings.media_dir.iterdir())


def test_replacement_is_idempotent(setup):
    client, _, headers = setup
    aid = start(client, headers)["id"]
    upload(client, headers, aid, b"")
    one = client.post(f"/attempts/{aid}/replacement", headers=headers)
    two = client.post(f"/attempts/{aid}/replacement", headers=headers)
    assert one.json()["id"] == two.json()["id"]


def test_successful_receipt_never_gets_replacement(setup):
    client, _, headers = setup
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    assert client.post(f"/attempts/{aid}/replacement", headers=headers).status_code == 409


def test_ownership_and_auth(setup):
    client, _, headers = setup
    aid = start(client, headers)["id"]
    assert client.get(f"/attempts/{aid}").status_code == 401
    other = client.post(
        "/auth/register", json={"alias": "other", "password": "test-password"}
    ).json()
    h = {"Authorization": "Bearer " + other["access_token"]}
    assert client.get(f"/attempts/{aid}", headers=h).status_code == 404
    assert upload(client, h, aid).status_code == 404
    assert client.delete("/auth/session", headers=headers).status_code == 204
    assert client.get("/me", headers=headers).status_code == 401


def test_login_and_case_insensitive_alias(setup):
    client, _, _ = setup
    assert (
        client.post(
            "/auth/login", json={"alias": "PLAYER", "password": "test-password"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/auth/login", json={"alias": "player", "password": "wrong-password"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/register", json={"alias": "PLAYER", "password": "test-password"}
        ).status_code
        == 409
    )


def test_deadline_and_no_restart(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    with connect(settings, write=True) as db:
        db.execute("UPDATE attempts SET deadline=? WHERE id=?", (time.time() - 1, aid))
    assert upload(client, headers, aid).status_code == 409
    run_once(settings)
    assert start(client, headers)["status"] == "expired"
    assert client.post(f"/attempts/{aid}/replacement", headers=headers).status_code == 409


def test_reopening_expired_recording_does_not_offer_another_take(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    with connect(settings, write=True) as db:
        db.execute("UPDATE attempts SET deadline=? WHERE id=?", (time.time() - 1, aid))
    # No worker sweep has run yet.
    reopened = start(client, headers)
    assert reopened["id"] == aid
    assert reopened["status"] == "expired"


def test_worker_loop_survives_a_failed_pass(setup, monkeypatch):
    _, settings, _ = setup
    passes = []

    def run(_settings):
        passes.append(1)
        if len(passes) == 1:
            raise sqlite3.OperationalError("database is locked")
        raise KeyboardInterrupt

    monkeypatch.setattr("app.worker.Settings", lambda: settings)
    monkeypatch.setattr("app.worker.run_once", run)
    monkeypatch.setattr("app.worker.time.sleep", lambda _seconds: None)
    with pytest.raises(KeyboardInterrupt):
        worker_main()
    assert len(passes) == 2


def test_competition_day_rolls_over_at_local_midnight(setup):
    _, settings, _ = setup
    evening = datetime(2026, 10, 11, 23, 30, tzinfo=UTC).timestamp()
    central = settings.model_copy(update={"day_utc_offset_hours": -5})
    utc = settings.model_copy(update={"day_utc_offset_hours": 0})
    # 23:30 UTC is 6:30 PM Central; 01:30 UTC the next day is still 8:30 PM Central.
    assert attempts.day_at(evening, central) == attempts.day_at(evening + 7200, central)
    assert attempts.day_at(evening, utc) != attempts.day_at(evening + 7200, utc)


def test_sign_up_has_no_rate_limit_but_login_does(setup):
    client, settings, _ = setup
    with connect(settings, write=True) as db:
        # A full login budget must not block new accounts from the same address.
        db.execute(
            "INSERT OR REPLACE INTO rate_limits VALUES ('auth:testclient',?,?)",
            (time.time(), settings.login_attempts_per_minute),
        )
    body = {"alias": "newcomer", "password": "test-password"}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/login", json=body).status_code == 429


def test_health_reports_scoring_readiness(setup, monkeypatch):
    client, _, _ = setup
    health = client.get("/health").json()
    assert health["status"] == "ok" and health["ready"] and health["issues"] == []
    monkeypatch.setattr("app.services.attempts.shutil.which", lambda _: None)
    health = client.get("/health").json()
    assert health["status"] == "ok" and not health["ready"] and health["issues"]


def test_midnight_keeps_original_competition_day(setup, monkeypatch):
    client, settings, headers = setup
    # Five seconds before local midnight in the configured competition timezone.
    old = datetime(2026, 10, 10, 23, 59, 55, tzinfo=UTC).timestamp()
    old -= settings.day_utc_offset_hours * 3600
    monkeypatch.setattr("time.time", lambda: old)
    attempt = start(client, headers)
    monkeypatch.setattr("time.time", lambda: old + 10)
    assert upload(client, headers, attempt["id"]).status_code == 202
    run_once(settings)
    assert client.get("/leaderboard?day=2026-10-10").json()["entries"]
    assert client.get("/leaderboard?day=2026-10-11").json()["entries"] == []
    assert start(client, headers)["id"] != attempt["id"]


def test_parallel_starts_get_one_attempt(setup):
    client, settings, headers = setup
    player = client.get("/me", headers=headers).json()["id"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: attempts.start(settings, player), range(4)))
    assert len({r["id"] for r in results}) == 1


def test_retry_same_recording_and_exhaustion(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    seen = []

    def broken(settings, attempt, challenge):
        seen.append(attempt["media_path"])
        raise ValueError("Provider failed")

    for _ in range(settings.max_judge_tries):
        assert run_once(settings, broken)
        with connect(settings, write=True) as db:
            db.execute("UPDATE attempts SET next_run=0")
    result = client.get(f"/attempts/{aid}", headers=headers).json()
    assert result["status"] == "judge_failed"
    assert result["score"] is None
    assert len(set(seen)) == 1
    assert not run_once(settings, broken)
    assert client.post(f"/attempts/{aid}/replacement", headers=headers).status_code == 409


def test_worker_recovers_expired_lease(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    with connect(settings, write=True) as db:
        db.execute(
            "UPDATE attempts SET status='processing',lease='dead-worker',lease_until=0,tries=1"
        )
    assert run_once(settings)
    assert client.get(f"/attempts/{aid}", headers=headers).json()["status"] == "completed"


def test_active_lease_not_stolen(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    with connect(settings, write=True) as db:
        db.execute("UPDATE attempts SET status='processing',lease_until=?", (time.time() + 300,))
    assert not run_once(settings)


def test_upload_limits_and_invalid_media(setup):
    client, settings, headers = setup
    settings.max_upload_bytes = 2
    aid = start(client, headers)["id"]
    assert upload(client, headers, aid, b"123").status_code == 413
    assert not list(settings.media_dir.iterdir())


def test_configuration_locked_for_day(setup):
    client, settings, headers = setup
    start(client, headers)
    settings.gemini_model = "another-model"
    user = client.post(
        "/auth/register", json={"alias": "other", "password": "test-password"}
    ).json()
    response = client.post(
        "/attempts",
        json={"consent_to_ai_processing": True},
        headers={"Authorization": "Bearer " + user["access_token"]},
    )
    assert response.status_code == 503


def test_capacity_prevents_new_prompt(setup):
    client, settings, headers = setup
    with connect(settings, write=True) as db:
        db.execute(
            "INSERT INTO daily_usage VALUES (?,?)",
            (attempts.day_at(time.time(), settings), settings.max_daily_jobs),
        )
    assert (
        client.post(
            "/attempts", headers=headers, json={"consent_to_ai_processing": True}
        ).status_code
        == 503
    )
    assert client.get("/attempts/current", headers=headers).json() is None


def test_consent_required(setup):
    client, _, headers = setup
    assert (
        client.post(
            "/attempts", headers=headers, json={"consent_to_ai_processing": False}
        ).status_code
        == 400
    )


def test_equal_scores_share_rank(setup):
    client, settings, headers = setup
    first = start(client, headers)
    upload(client, headers, first["id"])
    run_once(settings)
    token = client.post(
        "/auth/register", json={"alias": "second", "password": "test-password"}
    ).json()["access_token"]
    other = {"Authorization": "Bearer " + token}
    second = start(client, other)
    upload(client, other, second["id"])
    run_once(settings)
    entries = client.get("/leaderboard").json()["entries"]
    assert [entry["rank"] for entry in entries] == [1, 1]


def test_retention_removes_failed_recording(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    upload(client, headers, aid)
    with connect(settings, write=True) as db:
        db.execute("UPDATE attempts SET created=?", (time.time() - 86401,))
    run_once(settings)
    assert not list(settings.media_dir.iterdir())
    assert client.get(f"/attempts/{aid}", headers=headers).json()["status"] == "judge_failed"


@pytest.mark.parametrize("value", [-1, 5001, 6.5, "8", True])
def test_judge_rating_validation(value):
    category = {"rating": value, "feedback": "Example"}
    with pytest.raises(ValueError):
        Judgment.model_validate({name: category for name in ("accuracy", "confidence", "delivery")})


def test_unconfigured_ai_does_not_reveal_question(setup):
    client, settings, headers = setup
    settings.judge_mode = "gemini"
    settings.gemini_api_key = ""
    response = client.post("/attempts", headers=headers, json={"consent_to_ai_processing": True})
    assert response.status_code == 503
    assert client.get("/attempts/current", headers=headers).json() is None


def test_openapi_exposes_bearer_auth(setup):
    client, _, _ = setup
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert schema["paths"]["/attempts"]["post"]["security"] == [{"HTTPBearer": []}]


def test_interrupted_upload_recovery(setup):
    client, settings, headers = setup
    aid = start(client, headers)["id"]
    with connect(settings, write=True) as db:
        db.execute(
            "UPDATE attempts SET status='uploading', deadline=? WHERE id=?", (time.time() - 21, aid)
        )
    run_once(settings)
    result = client.post(f"/attempts/{aid}/replacement", headers=headers)
    assert result.status_code == 200
    assert result.json()["id"] != aid


def test_unsupported_mime_allows_replacement(setup):
    client, _, headers = setup
    aid = start(client, headers)["id"]
    response = client.put(
        f"/attempts/{aid}/video",
        content=b"invalid",
        headers={**headers, "Content-Type": "text/plain"},
    )
    assert response.status_code == 415
    assert client.post(f"/attempts/{aid}/replacement", headers=headers).status_code == 200
