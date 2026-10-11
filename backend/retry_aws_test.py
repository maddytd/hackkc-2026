"""Requeue one retained failed attempt in the isolated AWS test database."""

import json
import sqlite3
import time
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    database = root / "storage-aws-test" / "game.db"
    with sqlite3.connect(database.as_uri() + "?mode=rw", uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT a.id,a.media_path,a.created,c.model FROM attempts a "
            "JOIN challenges c ON c.day=a.day WHERE a.status='judge_failed' "
            "AND a.media_path IS NOT NULL AND c.mode='aws' ORDER BY a.created DESC LIMIT 1"
        ).fetchone()
        if row is None:
            print("No retained failed AWS test attempt was found.")
            return
        path = Path(row["media_path"])
        if not path.is_absolute():
            path = root / path
        if not path.is_file() or row["created"] < time.time() - 86400:
            print("The recording is missing or its retention window expired.")
            return
        used = db.execute(
            "SELECT count(*) FROM ai_calls WHERE attempt_id=?", (row["id"],)
        ).fetchone()[0]
        cached = db.execute(
            "SELECT 1 FROM ai_stage_results WHERE attempt_id=? AND stage='performance'",
            (row["id"],),
        ).fetchone()
        budget = json.loads(row["model"])["max_calls"]
        if budget - used < (1 if cached else 2):
            print("The remaining model-call budget is insufficient; it has not been reset.")
            return
        db.execute(
            "UPDATE attempts SET status='queued',tries=0,failure=NULL,next_run=0,"
            "lease=NULL,lease_until=NULL WHERE id=? AND status='judge_failed'",
            (row["id"],),
        )
        print("Test attempt queued. Remaining model calls:", budget - used)
        print("The worker will retry the saved recording. Existing call history is preserved.")


if __name__ == "__main__":
    main()
