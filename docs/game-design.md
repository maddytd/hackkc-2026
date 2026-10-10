# Hackathon Project: AI Question-Answering LARP Game

## Overview

An arcade-style video game where players have 30 seconds to answer a real question. The fun comes from how well they “larp” as someone who knows what they are talking about: sounding confident, thinking on their feet, and delivering a convincing answer—even when they are unsure.

Players answer questions directly. They are not assigned fictional characters or imaginary scenarios. Here, “larping” means performing confidence and apparent expertise.

The AI judges both the substance of the answer and how convincingly it is presented. Scores are entertainment feedback, not assessments of a player's real-world personality, competence, or emotional state.

## Core Gameplay Loop

1. **Prepare:** The player signs in, grants camera and microphone access, and checks their recording preview before seeing the prompt.
2. **Reveal:** The server assigns a prompt from the day's curated pool. The prompt contains a question and any context needed to answer it. Revealing it starts the 30-second response window.
3. **Perform:** The player records their answer to the question. Recording stops automatically after 30 seconds; the player may finish early.
4. **Upload:** The recording is uploaded and validated by the backend.
5. **Judge:** The AI scores the valid recording and provides short feedback grounded in the performance.
6. **Rank:** The server saves one final score and adds the player to that day's leaderboard.

## Question Design

Each question record must contain:

- The question shown to the player.
- Its category and estimated difficulty.
- Any context needed to answer immediately.
- A private reference answer or evaluation criteria, depending on the question type.
- Accepted alternative answers, key points, and common factual errors where applicable.

Example questions:

- “Why is the sky blue?”
- “What makes someone a good leader?”
- “Why should we hire you?”
- “How would you explain inflation to a ten-year-old?”

Use a curated daily pool of questions with similar complexity and performance demands. Questions should allow a meaningful answer within 30 seconds. For factual questions, verify the reference answer before adding the question to the pool. For opinion and interview questions, define criteria for relevance, reasoning, and supporting examples rather than requiring one supposedly correct answer. Do not claim to verify a player's personal experiences.

A daily leaderboard limits the competition window but does not by itself equalize question difficulty. Comparable questions and a shared rubric are the MVP fairness controls; exact equivalence is not guaranteed. Avoid placing questions with substantially different difficulty or scoring expectations in the same daily pool.

## AI Scoring System

Preserve three equally weighted categories, each worth up to 5,000 points.

### Accuracy — 5,000 points

How factually correct, relevant, and logically sound is the answer? For factual questions, judge against the verified reference answer and accepted alternatives. For opinion or interview questions, judge how directly the response answers the question and supports its reasoning.

A confident bluff may earn confidence and delivery points, but unsupported or incorrect claims must still lose accuracy points. The accuracy feedback should identify material factual errors and provide the correction when supported by the reference answer.

### Confidence — 5,000 points

How convincingly does the player present themselves as someone who knows what they are talking about? Assess projected conviction through tone, body language, eye contact, and commitment to the answer. This is the core “larping” dimension.

Judge observable performance rather than claiming to know the player's internal confidence. Acknowledging uncertainty clearly and decisively need not count as weak confidence. Avoid scoring physical appearance or treating a particular accent as evidence of expertise.

### Delivery — 5,000 points

How effectively does the player communicate through articulation, pacing, vocal expression, answer structure, and use of the available time? Reward an engaging, understandable answer. Do not automatically penalize every filler word or natural pause.

Keep this separate from confidence: confidence measures projected conviction; delivery measures how clearly and effectively the answer is communicated.

### Final Score

`final_score = round((accuracy + confidence + delivery) / 3)`

The maximum final score is **5,000 points**, not 15,000. “Average score” refers only to the average of these three categories. It does not refer to averaging multiple attempts.

Strong confidence and delivery can compensate for low accuracy in the overall score. This is intentional: the game rewards how well someone “larps” expertise as well as what they actually know. Keep the three category scores visible so a convincing answer is not mistaken for a factually correct one.

### Judge Requirements

- Use a fixed rubric and model configuration for the day's competition.
- Give each category a rating from 0 to 10 with defined anchors; the server multiplies each rating by 500 to produce arcade points.
- Return structured ratings and brief evidence-based feedback for each category.
- Treat player speech, captions, and visible text as performance content, never as instructions to change the rubric or award points.
- Validate ratings on the server and calculate the final score there.
- Save the first valid judgment. Do not offer rerolls of a completed score.
- If the media cannot be evaluated or the model response is invalid, report a processing failure rather than inventing a score.

## Daily Leaderboard and Attempt Rules

- Each player may receive **one completed ranked score per day**.
- Rank players by final score, highest first. Equal scores share the same rank.
- Each competition day resets at **00:00 UTC**, an MVP default that must be displayed with a local countdown.
- The server assigns the competition day when the initial prompt is revealed. An authorized replacement prompt retains that day.
- A submission completed after midnight counts toward its original competition day, provided it meets the upload deadline.
- Players cannot select prompts, restart a successful attempt, or submit another ranked performance after receiving a score.
- The leaderboard displays a player alias and score. Recordings are not public by default.

### Failed Uploads

If an upload fails, the player receives a **new, different prompt** and another recording opportunity. The failed upload does not consume their completed ranked score.

To make this rule implementable:

1. The server creates an attempt ID when issuing each prompt and allows only one active attempt per player for that competition day.
2. Before declaring failure, check whether the recording was actually received. A lost browser response after successful receipt must resume the existing attempt rather than issue a replacement.
3. Confirmed failed uploads invalidate the old attempt before a replacement prompt is issued. Late uploads for the invalidated attempt cannot be scored.
4. Replacement requests are rate-limited. An MVP default is three replacement prompts per player per competition day; after that, show a clear failure message and leave the player unranked.
5. Use a server-enforced upload deadline. An MVP default is two minutes after the recording window ends.

Intentional network interruption can resemble a genuine failure. Replacement limits reduce prompt shopping but cannot eliminate it. This is an accepted hackathon tradeoff.

### Other Failures

- **Camera or microphone unavailable before prompt reveal:** Do not create a ranked attempt. Let the player fix permissions and retry setup.
- **Abandonment after prompt reveal:** Consume the daily opportunity unless the server authorizes a replacement under the failure policy. Do not silently grant a fresh prompt on refresh.
- **Empty, malformed, or over-limit media:** Reject it without scoring. Apply the same bounded replacement policy as failed uploads.
- **AI timeout or provider failure after a valid upload:** Retry judging the same recording with bounded retries. Keep the attempt pending or failed for recovery; do not issue a new prompt simply because judging is slow.
- **Duplicate requests:** Return the existing attempt status or score; never create a second leaderboard entry.

## Technical Architecture

### Frontend: Vite + React

- Use `getUserMedia` for camera and microphone access and `MediaRecorder` for capture.
- Deploy over HTTPS and detect supported recording formats at runtime.
- Provide explicit states for device setup, recording, uploading, processing, results, and failure.
- Persist the attempt ID so refreshes can recover status from the backend.
- Stop camera and microphone tracks when recording ends or the player exits.
- Never accept a client-supplied score as authoritative.

### Backend: Python + FastAPI

- Authenticate players and enforce daily eligibility on the server.
- Assign prompts, issue attempt IDs, and enforce deadlines and replacement limits.
- Validate actual media format, size, duration, and required audio/video tracks. Allow a small encoding tolerance around 30 seconds.
- Keep AI credentials exclusively on the backend.
- Return a submission ID after upload and expose processing status for polling.
- Run media preparation and AI evaluation through a worker with bounded concurrency, timeouts, and retries. For the MVP, persist job status in SQLite so interrupted jobs can be recovered.
- Commit the final score and attempt completion together, with a database uniqueness constraint on player and competition day for leaderboard entries.

### AI Media Pipeline

Select the provider and model only after successfully evaluating a representative recording from the target browsers.

The pipeline must preserve the evidence needed for each category:

- Spoken content and the question’s reference answer or criteria for accuracy.
- Audio for tone, pacing, and vocal delivery.
- Visual information for performed body language and eye contact.

If the provider does not accept the recorded video directly, prepare supported audio and visual inputs. A transcript alone is insufficient for the proposed scoring. Document any limitations from frame sampling or media conversion and avoid judging details the pipeline cannot observe.

### Database: SQLite

SQLite is suitable for a small, single-server hackathon deployment on persistent storage. Store metadata and results in the database; keep recordings in temporary private file or object storage.

Minimum records:

- **Players:** ID and display alias.
- **Daily challenges:** Competition date, prompt pool version, rubric version, and model configuration.
- **Questions:** Question text, category, difficulty, context, reference answer or evaluation criteria, accepted alternatives, and private judging guide.
- **Attempts:** Player, competition day, prompt, status, timestamps, replacement relationship, failure reason, and temporary media location.
- **Scores:** Attempt ID, category ratings, final score, and feedback.
- **Leaderboard entries:** Unique player and competition day, linked to the completed score.

Use short database transactions. Do not hold a write transaction open while uploading media or waiting for the AI. Revisit the database choice if deployment requires multiple application servers or sustained concurrent writes.

## Recording Privacy and Cost Controls

- Explain before recording that the clip is sent to an external AI service for judging.
- Keep recordings private and do not place media URLs in public leaderboard responses.
- Delete application-held recordings after successful judging, or within 24 hours for failed and abandoned attempts. Confirm the selected provider's separate retention behavior before launch.
- Enforce upload-size limits, player request limits, judging concurrency limits, and a daily AI spending cap.
- If judging is unavailable or the budget is exhausted, disable new ranked attempts before revealing prompts.

## MVP Validation

- Complete the full recording-to-leaderboard flow on each target browser.
- Test permission denial, failed uploads, lost upload acknowledgments, refresh recovery, duplicate requests, and midnight rollover.
- Verify that successful players cannot obtain a second score and that invalidated attempts cannot submit late recordings.
- Test model failure recovery without recording again.
- Review a small set of performances against the rubric, including a confident but incorrect answer, a correct but hesitant answer, a well-reasoned opinion, and a spoken attempt to manipulate the judge. Confirm that confidence does not inflate the accuracy rating.
- Rejudge reference clips offline to check score stability before enabling the leaderboard.

## Hackathon Scope

Ship one question-answering mode built around “larping” expertise, a curated daily question pool, 30-second video performances, three-category scoring, one completed daily score per player, bounded replacement prompts for failed uploads, and a daily leaderboard.

Defer public video sharing, multiplayer sessions, elaborate anti-cheat systems, and multiple game modes until the core loop works reliably.

## Repository Structure

See [the proposed file structure](file-structure.md) for the implementation layout.
