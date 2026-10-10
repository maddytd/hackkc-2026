import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def setup(tmp_path, monkeypatch):
    settings = Settings(storage_dir=tmp_path, judge_mode="demo", invite_code="", _env_file=None)
    monkeypatch.setattr("app.services.attempts.shutil.which", lambda _: "/test/ffprobe")
    app = create_app(settings)
    app.state.validate_media = lambda path, settings: "video/webm"
    with TestClient(app) as client:
        response = client.post(
            "/auth/register", json={"alias": "player", "password": "test-password"}
        )
        assert response.status_code == 201
        headers = {"Authorization": "Bearer " + response.json()["access_token"]}
        yield client, settings, headers


def start(client, headers):
    response = client.post("/attempts", headers=headers, json={"consent_to_ai_processing": True})
    assert response.status_code == 200, response.text
    return response.json()


def upload(client, headers, aid, content=b"test-video"):
    return client.put(
        f"/attempts/{aid}/video", content=content, headers={**headers, "Content-Type": "video/webm"}
    )
