import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import connect


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    value = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000)
    return f"{salt}:{value.hex()}"


def rate_limit(settings, key, limit, window=60):
    now = time.time()
    with connect(settings, write=True) as db:
        db.execute("DELETE FROM rate_limits WHERE start < ?", (now - 3600,))
        row = db.execute("SELECT * FROM rate_limits WHERE key=?", (key,)).fetchone()
        if row and now - row["start"] < window:
            if row["count"] >= limit:
                raise HTTPException(429, "Too many requests. Try again later.")
            db.execute("UPDATE rate_limits SET count=count+1 WHERE key=?", (key,))
        else:
            db.execute("INSERT OR REPLACE INTO rate_limits VALUES (?,?,1)", (key, now))


bearer = HTTPBearer(auto_error=False)


def authenticate(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer ") or len(header) > 256:
        raise HTTPException(401, "A bearer session token is required")
    with connect(request.app.state.settings) as db:
        player = db.execute(
            "SELECT p.* FROM players p JOIN sessions s ON s.player_id=p.id "
            "WHERE s.token_hash=? AND s.expires>?",
            (digest(header[7:]), time.time()),
        ).fetchone()
    if not player:
        raise HTTPException(401, "Session is invalid or expired")
    return dict(player)


def create_session(settings, credentials, register=False):
    now = time.time()
    if (
        register
        and settings.invite_code
        and not hmac.compare_digest(credentials.invite_code, settings.invite_code)
    ):
        raise HTTPException(403, "Invalid invite code")
    # Expensive password hashing must happen outside the SQLite write transaction.
    if register:
        hashed = password_hash(credentials.password)
        player_id = str(uuid.uuid4())
        try:
            with connect(settings, write=True) as db:
                db.execute(
                    "INSERT INTO players VALUES (?,?,?,?)",
                    (player_id, credentials.alias, hashed, now),
                )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Alias is already registered") from None
    else:
        with connect(settings) as db:
            row = db.execute("SELECT * FROM players WHERE alias=?", (credentials.alias,)).fetchone()
        salt = row["password_hash"].split(":")[0] if row else "00" * 16
        hashed = password_hash(credentials.password, salt)
        if not row or not hmac.compare_digest(hashed, row["password_hash"]):
            raise HTTPException(401, "Invalid alias or password")
        player_id = row["id"]
    token = secrets.token_urlsafe(32)
    with connect(settings, write=True) as db:
        db.execute("DELETE FROM sessions WHERE expires<=?", (now,))
        db.execute(
            "INSERT INTO sessions VALUES (?,?,?)", (digest(token), player_id, now + 86400 * 7)
        )
    return {
        "access_token": token,
        "token_type": "bearer",
        "player_id": player_id,
        "alias": credentials.alias,
        "expires_at": now + 86400 * 7,
    }
