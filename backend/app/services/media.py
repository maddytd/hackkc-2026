import json
import math
import subprocess


class InvalidMedia(ValueError):
    pass


def validate_media(path, settings):
    """Inspect local containers and packet timestamps (WebM may omit duration)."""
    try:
        result = subprocess.run(
            [
                settings.ffprobe,
                "-v",
                "error",
                "-protocol_whitelist",
                "file",
                "-format_whitelist",
                "mov,matroska,webm",
                "-show_entries",
                "format=format_name,duration:stream=codec_type,codec_name:packet=pts_time,duration_time",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            timeout=15,
            check=True,
        )
        data = json.loads(result.stdout)
        kinds = {s["codec_type"] for s in data.get("streams", [])}
        if not {"audio", "video"}.issubset(kinds):
            raise InvalidMedia("Recording must contain both audio and video")
        names = data.get("format", {}).get("format_name", "").split(",")
        if "webm" in names:
            mime = "video/webm"
        elif "mp4" in names:
            mime = "video/mp4"
        else:
            raise InvalidMedia("Only MP4 and WebM recordings are supported")
        packets = data.get("packets", [])
        starts = [float(p["pts_time"]) for p in packets if "pts_time" in p]
        ends = [
            float(p["pts_time"]) + float(p.get("duration_time", 0))
            for p in packets
            if "pts_time" in p
        ]
        durations = [max(ends) - min(starts)] if starts else []
        declared = data.get("format", {}).get("duration")
        if declared is not None:
            durations.append(float(declared))
        duration = max(durations, default=0)
        if not math.isfinite(duration) or not 0 < duration <= settings.recording_seconds + 1:
            raise InvalidMedia("Recording must be between 0 and 31 seconds")
        return mime
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError) as exc:
        if isinstance(exc, InvalidMedia):
            raise
        raise InvalidMedia("Recording could not be read") from exc
