# hackkc-2026

A daily video question-answering game where players have 30 seconds to answer a question and are scored on accuracy, confidence, and delivery. The game rewards how convincingly players “larp” expertise alongside what they actually know.

## Project documentation

- [Game design](docs/game-design.md): gameplay, scoring, daily attempts, upload recovery, and architecture.
- [Proposed file structure](docs/file-structure.md): React frontend, FastAPI backend, SQLite storage, and test organization.
- [AWS and Strands rollout](docs/aws-strands-rollout.md): account setup, niche drafts, audiovisual judging, fallback, and release validation.

The React frontend and FastAPI backend are implemented. See [local setup](RUN.md), [backend documentation](backend/README.md), and [AGENTS.md](AGENTS.md) for coding conventions. New days use the niche library. Judging supports demo, Gemini, and an opt-in AWS Strands workflow with Pegasus performance analysis and a separate Bedrock accuracy judge.
