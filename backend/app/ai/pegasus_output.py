"""Prompt-based JSON output for Pegasus, validated before it becomes a score."""

import base64
import json


def inline_schema(output_model):
    """The model's JSON schema with every $ref replaced by its definition.

    Pegasus sometimes answers with the schema itself when it opens with a "$defs" block.
    """
    schema = output_model.model_json_schema()
    definitions = schema.pop("$defs", {})

    def resolve(node):
        if isinstance(node, list):
            return [resolve(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return resolve(definitions[node["$ref"].rsplit("/", 1)[1]])
        # Generated titles only repeat the field names.
        return {
            key: resolve(value)
            for key, value in node.items()
            if not (key == "title" and isinstance(value, str))
        }

    return resolve(schema)


def scoring_request(video_bytes, output_model, system_prompt):
    schema = json.dumps(inline_schema(output_model), separators=(",", ":"))
    return {
        "inputPrompt": system_prompt + "\nReturn exactly one JSON object holding your assessment "
        "of this video, with the fields the schema below describes. Include every required "
        "field. Do not repeat the schema. Do not include markdown or commentary.\nSchema: "
        + schema,
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
