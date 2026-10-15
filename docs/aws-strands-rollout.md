# AWS + Strands rollout for Larple

The AWS workflow has completed local live Pegasus and Haiku scoring. Deployment still requires AWS credentials and model access in the deployment environment. The existing `backend/.env` has not been changed. Nova Pro failover is covered by simulated throttling tests; a live quota failure has not been forced.

## What runs

New competition days load `backend/content/questions_niche.json`. No question-generation request runs during gameplay. Saved days retain their questions and judging policy.

In `LARP_JUDGE_MODE=aws`, the worker uses two fresh Strands agents:

1. A custom Pegasus provider sends video bytes to TwelveLabs Pegasus through Bedrock `InvokeModel`. It returns a transcript, approximate timestamped audiovisual observations, and confidence/delivery ratings. Both modalities must be assessable. Confidence means performed conviction, not an inference about personality or internal emotions.
2. A Bedrock accuracy agent receives only the transcript, question, private answer guide, and rubric. It does not receive performance ratings or body language. A configured backup model is tried on throttling, quota exhaustion, timeouts, and temporary service errors.

The accuracy agent uses an anchored 0..10 rating. Pegasus rates five confidence signals (authority, directness, fluency, voice, presence) and four delivery signals (clarity, pacing, structure, expression) from 0 to 100. Python caps fluency, directness, and structure using filler, hedge, and word counts from the transcript (`app/ai/speech_metrics.py`), then weights each set into one category score, so similar performances rarely tie. The accuracy agent also reports `on_topic`; off-topic answers have confidence and delivery halved. Both are converted once to the application's 0..5000 category scores. Gemini uses the existing 0..5000 schema. Normal AWS scoring uses two model requests. The optional offline writer uses Nova Micro by default to produce drafts from supplied reference excerpts.

AWS mode needs no Gemini key. Gemini remains a legacy rollout/rollback option; demo remains fixed scoring. The old `app/ai/generator.py` is no longer called by gameplay.

## 1. Create an account

1. Create an account at [AWS signup](https://aws.amazon.com/free/). Account creation can require payment information; Bedrock inference is billed usage.
2. Enable MFA for the account root identity. Create an IAM development identity or use IAM Identity Center for routine work. Do not configure the app with root credentials.
3. In Billing, create an AWS Budget and billing notifications for your event. Alerts are not a hard spending cap. Larple also limits accepted daily jobs and model requests per recording.
4. Start in `us-east-1`, then check that every selected model is available there. Accuracy and video regions can differ.

## 2. Get model access

Open **Amazon Bedrock > Model catalog**.

| Role | Starting choice | Setting |
| --- | --- | --- |
| Question drafts | Amazon Nova Micro | `LARP_AWS_QUESTION_MODEL` |
| Video/audio performance | TwelveLabs Pegasus 1.2 | `LARP_AWS_VIDEO_MODEL` |
| Accuracy | A Claude model supporting tool calling | `LARP_AWS_ACCURACY_MODEL` |
| Accuracy backup | A tested Nova Lite/Pro or another tool-calling model | `LARP_AWS_ACCURACY_FALLBACK_MODEL` |

Follow model subscription/access prompts. For Anthropic, complete its first-time-use form if prompted; your project GitHub URL can describe the use case. Copy exact model IDs or inference-profile IDs from YOUR catalog. Some models require inference profiles, so do not guess model names from old examples.

The defaults are `amazon.nova-micro-v1:0` for drafting and `twelvelabs.pegasus-1-2-v1:0` for video. Verify availability. The video adapter supports Pegasus's API format only: substituting Nova or Claude in a video setting will not work. A second Pegasus endpoint can be configured in a supported region after verification. Regional failover does not protect against account-wide billing/access failures.

References: [AWS model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html), [Pegasus API](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-pegasus.html), [inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-use.html).

## 3. Give the development identity permissions

The runtime needs `bedrock:InvokeModel` for Pegasus and `bedrock:InvokeModelWithResponseStream` for the Strands structured-output path. Scope these to selected foundation-model ARNs and any inference-profile ARNs. Cross-region profiles also need permission for the underlying model in every destination region.

Policy skeleton: replace placeholders and remove unused entries.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    "Resource": [
      "arn:aws:bedrock:us-east-1::foundation-model/twelvelabs.pegasus-1-2-v1:0",
      "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0",
      "arn:aws:bedrock:REGION::foundation-model/PRIMARY_ACCURACY_MODEL_ID",
      "arn:aws:bedrock:REGION::foundation-model/BACKUP_ACCURACY_MODEL_ID",
      "arn:aws:bedrock:REGION:ACCOUNT_ID:inference-profile/PROFILE_ID"
    ]
  }]
}
```

Add the actual destination-model ARNs for cross-region profiles. The identity doing first-use subscriptions may also need Marketplace/model-access setup permissions; the worker does not need those setup permissions.

**No S3 bucket is needed in this version.** Pegasus receives inline bytes. The worker uses ffmpeg to convert browser recordings to H.264/AAC MP4 with duration metadata, at up to 720p and 24 fps, targeting 1 Mbps video plus 96 kbps audio. Install ffmpeg in the worker environment; `LARP_FFMPEG` can specify its executable. Conversion is bounded to 45 seconds, preserves the full recording, and removes temporary output after reading it. The converted file must fit the 12 MiB upload cap, below Pegasus's documented 25 MB base64 input cap. Recordings stay private in local storage and are removed on completion or after the retention window. Provider retention is separate from application-held media cleanup; check the selected service's terms before inviting participants.

## 4. Sign in locally on Windows

Install the current [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). For an IAM/federated console identity, CLI 2.32.0+ supports browser login. Attach AWS's `SignInLocalDevelopmentAccess` managed policy to your identity alongside the Bedrock permissions.

```powershell
aws --version
aws login --profile larple
aws sts get-caller-identity --profile larple
```

Choose your development identity in the browser. If using IAM Identity Center, use `aws configure sso --profile larple` followed by `aws sso login --profile larple` instead.

From the repository root, activate the backend environment:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -c requirements.lock -e ".[dev]"
python -m pip install "botocore[crt]"
$env:AWS_PROFILE = "larple"
$env:AWS_DEFAULT_REGION = "us-east-1"
```

CRT support can be needed for boto3 to use console-login credentials. Set the same two environment variables in the worker terminal. Keep credentials out of frontend variables and Git. On AWS-hosted compute, use an IAM role rather than a local profile.

The local Docker Compose stack does not automatically mount host profiles; start with native Python, then configure container credentials explicitly. No Docker credential mounts were added.

References: [browser login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html), [Identity Center login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html).

## 5. Configure a separate test competition

Edit your gitignored `backend/.env` manually. Do not overwrite an existing populated file with `.env.example`.

```dotenv
LARP_JUDGE_MODE=aws
LARP_STORAGE_DIR=storage-aws-test
LARP_QUESTIONS_FILE=content/questions_niche.json
LARP_ALLOW_DAY_OVERRIDE=true
LARP_MAX_DAILY_JOBS=5
LARP_MAX_AI_CALLS_PER_ATTEMPT=6
LARP_AWS_REGION=us-east-1
LARP_AWS_ACCURACY_MODEL=YOUR_PRIMARY_MODEL_OR_PROFILE_ID
LARP_AWS_ACCURACY_FALLBACK_MODEL=YOUR_BACKUP_MODEL_OR_PROFILE_ID
LARP_AWS_VIDEO_REGION=YOUR_PEGASUS_SUPPORTED_REGION
LARP_AWS_VIDEO_MODEL=twelvelabs.pegasus-1-2-v1:0
LARP_AWS_VIDEO_FALLBACK_REGION=
LARP_AWS_VIDEO_FALLBACK_MODEL=
LARP_AWS_QUESTION_MODEL=amazon.nova-micro-v1:0
```

The Gemini key can be blank. Leave both video fallback fields blank until a second Pegasus endpoint is verified. The separate storage prevents conflicts with already locked Gemini/demo daily challenges and keeps experimental scores off your live leaderboard.

Start the API and worker from separate terminals using the same environment:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

```powershell
python -m app.worker
```

Start the frontend using `RUN.md`. The start screen shows the configured provider's processing notice. `/health` reports the mode and notice but does not confirm provider readiness.

## 6. Generate niche question drafts

Use `backend/content/source_packet.example.json` as the format for a JSON array of checked reference excerpts (`url`, `text`). URLs are provenance; the writer does not fetch them. Provide original-source facts supporting each answer.

From `backend/`:

```powershell
python -m app.ai.question_library draft --sources content/source_packet.example.json --output content/questions_draft.json --count 2
```

This makes a paid Bedrock request. It writes drafts, not playable questions. Validation checks that every supporting quote occurs in its supplied source and that the requested question count was returned. Quote matching does not prove that every answer claim follows from the excerpt.

Read each question, answer guide, and original source. Correct ambiguity, accepted pronunciations, and partial-credit rules; remove weak or incorrect drafts. Only after a human verifies every retained answer:

```powershell
python -m app.ai.question_library approve --draft content/questions_draft.json --output content/questions_niche.json --reviewer "Your name"
```

This appends atomically and records the reviewer. Approval is an operator attestation, not automatic factual verification. Existing days keep their saved question; changes affect newly created competition days.

## 7. Validate and release

1. Run backend `pytest -q`, `ruff check app tests`, and `ruff format --check app tests`. AWS tests replace networking and make no paid calls. Run frontend `npm run build` and `npm run lint`.
2. In the isolated competition, test correct answers, convincing wrong answers, silence, quiet audio, pauses, niche-name pronunciations, varied accents, and different camera conditions. Verify Pegasus actually hears the speech and cites visible/audible evidence on YOUR endpoint.
3. Compare the primary and backup accuracy judges against human ratings of identical recordings. Mock integration tests do not establish score quality or equivalence.
4. Demonstrate failover with the simulated-throttling tests rather than exhausting paid quota. `ai_calls` records every AWS model request before sending; `judgment_provenance` records the actual scoring endpoints.
5. Stop both services, back up the live SQLite database while no process writes it, and test the additive v1 -> v2 migration on a copy. Existing players, attempts, and scores are preserved.
6. Switch to AWS at the next competition day, or use a separate competition database. Turn day override off, keep conservative daily-job limits, and restart both services with matching settings and credentials.

The daily policy snapshots endpoints and call budget. Changing them mid-day blocks new attempts for that day. Queued jobs use the saved policy, so keep its endpoints available until those jobs finish.

## Failure handling and limits

- Accuracy failures eligible for routing try the configured backup. Video failures try only another explicitly configured Pegasus endpoint.
- Cooldowns persist in SQLite. Waiting for an already known cooldown spends neither a worker try nor a model request.
- The default six-request budget includes primary/fallback calls and interrupted reservations across worker restarts. SDK retries are disabled. Offline question drafting is outside the gameplay budget.
- Completed stages are cached through retries. Private transcripts/observations are deleted with the recording on completion or expiry. Call metadata and provenance contain no recordings or transcripts.
- Invalid responses, missing modalities, credentials, and permissions do not silently trigger quota failover. Exhausted jobs have no fabricated scores.
- If all video endpoints are exhausted, the job receives bounded retries under the existing retention policy. A Nova video + independent transcription/audio-feature adapter is a future extension, not implemented here.
- Observation timestamps are model estimates. These ratings do not establish objective psychological traits.
- The scoring workflow uses schema-validated output without autonomous tool loops. Pegasus receives its JSON contract in the prompt and its output is validated locally; its native `responseFormat` setting was rejected in live testing even though the same recording and scoring prompt succeeded without it. Bedrock accuracy still uses the Strands provider's structured-output path. Invalid, truncated, or missing-modality responses never become scores. Agent-selected reference lookup and realtime voice are not implemented.
- Legacy Gemini uses its original worker retry limit. The AWS request ledger does not count Gemini requests. Experimental AWS/Gemini judgments should not be mixed within one competitive day.

For rollback, stop services and restore prior environment settings at a new competition day or use the previous database. Older code rejects schema v2; reverting to an older checkout can require restoring its matching pre-migration database backup.
