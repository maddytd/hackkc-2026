"""Classify Gemini failures without exposing provider payloads to players or logs."""

import math
from dataclasses import dataclass

from google.genai.errors import APIError


@dataclass(frozen=True)
class GeminiFailure:
    code: str
    message: str
    retryable: bool
    delay: float = 0


def classify_gemini_error(error):
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        if isinstance(error, APIError):
            return _classify(error)
        error = error.__cause__ or error.__context__
    return None


def _classify(error):
    payload = error.details if isinstance(error.details, dict) else {}
    payload = payload.get("error", payload)
    if not isinstance(payload, dict):
        payload = {}
    details = payload.get("details", [])
    details = details if isinstance(details, list) else []
    violations = []
    delay = 60.0
    invalid_key = False
    for detail in details:
        if not isinstance(detail, dict):
            continue
        if detail.get("@type", "").endswith("QuotaFailure"):
            violations.extend(v for v in detail.get("violations", []) if isinstance(v, dict))
        if detail.get("reason") in {"API_KEY_INVALID", "API_KEY_EXPIRED"}:
            invalid_key = True
        if detail.get("@type", "").endswith("RetryInfo"):
            value = detail.get("retryDelay", "")
            try:
                seconds = float(value.removesuffix("s"))
                if math.isfinite(seconds) and seconds >= 0:
                    delay = max(delay, seconds)
            except (ValueError, AttributeError, TypeError):
                pass
    if error.code == 429:
        daily = any("perday" in str(v.get("quotaId", "")).lower() for v in violations)
        unavailable = any(str(v.get("quotaValue")) == "0" for v in violations)
        if daily or unavailable:
            return GeminiFailure(
                "quota_exhausted",
                "Gemini's daily request or token quota is exhausted. Scoring is unavailable "
                "until the quota resets or the host updates the project's quota."
                if daily
                else "Gemini reports no available quota for this model. The host needs to check "
                "the project's model access and quota in Google AI Studio.",
                False,
            )
        return GeminiFailure(
            "rate_limited",
            "Gemini's request or token limit was reached.",
            True,
            delay,
        )
    if error.code in (401, 403) or invalid_key:
        return GeminiFailure(
            "access_denied",
            "Gemini could not authorize scoring. The host needs to check the API key "
            "and model permissions; this is not a confirmed quota error.",
            False,
        )
    if error.code == 404:
        return GeminiFailure(
            "model_unavailable",
            "The configured Gemini model is unavailable. The host needs to check the "
            "model name and access in Google AI Studio.",
            False,
        )
    if error.code == 400:
        return GeminiFailure(
            "request_rejected",
            "Gemini rejected the scoring request. The host needs to check the model "
            "configuration and recording format; this is not a confirmed quota error.",
            False,
        )
    if error.code >= 500 or error.code == 408:
        return GeminiFailure(
            "service_unavailable",
            "Gemini is temporarily unavailable.",
            True,
            30,
        )
    return None
