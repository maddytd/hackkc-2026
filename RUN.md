# Running Larple locally (demo mode)

This runs the whole game on your machine with **no Gemini key** — judging returns a fixed
demo score. You run three things: the **API**, the **worker**, and the **frontend**.

## 1. Install prerequisites (once)

- **Node.js** 18+ — https://nodejs.org
- **Python** 3.11+ — https://python.org
- **ffmpeg** (gives `ffprobe`, needed to validate recordings):
  - macOS: `brew install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg` then **restart the terminal**
  - Linux (Debian/Ubuntu): `sudo apt install ffmpeg`
- Check: `node -v`, `python --version` (or `py --version` on Windows), `ffprobe -version`

## 2. Get the code

```sh
git clone https://github.com/maddytd/hackkc-2026.git
cd hackkc-2026
```

If this isn't merged to `main` yet, also run: `git checkout frontend`

## 3. Open in VS Code with split terminals

```sh
code .
```

Then open the terminal (`` Ctrl+` ``) and **split it twice** (the ⟱ "split" icon, or
`Ctrl+Shift+5`) so you have **three** terminals side by side — one each for API, worker,
and frontend. If VS Code asks for a Python interpreter, pick the `backend/.venv` one.

## 4. Backend — set up once

In **terminal 1**, from the repo root:

```sh
cd backend
python -m venv .venv          # Windows: py -m venv .venv
```

Activate the venv (same terminal):

- macOS/Linux: `source .venv/bin/activate`
- Windows PowerShell: `.\.venv\Scripts\Activate.ps1`
- Windows cmd: `.venv\Scripts\activate.bat`

Install deps and create the env file:

```sh
pip install -c requirements.lock -e ".[dev]"
cp .env.example .env          # Windows: copy .env.example .env
```

Edit `backend/.env` so it uses demo mode and open registration:

```
LARP_STORAGE_DIR=storage
LARP_CORS_ORIGINS=["http://localhost:5173"]
LARP_JUDGE_MODE=demo
LARP_INVITE_CODE=
LARP_MAX_UPLOAD_BYTES=12582912
```

> Leave `LARP_INVITE_CODE` **blank** — if it's set, registration will require that code
> and the sign-up screen (which no longer asks for one) will fail.

## 5. Run the three processes

**Terminal 1 — API** (venv activated, in `backend/`):

```sh
uvicorn app.main:app --port 8000
```

**Terminal 2 — worker** (activate the venv here too, in `backend/`):

```sh
# activate venv as in step 4, then:
python -m app.worker
```

**Terminal 3 — frontend** (from the repo root):

```sh
cd frontend
npm install
```

Create `frontend/.env.local` pointing at the API:

```
VITE_API_URL=http://localhost:8000
```

Then start it:

```sh
npm run dev
```

## 6. Play

Open **http://localhost:5173**, register an alias, allow camera + mic, and play.
Because it's demo mode, you'll see the day switcher and a fixed demo score.

## Notes

- Both the **API and the worker must be running** — the worker is what scores recordings.
- `localhost` is a secure context, so the webcam works without HTTPS.
- To stop a process: `Ctrl+C` in its terminal.
- To start fresh (wipe accounts/scores): delete `backend/storage/game.db*` and restart the API.
- For **real AI scoring**, set `LARP_JUDGE_MODE=gemini` + `LARP_GEMINI_API_KEY` in `backend/.env`,
  use a video-capable model, and delete `backend/storage/game.db*` first (the day's judging
  mode is locked once its first attempt is created).
