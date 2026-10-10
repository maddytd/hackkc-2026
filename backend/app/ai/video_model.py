"""Preserve video blocks for Strands Gemini versions that omit their mapping."""

from google.genai import types
from strands.models.gemini import GeminiModel


class VideoGeminiModel(GeminiModel):
    def _format_request_content_part(self, content, *args, **kwargs):
        if "video" in content:
            video = content["video"]
            mime = {"mp4": "video/mp4", "webm": "video/webm"}.get(video["format"])
            if mime is None:
                raise ValueError("Unsupported recording type")
            return types.Part(inline_data=types.Blob(data=video["source"]["bytes"], mime_type=mime))
        return super()._format_request_content_part(content, *args, **kwargs)
