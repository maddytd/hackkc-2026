# Larple frontend

Vite + React + TypeScript UI for the daily "larp expertise" video game.

## Run the UI

```sh
npm install
npm run dev        # http://localhost:5173
```

With no backend configured it runs on **mock data** so the whole flow is clickable
(start → record → results → leaderboard) without a server.

## Connect to the backend

Copy the env example and point it at the running FastAPI server:

```sh
cp .env.example .env.local
# .env.local:
# VITE_API_URL=http://localhost:8000
```

The backend's default CORS already allows `http://localhost:5173`. See `../backend/README.md`
to start the API and worker (use `LARP_JUDGE_MODE=demo` to run without a Gemini key).

With `VITE_API_URL` set, the app uses the real endpoints: register/login (invite code),
start today's attempt, record 30s, upload the raw video Blob, poll until the judge finishes,
then show the score and leaderboard.

## How it connects

Everything backend-facing lives in `src/lib/api.ts` — auth, attempts, upload, leaderboard.
It falls back to mock data whenever `VITE_API_URL` is unset, so the UI never hard-depends on
the server during development.

| Area | Files |
|---|---|
| API client / session | `src/lib/api.ts` |
| Camera + mic stream | `src/hooks/useWebcam.ts` |
| Recording (MediaRecorder) | `src/hooks/useRecorder.ts` |
| Screens | `src/components/StartScreen.tsx`, `AuthScreen.tsx`, `src/pages/*` |
| Shared types (match backend) | `src/types/game.ts` |

## Checks

```sh
npm run build      # tsc + vite build
npm run lint       # oxlint
```
