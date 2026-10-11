"""Prompt-based JSON output for Pegasus, validated before it becomes a score."""

import base64
import json


def scoring_request(video_bytes, output_model, system_prompt):
    schema = json.dumps(output_model.model_json_schema(), separators=(",", ":"))
    return {
        "inputPrompt": system_prompt + "\nReturn exactly one JSON object matching this schema. "
        "Include every required field. Do not include markdown or commentary.\n" + schema,
        "mediaSource": {"base64String": base64.b64encode(video_bytes).decode("ascii")},
        "temperature": 0,
        "maxOutputTokens": 4096,
    }


def parse_scoring_response(result, output_model):
    reasons = [result[key] for key in ("finishReason", "stopReason") if key in result]
    if not reasons or any(reason != "stop" for reason in reasons):
        raise ValueError("Pegasus did not complete a judgment")
    message = result["message"].strip()
    # Tolerate a single JSON code fence, but never extract JSON from surrounding prose.
    if message.startswith("```json\n") and message.endswith("```"):
        message = message[len("```json\n") : -3].strip()
    elif message.startswith("```\n") and message.endswith("```"):
        message = message[4:-3].strip()
    output = output_model.model_validate_json(message)
    if not output.audio_assessable or not output.video_assessable:
        raise ValueError("Both audio and visual evidence are required")
    if {item.channel for item in output.observations} != {"audio", "visual"}:
        raise ValueError("Missing audiovisual observations")
    return output
