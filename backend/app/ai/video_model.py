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

    async def structured_output(self, output_model, prompt, system_prompt=None, **kwargs):
        # Gemini's older response_schema representation rejects Pydantic's
        # additionalProperties. The JSON Schema field preserves our strict schema.
        params = {
            **(self.config.get("params") or {}),
            "response_mime_type": "application/json",
            "response_json_schema": output_model.model_json_schema(),
        }
        request = self._format_request(prompt, None, system_prompt, params)
        response = await self._get_client().aio.models.generate_content(**request)
        if not response.candidates or response.candidates[0].finish_reason != "STOP":
            raise ValueError("Judge did not complete a valid response")
        if not response.text:
            raise ValueError("Judge returned no structured response")
        yield {"output": output_model.model_validate_json(response.text)}
