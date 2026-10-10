"""Run separately: python -m app.worker. SQLite leases allow crash recovery."""

import json
import logging
import time
import uuid
from pathlib import Path

from app.ai.client import judge
from app.config import Settings
from app.database import connect, initialize
from app.services.scoring import score

log = logging.getLogger(__name__)


def cleanup(settings):
    now = time.time()
    with connect(settings, write=True) as db:
        db.execute(
            "UPDATE attempts SET status='expired',failure='Recording was not submitted' "
            "WHERE status='recording' AND deadline<?",
            (now,),
        )
        db.execute(
            "UPDATE attempts SET status='upload_failed',failure='Upload was interrupted' "
            "WHERE status='uploading' AND deadline+20<?",
            (now,),
        )
        db.execute(
            "UPDATE attempts SET status='judge_failed',failure='Recording retention expired' "
            "WHERE status IN ('queued','processing') AND created<?",
            (now - 86400,),
        )
        rows = db.execute(
            "SELECT id,media_path FROM attempts WHERE media_path IS NOT NULL "
            "AND (status='completed' OR created<?)",
            (now - 86400,),
        ).fetchall()
        for row in rows:
            Path(row["media_path"]).unlink(missing_ok=True)
            db.execute("UPDATE attempts SET media_path=NULL WHERE id=?", (row["id"],))
    # Remove abandoned partial files, including crashes before a DB path was saved.
    for path in settings.media_dir.iterdir():
        if path.is_file() and path.stat().st_mtime < now - 86400:
            path.unlink(missing_ok=True)


def run_once(settings, judge_fn=judge):
    cleanup(settings)
    now = time.time()
    lease = str(uuid.uuid4())
    with connect(settings, write=True) as db:
        db.execute(
            "UPDATE attempts SET status='judge_failed',failure='Judging retries exhausted' "
            "WHERE status='processing' AND lease_until<? AND tries>=?",
            (now, settings.max_judge_tries),
        )
        # One active judge per SQLite deployment, even if two workers start accidentally.
        if db.execute(
            "SELECT 1 FROM attempts WHERE status='processing' AND lease_until>?", (now,)
        ).fetchone():
            return False
        row = db.execute(
            "SELECT * FROM attempts WHERE "
            "(status='queued' AND next_run<=?) OR "
            "(status='processing' AND lease_until<? AND tries<?) ORDER BY created LIMIT 1",
            (now, now, settings.max_judge_tries),
        ).fetchone()
        if not row:
            return False
        challenge = dict(
            db.execute("SELECT * FROM challenges WHERE day=?", (row["day"],)).fetchone()
        )
        if challenge["mode"] == "gemini" and not settings.gemini_api_key:
            return False
        # Each accepted job reserves up to max_judge_tries API calls through a bounded retry count.
        db.execute(
            "UPDATE attempts SET status='processing',lease=?,lease_until=?,tries=tries+1 WHERE id=?",
            (lease, now + 300, row["id"]),
        )
        attempt = dict(row)
    try:
        result = score(judge_fn(settings, attempt, challenge))
        with connect(settings, write=True) as db:
            current = db.execute(
                "SELECT * FROM attempts WHERE id=? AND status='processing' AND lease=?",
                (attempt["id"], lease),
            ).fetchone()
            if current:
                db.execute(
                    "INSERT INTO scores VALUES (?,?,?,?,?,?,?,?)",
                    (
                        attempt["id"],
                        attempt["player_id"],
                        attempt["day"],
                        result["accuracy"],
                        result["confidence"],
                        result["delivery"],
                        result["final_score"],
                        json.dumps(result["feedback"]),
                    ),
                )
                db.execute(
                    "UPDATE attempts SET status='completed',failure=NULL,lease=NULL WHERE id=?",
                    (attempt["id"],),
                )
        cleanup(settings)
    except Exception as exc:  # noqa: BLE001 -- persist failures at the job boundary
        # Do not log provider responses, keys, video data, or user content.
        log.warning("Judging failed for %s (%s)", attempt["id"], type(exc).__name__)
        with connect(settings, write=True) as db:
            current = db.execute(
                "SELECT * FROM attempts WHERE id=? AND status='processing' AND lease=?",
                (attempt["id"], lease),
            ).fetchone()
            if current:
                status = (
                    "judge_failed" if current["tries"] >= settings.max_judge_tries else "queued"
                )
                db.execute(
                    "UPDATE attempts SET status=?,failure=?,next_run=?,lease=NULL WHERE id=?",
                    (
                        status,
                        "AI evaluation failed; retrying the same recording"
                        if status == "queued"
                        else "AI evaluation failed after bounded retries",
                        now + 2 ** current["tries"],
                        attempt["id"],
                    ),
                )
    return True


def main():
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    initialize(settings)
    log.info("Worker started in %s mode", settings.judge_mode)
    while True:
        if not run_once(settings):
            time.sleep(1)


if __name__ == "__main__":
    main()
