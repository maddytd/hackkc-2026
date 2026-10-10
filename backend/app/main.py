import asyncio
import time
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.auth import authenticate, create_session, digest, rate_limit
from app.config import Settings
from app.database import connect, initialize
from app.schemas import Credentials, StartAttempt
from app.services import attempts
from app.services.media import InvalidMedia, validate_media


def create_app(settings=None):
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        initialize(settings)
        yield

    app = FastAPI(title="Larple API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.validate_media = validate_media
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok", "judge_mode": settings.judge_mode}

    def auth_limit(request):
        ip = request.client.host if request.client else "unknown"
        rate_limit(settings, "auth:" + ip, 10)

    @app.post("/auth/register", status_code=201)
    def register(body: Credentials, request: Request):
        auth_limit(request)
        return create_session(settings, body, register=True)

    @app.post("/auth/login")
    def login(body: Credentials, request: Request):
        auth_limit(request)
        return create_session(settings, body)

    @app.delete("/auth/session", status_code=204)
    def logout(request: Request, player: Annotated[dict, Depends(authenticate)]):
        with connect(settings, write=True) as db:
            db.execute(
                "DELETE FROM sessions WHERE token_hash=?",
                (digest(request.headers["authorization"][7:]),),
            )

    @app.get("/me")
    def me(player: Annotated[dict, Depends(authenticate)]):
        return {"id": player["id"], "alias": player["alias"]}

    @app.post("/attempts")
    def start(body: StartAttempt, player: Annotated[dict, Depends(authenticate)]):
        rate_limit(settings, "start:" + player["id"], 10)
        if not body.consent_to_ai_processing:
            raise HTTPException(400, "Consent to external AI processing is required")
        return attempts.start(settings, player["id"])

    @app.get("/attempts/current")
    def current(player: Annotated[dict, Depends(authenticate)]):
        with connect(settings) as db:
            row = db.execute(
                "SELECT * FROM attempts WHERE player_id=? AND day=? AND status!='replaced'",
                (player["id"], attempts.day_at(time.time())),
            ).fetchone()
            return attempts.public(db, row) if row else None

    @app.get("/attempts/{attempt_id}")
    def status(attempt_id: str, player: Annotated[dict, Depends(authenticate)]):
        with connect(settings) as db:
            return attempts.public(db, attempts.owned(db, attempt_id, player["id"]))

    @app.post("/attempts/{attempt_id}/replacement")
    def replacement(attempt_id: str, player: Annotated[dict, Depends(authenticate)]):
        rate_limit(settings, "replacement:" + player["id"], 6)
        return attempts.replace(settings, player["id"], attempt_id)

    @app.put(
        "/attempts/{attempt_id}/video",
        status_code=202,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    "video/webm": {"schema": {"type": "string", "format": "binary"}},
                    "video/mp4": {"schema": {"type": "string", "format": "binary"}},
                },
            }
        },
    )
    async def upload(
        attempt_id: str, request: Request, player: Annotated[dict, Depends(authenticate)]
    ):
        """Send the video Blob as the raw request body, not multipart/form-data."""
        await run_in_threadpool(rate_limit, settings, "upload:" + player["id"], 10)
        now = time.time()
        with connect(settings, write=True) as db:
            row = attempts.owned(db, attempt_id, player["id"])
            if row["status"] in ("queued", "processing", "completed", "judge_failed"):
                return attempts.public(db, row)
            if row["status"] != "recording":
                raise HTTPException(409, "This attempt cannot accept another upload")
            if now > row["deadline"]:
                raise HTTPException(409, "Upload deadline expired")
            db.execute("UPDATE attempts SET status='uploading' WHERE id=?", (attempt_id,))
        path = settings.media_dir / (attempt_id + ".upload")
        try:
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
            if content_type not in ("video/webm", "video/mp4"):
                raise HTTPException(415, "Send a WebM or MP4 video as the raw request body")
            total = 0
            async with asyncio.timeout(max(0.01, row["deadline"] - time.time())):
                with path.open("xb") as stream:
                    async for chunk in request.stream():
                        total += len(chunk)
                        if total > settings.max_upload_bytes:
                            raise HTTPException(413, "Recording exceeds the upload size limit")
                        await run_in_threadpool(stream.write, chunk)
            if not total:
                raise InvalidMedia("Recording is empty")
            mime = await run_in_threadpool(app.state.validate_media, path, settings)
            if mime != content_type:
                raise InvalidMedia("Declared video type does not match the actual container")
            with connect(settings, write=True) as db:
                current_row = attempts.owned(db, attempt_id, player["id"])
                if current_row["status"] != "uploading":
                    raise HTTPException(409, "Upload is no longer active")
                # Reserve a job only after a valid upload; failed requests do not spend quota.
                today = attempts.day_at(time.time())
                db.execute("INSERT OR IGNORE INTO daily_usage VALUES (?,0)", (today,))
                usage = db.execute("SELECT jobs FROM daily_usage WHERE day=?", (today,)).fetchone()[
                    0
                ]
                if usage >= settings.max_daily_jobs:
                    raise HTTPException(503, "Today's judging capacity is exhausted")
                db.execute("UPDATE daily_usage SET jobs=jobs+1 WHERE day=?", (today,))
                db.execute(
                    "UPDATE attempts SET status='queued',media_path=?,mime=?,failure=NULL WHERE id=?",
                    (str(path.resolve()), mime, attempt_id),
                )
                return attempts.public(db, attempts.owned(db, attempt_id, player["id"]))
        except (HTTPException, InvalidMedia, TimeoutError, ClientDisconnect) as exc:
            path.unlink(missing_ok=True)
            message = (
                exc.detail if isinstance(exc, HTTPException) else str(exc) or "Upload interrupted"
            )
            await run_in_threadpool(attempts.fail_upload, settings, attempt_id, message)
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(422, message) from None
        except Exception:  # noqa: BLE001 -- convert storage failures to a safe API error
            path.unlink(missing_ok=True)
            await run_in_threadpool(attempts.fail_upload, settings, attempt_id, "Upload failed")
            raise HTTPException(500, "Unable to store recording") from None

    @app.get("/leaderboard")
    def leaderboard(day: date | None = None, limit: int = 50, offset: int = 0):
        if not 1 <= limit <= 100 or not 0 <= offset <= 10000:
            raise HTTPException(422, "Invalid pagination")
        selected = day.isoformat() if day else attempts.day_at(time.time())
        with connect(settings) as db:
            rows = db.execute(
                "SELECT * FROM (SELECT p.alias,s.final_score,s.accuracy,s.confidence,s.delivery,"
                "RANK() OVER (ORDER BY s.final_score DESC) AS rank "
                "FROM scores s JOIN players p ON p.id=s.player_id WHERE s.day=?) "
                "ORDER BY rank,alias LIMIT ? OFFSET ?",
                (selected, limit, offset),
            ).fetchall()
            challenge = db.execute(
                "SELECT mode FROM challenges WHERE day=?", (selected,)
            ).fetchone()
        return {
            "day": selected,
            "timezone": "UTC",
            "demo": bool(challenge and challenge[0] == "demo"),
            "entries": [dict(row) for row in rows],
        }

    return app


app = create_app()
