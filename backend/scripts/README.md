# Backend dev scripts

Helpers for testing AWS judging locally. None of these are used by the running game.
Run the Python ones from `backend/` with the venv active.

| Script | What it does |
|---|---|
| `run_aws_local.ps1 -Service api\|worker\|frontend` | Starts one piece of the local AWS test stack (API on :8001, frontend on :5175) against `backend/storage-aws-test`. The VS Code "Larple: AWS ..." tasks call this. |
| `python -m scripts.check_pegasus` | Sends one diagnostic Pegasus request using the latest failed recording in `storage-aws-test` (or `--synthetic` for a generated clip). Makes a paid AWS call. |
| `python -m scripts.requeue_failed_attempt` | Puts the most recent failed AWS test attempt back in the worker queue, if its recording and call budget remain. |
