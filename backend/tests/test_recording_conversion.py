import json
import shutil
import subprocess

import pytest

from app.ai.recording import pegasus_video_bytes
from app.config import Settings


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg is required")
def test_webm_becomes_h264_aac_with_duration_and_temp_cleanup(tmp_path):
    source = tmp_path / "source.webm"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=size=640x360:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000",
            "-t",
            "2",
            "-c:v",
            "libvpx",
            "-c:a",
            "libopus",
            str(source),
        ],
        check=True,
        capture_output=True,
        timeout=20,
    )
    result = pegasus_video_bytes(source, Settings(storage_dir=tmp_path))
    output = tmp_path / "verified.mp4"
    output.write_bytes(result)
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name,codec_type",
            "-of",
            "json",
            str(output),
        ],
        check=True,
        capture_output=True,
        timeout=10,
    )
    metadata = json.loads(probe.stdout)
    assert {stream["codec_name"] for stream in metadata["streams"]} == {"h264", "aac"}
    assert 1.9 <= float(metadata["format"]["duration"]) <= 2.2
    assert result[4:8] == b"ftyp"
    assert not list(tmp_path.glob("pegasus-*"))


def test_failed_conversion_cleans_private_temp_files(tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise subprocess.TimeoutExpired("ffmpeg", 45)

    monkeypatch.setattr("app.ai.recording.subprocess.run", fail)
    with pytest.raises(ValueError, match="conversion failed"):
        pegasus_video_bytes(tmp_path / "source.webm", Settings(storage_dir=tmp_path))
    assert not list(tmp_path.glob("pegasus-*"))
