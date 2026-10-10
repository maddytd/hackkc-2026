# Larple backend

FastAPI + SQLite backend for the daily question-answering game, with a Strands Agents judge using the Gemini model provider. Scores combine accuracy, performed confidence, and delivery equally. Python 3.11+ and FFmpeg (`ffprobe` on PATH) are required.

## Run locally

From `backend/`:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -c requirements.lock -e '.[dev]'
cp .env.example .env
```

Install FFmpeg with `brew install ffmpeg` on macOS or your operating system's package manager. The backend reads `backend/.env` regardless of the process working directory. Set `LARP_GEMINI_API_KEY` there, select a video-capable `LARP_GEMINI_MODEL` available to your account, and change `LARP_INVITE_CODE` before inviting players.

Start the API:

```sh
uvicorn app.main:app --reload --port 8000
```

In another terminal, from `backend/` with the same environment:

```sh
source .venv/bin/activate
python -m app.worker
```

Interactive API documentation: http://localhost:8000/docs

For development without an AI key, set `LARP_JUDGE_MODE=demo` in `.env`. Demo judging always returns 3,000 points and explicitly marks responses and leaderboards as demo. It still validates real media. Use a separate `LARP_STORAGE_DIR` for demo and real competitions: daily model, mode, questions, and rubric are immutable once that day's first attempt starts.

## API integration

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an alias/password account; requires configured invite code. |
| POST | `/auth/login` | Obtain a seven-day bearer session. |
| DELETE | `/auth/session` | Revoke the current session. |
| GET | `/me` | Get the signed-in player's ID and alias. |
| POST | `/attempts` | Start or recover today's attempt; requires processing consent. |
| GET | `/attempts/current` | Get today's attempt, or `null`. |
| GET | `/attempts/{id}` | Recover an owned attempt, including an earlier day's pending result. |
| PUT | `/attempts/{id}/video` | Upload the raw recording bytes. |
| POST | `/attempts/{id}/replacement` | Replace a confirmed failed upload with a different question. |
| GET | `/leaderboard?day=2026-10-10&limit=50&offset=0` | Public UTC daily rankings. |
| GET | `/health` | Process health and configured judging mode. |

Registration/login JSON:

```json
{"alias":"player_one","password":"a-long-unique-password","invite_code":"your-event-code"}
```

Send `Authorization: Bearer <access_token>` for all player endpoints. Passwords are salted PBKDF2 hashes; only hashes of session tokens are stored. Session tokens grant account access: keep them out of logs and URLs. There is no password recovery in this MVP.

Start request:

```json
{"consent_to_ai_processing":true}
```

Before asking for consent, explain that the video is sent to Google for AI judging. Only reveal the returned question once recording is ready. `created` and `deadline` are Unix timestamps in seconds; the recording window is 30 seconds, with another 120 seconds to upload. The server allows one second of media encoding tolerance.

Upload a browser Blob directly, **not** FormData:

```javascript
const response = await fetch(`${apiUrl}/attempts/${attempt.id}/video`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": blob.type.split(";")[0],
  },
  body: blob,
});
```

WebM and MP4 are supported, up to 12 MiB. Container, audio/video tracks, and duration are inspected by ffprobe; supplied filenames are never used. Media is private and never served as static content.

Poll the attempt endpoint approximately every two seconds while `queued` or `processing`. Render each score category and its feedback, not just the final score. Treat feedback as plain text. `failure` contains a safe player-facing message; provider error details are not returned.

## Attempt rules and recovery

- The first reveal fixes the UTC competition day. A valid submission crossing midnight remains on that original day.
- A completed score, abandoned attempt, or exhausted failure does not reset on refresh. `POST /attempts` returns the existing attempt for that day.
- Failed, empty, invalid, or oversized uploads become `upload_failed`. Request a replacement within 120 seconds after the old upload deadline. Each of up to three replacements uses an unseen question from the same daily pool.
- A network failure before any upload reaches the server cannot be distinguished from abandonment. Retry sending the same recording before its deadline. An observed interrupted upload permits replacement; an abandoned unsubmitted attempt expires.
- A lost upload acknowledgment must be recovered by polling. Upload retries after successful receipt return the existing status and never schedule a second job.
- Requests for a replacement while an upload is active return 409. If a server crashes mid-upload, the worker marks it failed after its deadline plus a 20-second validation allowance.
- The worker claims jobs using a five-minute lease, persists retries, and recovers expired leases. Only one judging job runs at a time per database. API failures retry the same recording up to three times with backoff. Exhausted retries become `judge_failed`, with no invented score or new question.
- Scores and completion status commit in one transaction; unique constraints prevent a second daily score. Equal scores share competition rank (1, 1, 3).
- Application-held media is deleted after completion, or after 24 hours otherwise. Run the worker continuously for cleanup and recovery.

## AI and cost controls

The judge is a fresh Strands `Agent` for each submission, using `GeminiModel` with the competition day’s saved model and rubric. Gemini is selected explicitly, so AWS credentials and Amazon Bedrock are not required. The agent has no external tools, shared conversation memory, or stdout callback. Its native structured-output call returns the existing `Judgment` schema. A small `VideoGeminiModel` subclass maps MP4/WebM content to Gemini video bytes because some Strands releases omit video handling in the provider; it preserves the video audio track. The adapter also uses Gemini’s `response_json_schema` field so the strict Pydantic schema is accepted without dropping validation rules.

Gemini receives the complete short video, including audio, plus the private question criteria. Its structured response is validated as integer ratings from 0 through 10. The server converts ratings to points and calculates the average. Provider retries are disabled so the persistent worker owns the retry budget; the entire agent call has a 100-second deadline, shorter than the worker lease. Rubric text explicitly treats video content as untrusted and separates accuracy from confidence; this reduces but does not eliminate judge manipulation.

`LARP_MAX_DAILY_JOBS` caps accepted jobs by UTC upload date. With three maximum judge tries, each accepted job can make at most three provider calls, including attempts interrupted by worker crashes. This is a usage cap, **not a dollar-denominated billing limit**; also set provider-side quotas/budget alerts. Existing jobs can be processed on later days. New starts are blocked when today's accepted-job cap is reached, although competing uploads may fill capacity after a prompt was revealed.

The sample pool uses six comparable interview/opinion questions with explicit evaluation criteria. Add verified reference answers for factual questions. Changes to content or the rubric take effect on the next competition day.

Agent and provider documentation:

- [Strands Python quickstart](https://strandsagents.com/docs/user-guide/sdk/quickstart/python/)
- [Strands Gemini provider](https://strandsagents.com/docs/user-guide/sdk/model-providers/google/)

- [Video inputs](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding)
- [Structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

The agent adapter is tested with simulated responses, including its video inputs, private rubric, retry configuration, and failure propagation. A live model evaluation needs your key and a representative browser clip; no paid API call is made by the test suite. Video sampling and model behavior may miss subtle gestures. Confirm model availability, costs, and Google's retention policy before using participant recordings.

## Deploy

From the repository root:

```sh
docker compose up --build
```

Set values in `backend/.env` first. This file is gitignored and excluded from Docker image builds; Compose injects its values at runtime. Commit only the blank `.env.example`, never a populated `.env`. API and worker share the same persistent volume and configuration. Put the API behind HTTPS and set `LARP_CORS_ORIGINS` to the actual frontend origin. The supplied container is a single-host deployment; do not share SQLite over a network filesystem. Readiness for gameplay additionally requires a running worker, ffprobe, a working provider key, and available provider quota; `/health` alone is only process liveness.

An invite code limits open registration but does not establish one human per account. Use event registration or a verified identity provider before treating the leaderboard as cheat-resistant. The API rate-limits authentication and state-changing operations; add reverse-proxy body size, connection, and public read limits when exposed to the internet. Trust forwarded IP headers only from your own proxy.

## Tests

```sh
pytest -q
ruff check app tests
ruff format --check app tests
```

Tests cover daily limits, concurrent starts, authentication, ownership, replacements, duplicate uploads, midnight rollover, stable rankings, worker recovery, bounded retries, retention, score validation, and the provider request contract. Media integration tests use locally generated clips when FFmpeg is installed.

Schema version 1 initializes automatically. Future schema changes must introduce explicit migrations rather than changing existing tables in place.
