# AGENTS.md — Larple (hackkc-2026)

Guide for coding agents (Codex, Claude, etc.) working in this repo. Read this before changing anything.

## What this is
Larple ("does he know?") is a daily video game: everyone gets the same question, records a 30-second answer on camera, and an AI judge (default: AWS Strands — Pegasus for confidence/delivery, Nova/Claude for accuracy; Gemini and demo modes also exist) scores **accuracy, confidence and delivery** (0–5,000 each; final score is their average). Convincing bluffs can still score. Scores go on a daily leaderboard.

- `frontend/` — React 19 + Vite + TypeScript, plain CSS (`src/styles.css`). Owned by Anthony.
- `backend/` — FastAPI API + background AI worker, SQLite. Owned by Maddy. See `backend/README.md`.
- `docs/` — game design and (older, planned) file structure. `RUN.md` — full local setup.

## Ground rules
- **Frontend changes only, unless explicitly asked.** Don't modify `backend/`.
- **Don't change the recording pipeline** unless asked: `src/hooks/useRecorder.ts`, `src/hooks/useWebcam.ts`, `src/lib/recordingStore.ts`, and the record/upload/poll logic in `src/pages/PlayPage.tsx`. Visual additions around them are fine (e.g. `BlurredFeed` reuses the same stream for display only).
- The API calls the username `alias`; the UI always says **username**.
- Work on a branch (currently `ui/cinematic-menu`), open a PR into `main`, merge with a merge commit.

## Run and check
```sh
cd frontend && npm install
npm run dev        # Vite; set VITE_API_URL in .env.local to use a real backend
npm run build      # tsc -b + vite build — must pass
npm run lint       # oxlint — 0 errors (2 existing set-state-in-effect warnings are known)
```
- With `VITE_API_URL` **unset**, the app runs on built-in mock data (`src/lib/api.ts`): fake questions, a fixed 3,500 score, and a sample leaderboard. Good for UI work with no backend.
- Full stack locally: follow `RUN.md` (API + worker + frontend; demo judging needs no Gemini key). The backend's default CORS allows `http://localhost:5173`.

## Frontend map (`frontend/src`)
- `App.tsx` — screen state machine: `start` → `auth` → `play` → `results`, plus `leaderboard`. Wrap screen changes in `smoothly()` (`lib/transition.ts`, View Transitions API) so they ease in/out.
- `components/StartScreen.tsx` — title screen: `CinematicBackdrop`, PLAY / HOW TO PLAY, settings (three-line icon), LARPLE logo top-left with `TopThree` (today's top 3 + full-leaderboard link), `FunFact` bottom-right.
- `components/AuthScreen.tsx` — glass "Join Larple / Welcome back" card.
- `pages/PlayPage.tsx` — question bar (no box), get-ready countdown, recording frame over a blurred live camera (`BlurredFeed`), then the scoring screen (backdrop + fun fact + status).
- `pages/ResultsPage.tsx` — verdict (≥4000 "HE KNOWS.", ≥2500 "HE MIGHT KNOW…", else "HE HAS NO IDEA."), `ScoreReaction` GIF by tier, `TakeBreakdown` (heist-style rows → "Your Final Score" + judge's notes), playback, results-only backdrop.
- `pages/LeaderboardPage.tsx` — game-style board: slanted dark bars, gold/silver/bronze by **rank** (ties share a colour), accuracy/confidence/delivery columns, your row in yellow + pinned "Your rank" bar (username remembered via `getAlias()` after sign-in).
- `components/BrandHome.tsx` — LARPLE wordmark top-left on inner pages; click → home.
- `components/CinematicBackdrop.tsx` — drifting thumbnails, shuffled per visit. Title set = `MENU_SCENES` (`public/backgrounds/`); results set = `RESULT_SCENES` in `ResultsPage.tsx` (`public/results/`).
- `lib/reactions.ts` — Flight Reacts GIF per score tier (preloaded during play). `lib/funFacts.ts` — the rotating facts (keep them true).

## Look and feel
- Dark near-black (`#08080b`) with Larple yellow (`--yellow: #ffe600`) and white; see-through/glass panels over moving imagery.
- Type: **Anton** for big text and numbers, **Archivo Black** for small tracked labels, system UI for body text.
- Text is upright (no skewed/italic headlines). Respect `prefers-reduced-motion`, keep visible focus, and check phone width (375px) as well as desktop.

## Live preview (Anthony's Mac only)
A Docker preview (`larple-preview`: api, worker, web/Caddy, free cloudflared tunnel) runs from `~/hackathon/larple-preview-build`, settings in its `deploy/.env` (demo judging). To ship frontend changes there: copy `frontend/src` and `frontend/public` from the branch (`git archive`), then `docker compose -p larple-preview -f compose.production.yaml -f compose.preview.yaml --env-file deploy/.env build web` and `up -d --no-deps web`. The tunnel URL changes whenever it restarts (`docker logs larple-preview-tunnel-1`). `run-local.sh` (untracked) starts API :8001 + worker + frontend :5174.

## Known limits
- Recordings are stored only in the player's browser (IndexedDB, today only); the server doesn't serve them back.
- Gemini quota can run out; demo mode returns a fixed score.
