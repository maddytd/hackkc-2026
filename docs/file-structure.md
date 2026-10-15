# Proposed Repository Structure

This is the target implementation layout. The backend is now implemented; see [backend setup](../backend/README.md). Some backend modules are consolidated in this MVP, and the frontend remains planned.


```text
hackkc-2026/
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   ├── game-design.md
│   └── file-structure.md
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles.css
│       ├── components/
│       │   ├── CameraPreview.tsx
│       │   ├── RecordingTimer.tsx
│       │   ├── QuestionCard.tsx
│       │   └── ScoreCard.tsx
│       ├── pages/
│       │   ├── PlayPage.tsx
│       │   ├── ResultsPage.tsx
│       │   └── LeaderboardPage.tsx
│       ├── hooks/
│       │   ├── useRecorder.ts
│       │   └── useAttempt.ts
│       ├── lib/
│       │   └── api.ts
│       └── types/
│           └── game.ts
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── dependencies.py
│   │   ├── routes/
│   │   │   ├── attempts.py
│   │   │   └── leaderboard.py
│   │   ├── services/
│   │   │   ├── attempts.py
│   │   │   ├── media.py
│   │   │   ├── judging.py
│   │   │   └── scoring.py
│   │   ├── ai/
│   │   │   ├── client.py
│   │   │   └── rubrics/
│   │   │       └── question_answering_v1.md
│   │   └── worker.py
│   ├── content/
│   │   └── questions.json
│   ├── migrations/
│   ├── tests/
│   │   ├── test_attempts.py
│   │   ├── test_uploads.py
│   │   ├── test_scoring.py
│   │   └── test_leaderboard.py
│   └── storage/                 # Gitignored local runtime data
│       ├── game.db
│       └── recordings/
└── tests/
    └── e2e/
        └── daily-game.spec.ts
```

### Key Responsibilities

| File | Responsibility |
|---|---|
| `QuestionCard.tsx` | Display the assigned question and its public context. |
| `useRecorder.ts` | Handle device permissions, recording format selection, capture, and camera cleanup. |
| `useAttempt.ts` | Manage upload UI, processing status, and refresh recovery. |
| `services/attempts.py` | Enforce daily eligibility, assign questions, and authorize replacements. |
| `services/media.py` | Validate recordings and prepare supported AI media inputs. |
| `services/judging.py` | Evaluate accuracy, confidence, and delivery using the private rubric. |
| `services/scoring.py` | Convert validated ratings into points and calculate the weighted final score. |
| `worker.py` | Process persisted jobs, retry judging failures, and delete expired recordings. |
| `content/questions.json` | Store curated questions, reference answers, and private evaluation criteria. |

Keep reference answers, private judging guides, and AI credentials on the backend. Only send the question's public fields to the browser before judging. The backend remains authoritative for attempt eligibility, replacement questions, and leaderboard scores.
