"""Exercise real FFmpeg output through ffprobe and the complete API/worker flow."""

import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.media import InvalidMedia, validate_media
from app.worker import run_once

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
pytestmark = pytest.mark.skipif(not FFMPEG or not FFPROBE, reason="FFmpeg binaries required")


def make_clip(path, duration=1, audio=True):
    command = [FFMPEG, "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x120:r=10"]
    if audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000"]
    command += ["-t", str(duration)]
    if path.suffix == ".webm":
        command += ["-c:v", "libvpx", "-c:a", "libopus"]
    else:
        command += ["-c:v", "mpeg4", "-c:a", "aac"]
    subprocess.run(command + [str(path)], check=True, capture_output=True, timeout=30)


@pytest.mark.parametrize("extension,mime", [("webm", "video/webm"), ("mp4", "video/mp4")])
def test_real_clip_complete_game(tmp_path, extension, mime):
    clip = tmp_path / f"clip.{extension}"
    make_clip(clip)
    settings = Settings(
        storage_dir=tmp_path / "storage",
        judge_mode="demo",
        invite_code="",
        ffprobe=FFPROBE,
        _env_file=None,
    )
    with TestClient(create_app(settings)) as client:
        token = client.post(
            "/auth/register", json={"alias": "media_player", "password": "test-password"}
        ).json()["access_token"]
        headers = {"Authorization": "Bearer " + token}
        attempt = client.post(
            "/attempts", headers=headers, json={"consent_to_ai_processing": True}
        ).json()
        response = client.put(
            f"/attempts/{attempt['id']}/video",
            content=clip.read_bytes(),
            headers={**headers, "Content-Type": mime},
        )
        assert response.status_code == 202, response.text
        assert run_once(settings)
        result = client.get(f"/attempts/{attempt['id']}", headers=headers).json()
        assert result["status"] == "completed"
        assert result["score"]["final_score"] == 3000


@pytest.mark.parametrize("duration,audio", [(32, True), (1, False)])
def test_real_invalid_clips(tmp_path, duration, audio):
    clip = tmp_path / "invalid.mp4"
    make_clip(clip, duration, audio)
    with pytest.raises(InvalidMedia):
        validate_media(clip, Settings(ffprobe=FFPROBE, _env_file=None))


def test_corrupt_media(tmp_path):
    clip = tmp_path / "fake.mp4"
    clip.write_bytes(b"not a video")
    with pytest.raises(InvalidMedia):
        validate_media(clip, Settings(ffprobe=FFPROBE, _env_file=None))
