import json

import pytest

from app.ai.question_library import approve, approve_facts, validate_sources
from app.config import Settings
from app.schemas import QuestionBatch, SourceExcerpt
from app.services.attempts import build_questions


def packet():
    source = SourceExcerpt(
        url="https://example.org/reference", text="Enceladus is a moon of Saturn with icy plumes."
    )
    batch = QuestionBatch.model_validate(
        {
            "questions": [
                {
                    "text": "Which moon of Saturn has icy plumes?",
                    "category": "astronomy",
                    "difficulty": "hard",
                    "context": "Name the moon.",
                    "guide": "Correct answer: Enceladus. Accept recognizable pronunciation.",
                    "source_url": source.url,
                    "supporting_quote": "Enceladus is a moon of Saturn",
                }
            ]
        }
    )
    return batch, [source]


def test_niche_library_does_not_call_generation(monkeypatch):
    monkeypatch.setattr(
        "app.ai.generator.generate_question",
        lambda *args: pytest.fail("Generation must be offline"),
    )
    settings = Settings(gemini_api_key="test-key", _env_file=None)
    bank = build_questions(settings, "2026-10-11")
    assert len(bank) >= 8
    assert all(question["difficulty"] == "hard" for question in bank)


def test_invented_source_or_quote_rejected():
    batch, sources = packet()
    validate_sources(batch, sources)
    batch.questions[0].source_url = "https://invented.example/reference"
    with pytest.raises(ValueError, match="quote"):
        validate_sources(batch, sources)
    batch.questions[0].source_url = sources[0].url
    batch.questions[0].supporting_quote = "Invented information not in the source"
    with pytest.raises(ValueError, match="quote"):
        validate_sources(batch, sources)


def test_draft_requires_explicit_review_and_keeps_sources_private(tmp_path):
    batch, sources = packet()
    draft = tmp_path / "draft.json"
    output = tmp_path / "library.json"
    draft.write_text(
        json.dumps(
            {
                "status": "draft",
                "questions": batch.model_dump()["questions"],
                "sources": [source.model_dump() for source in sources],
            }
        )
    )
    with pytest.raises(ValueError, match="human"):
        approve(draft, output, " ")
    assert not output.exists()
    approve(draft, output, "Test reviewer")
    settings = Settings(questions_file=output, _env_file=None)
    bank = build_questions(settings, "2026-10-11")
    assert bank[0]["reviewed_by"] == "Test reviewer"
    assert bank[0]["source_url"] == sources[0].url
    with pytest.raises(ValueError, match="already"):
        approve(draft, output, "Test reviewer")


def test_fun_facts_need_a_real_quote_and_a_human_reviewer(tmp_path):
    source = {"url": "https://example.org/otters", "text": "Sea otters hold hands while sleeping."}
    fact = {
        "text": "Sea otters hold hands while they sleep.",
        "source_url": source["url"],
        "supporting_quote": "Sea otters hold hands while sleeping",
    }
    draft = tmp_path / "facts.json"
    output = tmp_path / "library.json"
    draft.write_text(json.dumps({"status": "fact-draft", "facts": [fact], "sources": [source]}))
    with pytest.raises(ValueError, match="human"):
        approve_facts(draft, output, " ")
    approve_facts(draft, output, "Test reviewer")
    bank = json.loads(output.read_text())
    assert bank == [{**fact, "reviewed_by": "Test reviewer"}]
    with pytest.raises(ValueError, match="already"):
        approve_facts(draft, output, "Test reviewer")
    invented = {
        **fact,
        "text": "Sea otters can fly short distances.",
        "supporting_quote": "can fly",
    }
    draft.write_text(json.dumps({"status": "fact-draft", "facts": [invented], "sources": [source]}))
    with pytest.raises(ValueError, match="quote"):
        approve_facts(draft, output, "Test reviewer")
