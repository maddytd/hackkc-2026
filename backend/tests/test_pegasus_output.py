import base64
import json

import pytest
from pydantic import ValidationError

from app.ai.pegasus_output import parse_scoring_response, scoring_request
from app.schemas import PerformanceEvidence


def evidence():
    return {
        "audio_assessable": True,
        "video_assessable": True,
        "transcript": "Enceladus",
        "observations": [
            {"seconds": 2, "channel": "audio", "description": "Clear spoken answer"},
            {"seconds": 3, "channel": "visual", "description": "Gesture toward camera"},
        ],
        "confidence": {"rating": 8, "feedback": "Committed vocal emphasis"},
        "delivery": {"rating": 7, "feedback": "Clear articulation"},
    }


def test_request_omits_rejected_native_format_and_includes_output_contract():
    body = scoring_request(b"video", PerformanceEvidence, "Judge delivery.")
    assert "responseFormat" not in body
    assert base64.b64decode(body["mediaSource"]["base64String"]) == b"video"
    assert '"audio_assessable"' in body["inputPrompt"]
    assert '"maximum":10' in body["inputPrompt"]


@pytest.mark.parametrize("fenced", [False, True])
@pytest.mark.parametrize("completion_key", ["finishReason", "stopReason"])
def test_valid_evidence_is_parsed_without_exposing_or_rewriting_transcript(fenced, completion_key):
    message = json.dumps(evidence())
    if fenced:
        message = "```json\n" + message + "\n```"
    result = parse_scoring_response(
        {completion_key: "stop", "message": message}, PerformanceEvidence
    )
    assert result.transcript == "Enceladus"
    assert result.confidence.rating == 8


def test_invalid_rating_cannot_become_a_score():
    data = evidence()
    data["confidence"]["rating"] = 50
    with pytest.raises(ValidationError):
        parse_scoring_response(
            {"finishReason": "stop", "message": json.dumps(data)}, PerformanceEvidence
        )


def test_missing_modality_cannot_become_a_score():
    data = evidence()
    data["audio_assessable"] = False
    with pytest.raises(ValueError, match="Both audio and visual"):
        parse_scoring_response(
            {"finishReason": "stop", "message": json.dumps(data)}, PerformanceEvidence
        )


def test_truncated_response_cannot_become_a_score():
    with pytest.raises(ValueError, match="did not complete"):
        parse_scoring_response(
            {"finishReason": "length", "message": json.dumps(evidence())}, PerformanceEvidence
        )
