"""Normalize browser recordings before sending them to Pegasus."""

import subprocess
import tempfile
from pathlib import Path


def pegasus_video_bytes(path, settings):
    # Keep private intermediate files under the deployment's recording storage.
    with tempfile.TemporaryDirectory(prefix="pegasus-", dir=settings.storage_dir) as directory:
        output = Path(directory) / "recording.mp4"
        try:
            subprocess.run(
                [
                    settings.ffmpeg,
                    "-nostdin",
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file",
                    "-i",
                    str(Path(path).resolve()),
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0",
                    "-map_metadata",
                    "-1",
                    "-vf",
                    (
                        "scale=w='min(1280,iw)':h='min(720,ih)':"
                        "force_original_aspect_ratio=decrease:force_divisible_by=2"
                    ),
                    "-r",
                    "24",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-pix_fmt",
                    "yuv420p",
                    "-b:v",
                    "1000k",
                    "-maxrate",
                    "1200k",
                    "-bufsize",
                    "2400k",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "96k",
                    "-ac",
                    "1",
                    "-ar",
                    "48000",
                    "-movflags",
                    "+faststart",
                    str(output),
                ],
                capture_output=True,
                timeout=45,
                check=True,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise ValueError(
                "Recording conversion failed; check the worker's ffmpeg installation"
            ) from exc
        if not 0 < output.stat().st_size <= settings.max_upload_bytes:
            raise ValueError("Converted recording exceeds the inline video size limit")
        return output.read_bytes()
