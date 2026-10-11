import sqlite3
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
 id TEXT PRIMARY KEY, alias TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), expires REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
 day TEXT PRIMARY KEY, questions TEXT NOT NULL, rubric TEXT NOT NULL,
 model TEXT NOT NULL, mode TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
 id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
 day TEXT NOT NULL REFERENCES challenges(day), question TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN
 ('recording','uploading','upload_failed','replaced','expired','queued','processing','completed','judge_failed')),
 created REAL NOT NULL, deadline REAL NOT NULL, replacement_of TEXT UNIQUE REFERENCES attempts(id),
 media_path TEXT, mime TEXT, failure TEXT, tries INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until REAL, next_run REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_attempt ON attempts(player_id,day)
 WHERE status != 'replaced';
CREATE TABLE IF NOT EXISTS scores (
 attempt_id TEXT PRIMARY KEY REFERENCES attempts(id), player_id TEXT NOT NULL REFERENCES players(id),
 day TEXT NOT NULL, accuracy INTEGER NOT NULL CHECK(accuracy BETWEEN 0 AND 5000),
 confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 5000),
 delivery INTEGER NOT NULL CHECK(delivery BETWEEN 0 AND 5000),
 final_score INTEGER NOT NULL CHECK(final_score BETWEEN 0 AND 5000), feedback TEXT NOT NULL,
 UNIQUE(player_id,day)
);
CREATE TABLE IF NOT EXISTS daily_usage (day TEXT PRIMARY KEY, jobs INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, start REAL NOT NULL, count INTEGER NOT NULL);
PRAGMA user_version=1;
"""

MIGRATION_2 = """
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS ai_calls (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id),
 stage TEXT NOT NULL, model TEXT NOT NULL, region TEXT NOT NULL,
 created REAL NOT NULL, status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_calls_attempt ON ai_calls(attempt_id);
CREATE TABLE IF NOT EXISTS ai_stage_results (
 attempt_id TEXT NOT NULL REFERENCES attempts(id), stage TEXT NOT NULL,
 model TEXT NOT NULL, region TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(attempt_id,stage)
);
CREATE TABLE IF NOT EXISTS provider_cooldowns (
 endpoint TEXT PRIMARY KEY, until REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS judgment_provenance (
 attempt_id TEXT PRIMARY KEY REFERENCES attempts(id), metadata TEXT NOT NULL
);
PRAGMA user_version=2;
COMMIT;
"""


@contextmanager
def connect(settings, write=False):
    conn = sqlite3.connect(settings.db_path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        if write:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        if write:
            conn.commit()
    except BaseException:
        if write:
            conn.rollback()
        raise
    finally:
        conn.close()


def initialize(settings):
    settings.media_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with connect(settings) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1, 2):
            raise RuntimeError("Unsupported database version")
        if version == 0:
            conn.executescript(SCHEMA)
        if version < 2:
            conn.executescript(MIGRATION_2)
