# Repository Layout

```text
hackkc-2026/
├── README.md, RUN.md, AGENTS.md   # overview, local setup, notes for coding agents
├── compose.yaml                   # Docker: API + worker only
├── compose.public.yaml            # Docker: API + worker + website (+ optional public tunnel)
├── .github/workflows/backend.yml  # CI: backend lint + tests
├── .vscode/tasks.json             # one-click "Larple: ..." run tasks
├── docs/
│   ├── game-design.md             # gameplay, scoring, attempt rules
│   ├── aws-strands-rollout.md     # AWS account setup and the Pegasus/Bedrock judge
│   └── file-structure.md          # this file
├── frontend/                      # React 19 + Vite + TypeScript
│   ├── public/                    # backgrounds, reaction GIFs, results images
│   ├── tests/                     # node:test checks and a browser recording harness
│   └── src/
│       ├── App.tsx                # screen state machine (start → auth → play → results)
│       ├── components/            # StartScreen, AuthScreen, TakeBreakdown, TopThree, ...
│       ├── pages/                 # PlayPage, ResultsPage, LeaderboardPage
│       ├── hooks/                 # useWebcam, useRecorder
│       ├── lib/                   # api client (with mock mode), recording storage, fun facts
│       ├── types/game.ts          # shared types matching the backend API
│       └── styles.css
└── backend/                       # FastAPI + SQLite + background judging worker
    ├── app/
    │   ├── main.py                # HTTP routes
    │   ├── config.py              # settings (LARP_* env vars) and the daily judging policy
    │   ├── database.py            # SQLite schema and migrations
    │   ├── auth.py                # accounts and sessions
    │   ├── schemas.py             # request and judgment models
    │   ├── worker.py              # job queue: judging, retries, recording cleanup
    │   ├── services/
    │   │   ├── attempts.py        # daily eligibility, questions, replacements, demo seeding
    │   │   ├── media.py           # upload validation (ffprobe)
    │   │   └── scoring.py         # weighted final score
    │   └── ai/
    │       ├── client.py          # picks the judge for the day's mode (demo, gemini, aws)
    │       ├── aws_pipeline.py    # Strands workflow: Pegasus performance + Bedrock accuracy
    │       ├── pegasus_output.py  # Pegasus JSON request/response handling
    │       ├── speech_metrics.py  # filler/hedge counts from the transcript
    │       ├── recording.py       # ffmpeg conversion for Pegasus
    │       ├── video_model.py     # Gemini video adapter (legacy mode)
    │       ├── gemini_errors.py   # Gemini error classification (legacy mode)
    │       ├── question_library.py# offline question drafting and approval CLI
    │       └── rubrics/           # rubric text saved with each competition day
    ├── content/
    │   ├── questions_niche.json   # default question pool
    │   ├── questions.json         # easier general-knowledge pool (LARP_QUESTIONS_FILE)
    │   └── source_packet.example.json
    ├── scripts/                   # local AWS testing helpers (see scripts/README.md)
    ├── tests/                     # pytest suite
    └── storage/                   # gitignored runtime data: game.db, recordings/
```

Keep reference answers, private judging guides, and AI credentials on the backend. Only send the question's public fields to the browser before judging. The backend remains authoritative for attempt eligibility, replacement questions, and leaderboard scores.
