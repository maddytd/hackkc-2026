import json
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.services.media import InvalidMedia, validate_media


def probe(monkeypatch, data):
    monkeypatch.setattr(
        "subprocess.run", lambda *args, **kwargs: SimpleNamespace(stdout=json.dumps(data).encode())
    )


def test_webm_without_header_duration(monkeypatch, tmp_path):
    probe(
        monkeypatch,
        {
            "streams": [{"codec_type": "audio"}, {"codec_type": "video"}],
            "format": {"format_name": "matroska,webm"},
            "packets": [
                {"pts_time": "0", "duration_time": "0.02"},
                {"pts_time": "29.9", "duration_time": "0.1"},
            ],
        },
    )
    assert validate_media(tmp_path / "video", Settings()) == "video/webm"


@pytest.mark.parametrize("duration", ["32", "nan", "inf", "0", "-1"])
def test_bad_duration(monkeypatch, tmp_path, duration):
    probe(
        monkeypatch,
        {
            "streams": [{"codec_type": "audio"}, {"codec_type": "video"}],
            "format": {"format_name": "mp4", "duration": duration},
        },
    )
    with pytest.raises(InvalidMedia):
        validate_media(tmp_path / "video", Settings())


def test_audio_required(monkeypatch, tmp_path):
    probe(
        monkeypatch,
        {"streams": [{"codec_type": "video"}], "format": {"format_name": "mp4", "duration": "10"}},
    )
    with pytest.raises(InvalidMedia, match="both audio and video"):
        validate_media(tmp_path / "video", Settings())


@pytest.mark.parametrize("duration", ["0.5", "3.3785", "4", "4.99"])
def test_aws_short_video_rejected_before_judging(monkeypatch, tmp_path, duration):
    probe(
        monkeypatch,
        {
            "streams": [{"codec_type": "audio"}, {"codec_type": "video"}],
            "format": {"format_name": "mp4", "duration": duration},
        },
    )
    with pytest.raises(InvalidMedia, match="at least 5 seconds"):
        validate_media(tmp_path / "video", Settings(judge_mode="aws", _env_file=None))


@pytest.mark.parametrize(
    "mode,duration", [("aws", "5"), ("aws", "30"), ("gemini", "1"), ("demo", "1")]
)
def test_minimum_duration_is_specific_to_aws(monkeypatch, tmp_path, mode, duration):
    probe(
        monkeypatch,
        {
            "streams": [{"codec_type": "audio"}, {"codec_type": "video"}],
            "format": {"format_name": "mp4", "duration": duration},
        },
    )
    assert (
        validate_media(tmp_path / "video", Settings(judge_mode=mode, _env_file=None)) == "video/mp4"
    )
