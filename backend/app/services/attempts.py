import hashlib
import json
import shutil
import time
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.config import ROOT
from app.database import connect
from app.schemas import GeneratedQuestion

DEMO_SCORES = (
    ("demo-01", "Demo_Avery", 4820, 4610, 4730),
    ("demo-02", "Demo_Blair", 4680, 4790, 4510),
    ("demo-03", "Demo_Casey", 4570, 4420, 4690),
    ("demo-04", "Demo_Drew", 4490, 4580, 4380),
    ("demo-05", "Demo_Elliot", 4380, 4310, 4520),
    ("demo-06", "Demo_Finley", 4270, 4460, 4290),
    ("demo-07", "Demo_Gray", 4190, 4210, 4400),
    ("demo-08", "Demo_Harper", 4080, 4370, 4210),
    ("demo-09", "Demo_Indigo", 4010, 4140, 4320),
    ("demo-10", "Demo_Jules", 3950, 4260, 4020),
    ("demo-11", "Demo_Kai", 3880, 3990, 4230),
    ("demo-12", "Demo_Lennon", 3810, 4160, 3970),
    ("demo-13", "Demo_Morgan", 3740, 3890, 4120),
    ("demo-14", "Demo_Nico", 3670, 4050, 3840),
    ("demo-15", "Demo_Oakley", 3600, 3780, 4060),
    ("demo-16", "Demo_Parker", 3540, 3970, 3710),
    ("demo-17", "Demo_Quinn", 3470, 3630, 3990),
    ("demo-18", "Demo_River", 3400, 3850, 3560),
    ("demo-19", "Demo_Sage", 3340, 3510, 3890),
    ("demo-20", "Demo_Taylor", 3270, 3760, 3410),
    ("demo-21", "Demo_Umber", 3200, 3390, 3710),
    ("demo-22", "Demo_Val", 3140, 3620, 3260),
    ("demo-23", "Demo_Wren", 3070, 3260, 3570),
    ("demo-24", "Demo_Xen", 3000, 3480, 3110),
    ("demo-25", "Demo_Yuki", 2940, 3130, 3430),
    ("demo-26", "Demo_Zion", 2870, 3350, 2960),
    ("demo-27", "Demo_Ari", 2810, 2990, 3290),
    ("demo-28", "Demo_Bex", 2740, 3210, 2820),
    ("demo-29", "Demo_Cam", 2680, 2850, 3150),
    ("demo-30", "Demo_Dakota", 2610, 3070, 2670),
    ("demo-31", "Demo_Emery", 2550, 2710, 3010),
    ("demo-32", "Demo_Frankie", 2480, 2930, 2520),
    ("demo-33", "Demo_Gale", 2420, 2570, 2870),
    ("demo-34", "Demo_Hollis", 2350, 2790, 2380),
    ("demo-35", "Demo_Ira", 2290, 2440, 2730),
    ("demo-36", "Demo_Jamie", 2220, 2650, 2230),
    ("demo-37", "Demo_Kendall", 2160, 2300, 2590),
    ("demo-38", "Demo_Luca", 2090, 2510, 2080),
    ("demo-39", "Demo_Milan", 2030, 2160, 2450),
    ("demo-40", "Demo_Nova", 1960, 2370, 1930),
    ("demo-41", "Demo_Ollie", 1900, 2020, 2310),
    ("demo-42", "Demo_Phoenix", 1830, 2230, 1780),
    ("demo-43", "Demo_Remy", 1770, 1880, 2170),
    ("demo-44", "Demo_Sol", 1700, 2090, 1640),
    ("demo-45", "Demo_Tatum", 1640, 1740, 2030),
    ("demo-46", "Demo_Uni", 1570, 1950, 1490),
    ("demo-47", "Demo_Vesper", 1510, 1600, 1890),
    ("demo-48", "Demo_Wylie", 1440, 1810, 1340),
    ("demo-49", "Demo_Xavi", 1380, 1460, 1750),
    ("demo-50", "Demo_Zuri", 1310, 1670, 1200),
)


def day_at(now, settings):
    local = datetime.fromtimestamp(now, UTC) + timedelta(hours=settings.day_utc_offset_hours)
    return local.date().isoformat()


def owned(db, attempt_id, player_id):
    row = db.execute(
        "SELECT * FROM attempts WHERE id=? AND player_id=?", (attempt_id, player_id)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Attempt not found")
    return row


def public(db, row):
    question = json.loads(row["question"])
    result = {
        key: row[key]
        for key in ("id", "day", "status", "created", "deadline", "replacement_of", "failure")
    }
    result["question"] = {
        key: question[key] for key in ("id", "text", "category", "difficulty", "context")
    }
    challenge = db.execute("SELECT mode FROM challenges WHERE day=?", (row["day"],)).fetchone()
    result["demo"] = challenge["mode"] == "demo"
    result["score"] = None
    score = db.execute("SELECT * FROM scores WHERE attempt_id=?", (row["id"],)).fetchone()
    if score:
        result["score"] = {
            key: score[key] for key in ("accuracy", "confidence", "delivery", "final_score")
        }
        result["score"]["feedback"] = json.loads(score["feedback"])
    return result


def readiness_issues(settings):
    """Configuration problems that would stop a round from being recorded or scored."""
    issues = []
    if not shutil.which(settings.ffprobe):
        issues.append("Recording validation is unavailable; install ffprobe")
    if settings.judge_mode != "demo" and not shutil.which(settings.ffmpeg):
        issues.append("Recording conversion is unavailable; install ffmpeg")
    if settings.judge_mode == "gemini" and not settings.gemini_api_key:
        issues.append("AI judging has not been configured")
    if settings.judge_mode == "aws" and not settings.aws_accuracy_model:
        issues.append("Set the AWS accuracy model before starting a competition")
    return issues


def available(settings):
    issues = readiness_issues(settings)
    if issues:
        raise HTTPException(503, issues[0])


def build_questions(settings, day):
    """Reviewed niche library; gameplay never waits for a generation API call."""
    path = settings.questions_file
    if not path.is_absolute():
        path = ROOT / path
    questions = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(questions, list) or not questions:
        raise ValueError("Question library must be a nonempty array")
    ids = set()
    for question in questions:
        GeneratedQuestion.model_validate({k: question[k] for k in GeneratedQuestion.model_fields})
        if not isinstance(question.get("id"), str) or not question["id"] or question["id"] in ids:
            raise ValueError("Question IDs must be nonempty and unique")
        ids.add(question["id"])
    return questions


def ensure_challenge(settings, day):
    """Create the day's challenge if missing. Any AI call happens here, outside the write lock."""
    with connect(settings) as db:
        if db.execute("SELECT 1 FROM challenges WHERE day=?", (day,)).fetchone():
            return
    questions = build_questions(settings, day)
    rubric = (ROOT / "app/ai/rubrics/question_answering_v1.md").read_text(encoding="utf-8")
    with connect(settings, write=True) as db:
        db.execute(
            "INSERT OR IGNORE INTO challenges VALUES (?,?,?,?,?)",
            (day, json.dumps(questions), rubric, settings.judge_policy, settings.judge_mode),
        )


def challenge_for(db, settings, day):
    row = db.execute("SELECT * FROM challenges WHERE day=?", (day,)).fetchone()
    if not row:
        raise HTTPException(503, "The daily challenge is not ready yet")
    if row["mode"] != settings.judge_mode or row["model"] != settings.judge_policy:
        raise HTTPException(503, "Judge configuration is locked for this competition day")
    return row


def set_demo_scores(settings, enabled):
    player_ids = tuple(player_id for player_id, *_ in DEMO_SCORES)
    placeholders = ",".join("?" for _ in player_ids)
    if enabled:
        ensure_challenge(settings, day_at(time.time(), settings))
    with connect(settings, write=True) as db:
        if not enabled:
            db.execute(f"DELETE FROM scores WHERE player_id IN ({placeholders})", player_ids)
            db.execute(f"DELETE FROM attempts WHERE player_id IN ({placeholders})", player_ids)
            db.execute(f"DELETE FROM sessions WHERE player_id IN ({placeholders})", player_ids)
            db.execute(f"DELETE FROM players WHERE id IN ({placeholders})", player_ids)
            return
        day = day_at(time.time(), settings)
        now = time.time()
        challenge = challenge_for(db, settings, day)
        question = json.dumps(daily_question(json.loads(challenge["questions"]), day))
        for player_id, alias, accuracy, confidence, delivery in DEMO_SCORES:
            existing_player = db.execute(
                "SELECT id,alias FROM players WHERE alias=? OR id=?", (alias, player_id)
            ).fetchone()
            if existing_player and (
                existing_player["id"] != player_id or existing_player["alias"] != alias
            ):
                raise RuntimeError(f"Cannot seed demo account; ID or alias for {alias!r} is in use")
            db.execute(
                "INSERT OR IGNORE INTO players VALUES (?,?,?,?)",
                (player_id, alias, "00" * 16 + ":" + "00" * 32, now),
            )

            attempt_id = f"demo-attempt-{player_id}-{day}"
            score = db.execute("SELECT 1 FROM scores WHERE attempt_id=?", (attempt_id,)).fetchone()
            if score:
                continue
            attempt = db.execute("SELECT 1 FROM attempts WHERE id=?", (attempt_id,)).fetchone()
            if attempt:
                raise RuntimeError(f"Cannot seed demo score; attempt {attempt_id} already exists")
            final_score = round((accuracy + confidence + delivery) / 3)
            feedback = {
                category: "Fabricated score for the demo leaderboard."
                for category in ("accuracy", "confidence", "delivery")
            }
            db.execute(
                "INSERT INTO attempts "
                "(id,player_id,day,question,status,created,deadline) "
                "VALUES (?,?,?,?, 'completed', ?, ?)",
                (attempt_id, player_id, day, question, now, now),
            )
            db.execute(
                "INSERT INTO scores VALUES (?,?,?,?,?,?,?,?)",
                (
                    attempt_id,
                    player_id,
                    day,
                    accuracy,
                    confidence,
                    delivery,
                    final_score,
                    json.dumps(feedback),
                ),
            )


def has_seeded_demo_scores(db, day):
    player_ids = tuple(player_id for player_id, *_ in DEMO_SCORES)
    placeholders = ",".join("?" for _ in player_ids)
    return (
        db.execute(
            f"SELECT 1 FROM scores WHERE day=? AND player_id IN ({placeholders}) LIMIT 1",
            (day, *player_ids),
        ).fetchone()
        is not None
    )


def daily_question(questions, day):
    """One deterministic prompt per day, shared by every player (Wordle-style)."""
    index = int(hashlib.sha256(day.encode()).hexdigest(), 16) % len(questions)
    return questions[index]


def insert_attempt(db, settings, player_id, day, challenge, previous=None):
    # Every attempt that day uses the same rotating prompt, including replacements.
    question = daily_question(json.loads(challenge["questions"]), day)
    now = time.time()
    aid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO attempts (id,player_id,day,question,status,created,deadline,replacement_of) "
        "VALUES (?,?,?,?,'recording',?,?,?)",
        (
            aid,
            player_id,
            day,
            json.dumps(question),
            now,
            now + settings.recording_seconds + settings.upload_grace_seconds,
            previous,
        ),
    )
    return public(db, owned(db, aid, player_id))


def _current_attempt(db, player_id, day):
    return db.execute(
        "SELECT * FROM attempts WHERE player_id=? AND day=? AND status!='replaced'",
        (player_id, day),
    ).fetchone()


def start(settings, player_id, day=None):
    # `day` override is only passed by the day-switcher; normal play uses today.
    day = day or day_at(time.time(), settings)
    # Return an existing attempt without any AI work (so it can be viewed even if AI is down).
    with connect(settings) as db:
        row = _current_attempt(db, player_id, day)
        if row and not (row["status"] == "recording" and time.time() > row["deadline"]):
            return public(db, row)
    if row:
        # The worker may not have swept yet; never hand back a recording that cannot upload.
        with connect(settings, write=True) as db:
            db.execute(
                "UPDATE attempts SET status='expired',failure='Recording was not submitted' "
                "WHERE id=? AND status='recording'",
                (row["id"],),
            )
            return public(db, owned(db, row["id"], player_id))
    available(settings)
    # Generate + store the day's prompt here, outside the write transaction below.
    ensure_challenge(settings, day)
    with connect(settings, write=True) as db:
        row = _current_attempt(db, player_id, day)  # re-check: another request may have won
        if row:
            return public(db, row)
        usage = db.execute("SELECT jobs FROM daily_usage WHERE day=?", (day,)).fetchone()
        if usage and usage["jobs"] >= settings.max_daily_jobs:
            raise HTTPException(503, "Today's judging capacity is exhausted")
        challenge = challenge_for(db, settings, day)
        return insert_attempt(db, settings, player_id, day, challenge)


def replace(settings, player_id, attempt_id):
    with connect(settings, write=True) as db:
        row = owned(db, attempt_id, player_id)
        existing = db.execute(
            "SELECT * FROM attempts WHERE replacement_of=?", (attempt_id,)
        ).fetchone()
        if existing:
            return public(db, existing)
        if row["status"] != "upload_failed":
            raise HTTPException(409, "Only a confirmed upload failure permits a new question")
        count = db.execute(
            "SELECT count(*) FROM attempts WHERE player_id=? AND day=?", (player_id, row["day"])
        ).fetchone()[0]
        if count > settings.max_replacements:
            raise HTTPException(409, "Daily replacement limit reached")
        if time.time() > row["deadline"] + settings.upload_grace_seconds:
            raise HTTPException(409, "Replacement window has expired")
        available(settings)
        challenge = challenge_for(db, settings, row["day"])
        db.execute("UPDATE attempts SET status='replaced' WHERE id=?", (attempt_id,))
        return insert_attempt(db, settings, player_id, row["day"], challenge, attempt_id)


def fail_upload(settings, attempt_id, message):
    with connect(settings, write=True) as db:
        db.execute(
            "UPDATE attempts SET status='upload_failed',failure=? WHERE id=? AND status='uploading'",
            (message, attempt_id),
        )
