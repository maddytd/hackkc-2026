# hackkc-2026

A daily video question-answering game where players have 30 seconds to answer a question and are scored on accuracy, confidence, and delivery. The game rewards how convincingly players “larp” expertise alongside what they actually know.

## Project documentation

- [Game design](docs/game-design.md): gameplay, scoring, daily attempts, upload recovery, and architecture.
- [Proposed file structure](docs/file-structure.md): React frontend, FastAPI backend, SQLite storage, and test organization.

The React frontend and FastAPI backend are implemented. See [frontend setup](frontend/README.md) and [backend setup and API documentation](backend/README.md) for local development.

For a complete single-server deployment with the website, API, Gemini worker, persistent storage, and HTTPS, follow the [Docker deployment guide](deploy/README.md).
