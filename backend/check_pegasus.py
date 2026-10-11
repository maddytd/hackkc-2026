"""Make one diagnostic request with the latest failed AWS test recording."""

import argparse
import base64
import json
import sqlite3
import subprocess
import tempfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.ai.aws_pipeline import VIDEO_PROMPT, client_config
from app.ai.pegasus_output import parse_scoring_response, scoring_request
from app.ai.recording import pegasus_video_bytes
from app.config import Settings
from app.schemas import PerformanceEvidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--synthetic", action="store_true", help="Test a generated five-second clip"
    )
    parser.add_argument(
        "--minimal", action="store_true", help="Use a simple prompt without a schema"
    )
    parser.add_argument("--model", help="Override the diagnostic model ID only")
    parser.add_argument(
        "--no-schema", action="store_true", help="Keep the scoring prompt but omit responseFormat"
    )
    args = parser.parse_args()
    database = Path(__file__).resolve().parent / "storage-aws-test" / "game.db"
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT a.media_path,c.model,c.rubric FROM attempts a "
            "JOIN challenges c ON c.day=a.day "
            "WHERE a.status='judge_failed' AND a.media_path IS NOT NULL "
            "AND c.mode='aws' ORDER BY a.created DESC LIMIT 1"
        ).fetchone()
    if row is None:
        print("No retained failed AWS test recording was found.")
        return
    video = Path(row["media_path"])
    if not video.is_absolute():
        video = database.parent.parent / video
    if not video.is_file():
        print("The test recording is no longer available.")
        return
    policy = json.loads(row["model"])
    endpoint = dict(policy["video"][0])
    if args.model:
        endpoint["model"] = args.model
    settings = Settings(storage_dir=database.parent)
    if args.synthetic:
        with tempfile.TemporaryDirectory(prefix="pegasus-check-", dir=database.parent) as directory:
            source = Path(directory) / "synthetic.mp4"
            subprocess.run(
                [
                    settings.ffmpeg,
                    "-nostdin",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc2=size=640x360:rate=24",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:sample_rate=48000",
                    "-t",
                    "5",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    str(source),
                ],
                check=True,
                capture_output=True,
                timeout=30,
            )
            video_bytes = pegasus_video_bytes(source, settings)
    else:
        video_bytes = pegasus_video_bytes(video, settings)
    scoring_prompt = (
        policy.get("performance_prompt", VIDEO_PROMPT) + "\nDaily rubric:\n" + row["rubric"]
    )
    body = scoring_request(video_bytes, PerformanceEvidence, scoring_prompt)
    if args.minimal or args.synthetic:
        body["inputPrompt"] = "Briefly describe what is visible in this video."
        body["maxOutputTokens"] = 512
    elif args.no_schema:
        body["inputPrompt"] = scoring_prompt
    assert base64.b64decode(body["mediaSource"]["base64String"], validate=True) == video_bytes
    print("Using AWS profile larple:", endpoint["model"], "in", endpoint["region"])
    print(
        "Video bytes:",
        len(video_bytes),
        "; encoded characters:",
        len(body["mediaSource"]["base64String"]),
    )
    kind = "generated synthetic clip" if args.synthetic else "retained test recording"
    print("Sending one request with the", kind, "; SDK retries are disabled.")
    client = boto3.Session(profile_name="larple", region_name=endpoint["region"]).client(
        "bedrock-runtime", config=client_config()
    )
    try:
        response = client.invoke_model(
            modelId=endpoint["model"],
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
        stream = response["body"]
        try:
            result = json.loads(stream.read())
        finally:
            stream.close()
        metadata = {
            "response_fields": sorted(result),
            "completion_fields": {
                key: result[key]
                for key in ("finishReason", "stopReason", "finish_reason", "stop_reason")
                if key in result
            },
            "message_type": type(result.get("message")).__name__,
            "message_characters": len(result["message"])
            if isinstance(result.get("message"), str)
            else None,
        }
        print("Response metadata:", json.dumps(metadata))
        if not (args.minimal or args.synthetic or args.no_schema):
            parse_scoring_response(result, PerformanceEvidence)
            print("The response also passed the scoring schema validation.")
        print("Pegasus accepted the", kind, ". No score or database changes were made.")
    except ClientError as exc:
        error = exc.response.get("Error", {})
        print("AWS error:", error.get("Code"))
        print("Reason:", error.get("Message"))
    finally:
        client.close()


if __name__ == "__main__":
    main()
