from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr


class GeneratedQuestion(BaseModel):
    """The day's AI-generated recall question plus its private model answer (guide)."""

    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=5, max_length=300)
    category: str = Field(min_length=1, max_length=40)
    difficulty: Literal["easy", "medium", "hard"]
    context: str = Field(min_length=1, max_length=200)
    guide: str = Field(min_length=10, max_length=2000)


class Credentials(BaseModel):
    alias: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    password: str = Field(min_length=10, max_length=128)
    invite_code: str = Field(default="", max_length=256)


class StartAttempt(BaseModel):
    consent_to_ai_processing: bool


class Category(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rating: int = Field(ge=0, le=5000, strict=True)
    feedback: str = Field(min_length=1, max_length=1000)


class Judgment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accuracy: Category
    confidence: Category
    delivery: Category
    _provenance: dict = PrivateAttr(default_factory=dict)


class SourceExcerpt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=10, max_length=1000, pattern=r"^https://")
    text: str = Field(min_length=20, max_length=12000)


class QuestionDraft(GeneratedQuestion):
    source_url: str = Field(min_length=10, max_length=1000, pattern=r"^https://")
    supporting_quote: str = Field(min_length=10, max_length=1000)


class QuestionBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    questions: list[QuestionDraft] = Field(min_length=1, max_length=20)


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seconds: float = Field(ge=0, le=31)
    channel: Literal["visual", "audio"]
    description: str = Field(min_length=5, max_length=400)


class AgentCategory(Category):
    """AWS agents use anchored 0..10 ratings, normalized at the scoring boundary."""

    rating: int = Field(ge=0, le=10, strict=True)


class PerformanceEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    audio_assessable: bool
    video_assessable: bool
    transcript: str = Field(max_length=6000)
    observations: list[Observation] = Field(min_length=2, max_length=12)
    confidence: AgentCategory
    delivery: AgentCategory


class AccuracyJudgment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accuracy: AgentCategory
