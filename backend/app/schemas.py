from pydantic import BaseModel, ConfigDict, Field


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
