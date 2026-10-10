import json
import secrets
import shutil
import time
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException

from app.config import ROOT
from app.database import connect


def day_at(now):
    return datetime.fromtimestamp(now, UTC).date().isoformat()


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


def available(settings):
    if not shutil.which(settings.ffprobe):
        raise HTTPException(503, "Recording validation is unavailable; install ffprobe")
    if settings.judge_mode == "gemini" and not settings.gemini_api_key:
        raise HTTPException(503, "AI judging has not been configured")


def challenge_for(db, settings, day):
    row = db.execute("SELECT * FROM challenges WHERE day=?", (day,)).fetchone()
    if not row:
        questions = json.loads((ROOT / "content/questions.json").read_text(encoding="utf-8"))
        if len({q["id"] for q in questions}) < settings.max_replacements + 1:
            raise HTTPException(503, "Question pool is too small")
        rubric = (ROOT / "app/ai/rubrics/question_answering_v1.md").read_text(encoding="utf-8")
        db.execute(
            "INSERT INTO challenges VALUES (?,?,?,?,?)",
            (day, json.dumps(questions), rubric, settings.gemini_model, settings.judge_mode),
        )
        row = db.execute("SELECT * FROM challenges WHERE day=?", (day,)).fetchone()
    if row["mode"] != settings.judge_mode or row["model"] != settings.gemini_model:
        raise HTTPException(503, "Judge configuration is locked for this competition day")
    return row


def insert_attempt(db, settings, player_id, day, challenge, previous=None):
    used = {
        json.loads(r["question"])["id"]
        for r in db.execute(
            "SELECT question FROM attempts WHERE player_id=? AND day=?", (player_id, day)
        )
    }
    choices = [q for q in json.loads(challenge["questions"]) if q["id"] not in used]
    if not choices:
        raise HTTPException(409, "No replacement questions remain")
    now = time.time()
    aid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO attempts (id,player_id,day,question,status,created,deadline,replacement_of) "
        "VALUES (?,?,?,?,'recording',?,?,?)",
        (
            aid,
            player_id,
            day,
            json.dumps(secrets.choice(choices)),
            now,
            now + settings.recording_seconds + settings.upload_grace_seconds,
            previous,
        ),
    )
    return public(db, owned(db, aid, player_id))


def start(settings, player_id):
    now = time.time()
    day = day_at(now)
    with connect(settings, write=True) as db:
        row = db.execute(
            "SELECT * FROM attempts WHERE player_id=? AND day=? AND status!='replaced'",
            (player_id, day),
        ).fetchone()
        if row:
            return public(db, row)
        available(settings)
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
