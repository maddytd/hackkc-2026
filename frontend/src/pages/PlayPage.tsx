import BlurredFeed from '../components/BlurredFeed';
import CinematicBackdrop from '../components/CinematicBackdrop';
import FunFact from '../components/FunFact';
import { useCallback, useEffect, useRef, useState } from 'react';
import Mic from '../components/Mic';
import RecordingTimer from '../components/RecordingTimer';
import { useRecorder } from '../hooks/useRecorder';
import { useWebcam } from '../hooks/useWebcam';
import { ApiError, currentAttempt, getAttempt, startAttempt, uploadRecording } from '../lib/api';
import { RESPONSE_SECONDS } from '../lib/constants';
import { preloadReactions } from '../lib/reactions';
import { saveRecording } from '../lib/recordingStore';
import type { Attempt } from '../types/game';

type Phase =
  | 'loading'
  | 'getready'
  | 'recording'
  | 'uploading'
  | 'processing'
  | 'error';

const FALLBACK: Record<string, string> = {
  idle: 'Camera off',
  requesting: 'Starting camera…',
  denied: 'Camera blocked — allow camera and microphone access, then press PLAY again',
  error: 'No camera or microphone found',
};

// After this long on the scoring screen, tell the player they are free to leave.
const SLOW_SCORING_MS = 45_000;

// Thumbnails behind the uploading/scoring screen. Loading-only; the title screen keeps its own.
const LOADING_SCENES = [
  '/loading/huh.jpg',
  '/loading/still-talking.jpg',
  '/loading/who-is-that.jpg',
  '/loading/is-he-serious.jpg',
  '/loading/what-happened-to-shame.jpg',
  '/loading/who-is-he.jpg',
  '/loading/biggest-larper.jpg',
];

const TERMINAL = new Set(['completed', 'judge_failed', 'upload_failed', 'expired', 'replaced']);

// Runs one attempt end to end: reveal question, record 30s, upload, poll, then hand the
// finished attempt back to App for the results screen.
export default function PlayPage({
  onFinish,
  onError,
  onBack,
  day,
  testing = false,
}: {
  onFinish: (attempt: Attempt, recording: Blob | null) => void;
  onError: (message: string, status?: number) => void;
  onBack?: () => void;
  day?: string;
  testing?: boolean;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [judgingMessage, setJudgingMessage] = useState<string | null>(null);
  // True once we know today's take has not been recorded yet and needs a working camera.
  const [needsStart, setNeedsStart] = useState(false);
  const [slow, setSlow] = useState(false);
  const mounted = useRef(true);
  const startedAt = useRef(0);
  const submissionStarted = useRef(false);
  const { videoRef, state: camState, stream } = useWebcam(true);
  const recorder = useRecorder();

  // Fetch the results-screen reactions while the player records, so they show instantly.
  useEffect(() => preloadReactions(), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll until the judge finishes. A dropped request is retried rather than ending the round.
  const pollUntilDone = useCallback(async (first: Attempt, cancelled: () => boolean) => {
    let current = first;
    const began = performance.now();
    while (!cancelled() && !TERMINAL.has(current.status)) {
      setJudgingMessage(current.failure);
      if (performance.now() - began > SLOW_SCORING_MS) setSlow(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (cancelled()) return null;
      try {
        current = await getAttempt(first.id);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) throw err;
      }
    }
    return cancelled() ? null : current;
  }, []);

  // Show a result, resume scoring, or begin the get-ready countdown.
  const resume = useCallback(
    async (a: Attempt, cancelled: () => boolean) => {
      if (TERMINAL.has(a.status) || a.score) {
        onFinish(a, null); // already played today
        return;
      }
      setAttempt(a);
      if (a.status === 'queued' || a.status === 'processing' || a.status === 'uploading') {
        setPhase('processing');
        const done = await pollUntilDone(a, cancelled);
        if (done) onFinish(done, null);
        return;
      }
      setPhase('getready');
    },
    [onFinish, pollUntilDone],
  );

  const failStart = useCallback(
    (err: unknown) => {
      setPhase('error');
      const status = err instanceof ApiError ? err.status : undefined;
      onError(err instanceof Error ? err.message : "Couldn't start today's attempt.", status);
    },
    [onError],
  );

  // Look for today's attempt without creating one, so the clock cannot start early.
  useEffect(() => {
    let cancelled = false;
    currentAttempt(day)
      .then(async (a) => {
        if (cancelled) return;
        if (a && a.status !== 'recording') await resume(a, () => cancelled);
        else setNeedsStart(true);
      })
      .catch((err) => {
        if (!cancelled) failStart(err);
      });
    return () => {
      cancelled = true;
    };
  }, [day, resume, failStart]);

  // Issue the question (and start its deadline) only once the camera and mic are live.
  useEffect(() => {
    if (!needsStart || camState !== 'live') return;
    let cancelled = false;
    startAttempt(day)
      .then(async (a) => {
        if (cancelled) return;
        setNeedsStart(false);
        await resume(a, () => cancelled);
      })
      .catch((err) => {
        if (!cancelled) failStart(err);
      });
    return () => {
      cancelled = true;
    };
  }, [needsStart, camState, day, resume, failStart]);

  // Upload the recording, then poll until the judge finishes.
  const finishRecording = useCallback(
    async (blob: Blob) => {
      if (!attempt) return;
      // Keep the recording in the browser so it can be viewed back today.
      setPhase('uploading');
      try {
        if (!blob.size) throw new Error('The browser captured no recording. Please try again.');
        await saveRecording(attempt.day, blob);
        const uploaded = await uploadRecording(attempt.id, blob);
        setPhase('processing');
        const done = await pollUntilDone(uploaded, () => !mounted.current);
        if (done) onFinish(done, blob);
      } catch (err) {
        if (!mounted.current) return;
        setPhase('error');
        const status = err instanceof ApiError ? err.status : undefined;
        if (status && status !== 401) {
          // A rejected upload leaves a real attempt behind; show it so TRY AGAIN is offered.
          const current = await getAttempt(attempt.id).catch(() => null);
          if (current && TERMINAL.has(current.status)) {
            onFinish(current, null);
            return;
          }
        }
        onError(err instanceof Error ? err.message : 'Upload failed.', status);
      }
    },
    [attempt, onFinish, onError, pollUntilDone],
  );

  const stopAndSubmit = useCallback(async () => {
    if (submissionStarted.current) return;
    submissionStarted.current = true;
    setPhase('uploading');
    try {
      await finishRecording(await recorder.stop());
    } catch (error) {
      setPhase('error');
      onError(error instanceof Error ? error.message : 'Recording could not be saved.');
    }
  }, [recorder, finishRecording, onError]);

  // Get-ready countdown, then start recording (also gives the camera a moment to warm up).
  // Testing uses a longer 10s lead-in to make it easier.
  useEffect(() => {
    if (phase !== 'getready' || camState !== 'live' || !stream) return;
    let remaining = testing ? 10 : 3;
    setCount(remaining);
    const id = window.setInterval(() => {
      remaining -= 1;
      setCount(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        try {
          recorder.start(stream);
          startedAt.current = performance.now();
          setElapsed(0);
          setPhase('recording');
        } catch (error) {
          setPhase('error');
          onError(error instanceof Error ? error.message : 'Recording could not start.');
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, stream, camState, recorder, testing, onError]);

  // 30-second recording window.
  useEffect(() => {
    if (phase !== 'recording') return;
    let stopped = false;
    const id = window.setInterval(() => {
      const s = (performance.now() - startedAt.current) / 1000;
      if (s >= RESPONSE_SECONDS) {
        window.clearInterval(id);
        if (!stopped) {
          stopped = true;
          setElapsed(RESPONSE_SECONDS);
          void stopAndSubmit();
        }
      } else {
        setElapsed(s);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, stopAndSubmit]);

  function stopEarly() {
    if (phase !== 'recording' || performance.now() - startedAt.current < 5000) return;
    void stopAndSubmit();
  }

  const statusText =
    phase === 'uploading'
      ? 'Uploading your answer…'
      : phase === 'processing'
        ? (judgingMessage ?? 'The judge is scoring you…')
        : '';

  return (
    <main className="game">
      <div className="game-bg" />
      <BlurredFeed stream={stream} />
      <div className="floor" />

      <Mic className="rig-mic rig-mic--top" />

      {attempt && (
        <div className="prompt-bar">
          <span className="tag">{attempt.question.category}</span>
          <h2>{attempt.question.text}</h2>
          {attempt.question.context && <p>{attempt.question.context}</p>}
        </div>
      )}

      {phase === 'recording' && (
        <div className="game-timer">
          <RecordingTimer elapsed={elapsed} total={RESPONSE_SECONDS} />
        </div>
      )}

      <div className={`screen ${phase === 'recording' ? 'screen--live' : ''}`}>
        <video
          ref={videoRef}
          className="screen-video"
          muted
          playsInline
          autoPlay
          style={{ opacity: camState === 'live' ? 1 : 0 }}
        />
        {camState !== 'live' && (
          <div className="screen-fallback">
            <p>{FALLBACK[camState]}</p>
            {!attempt && (camState === 'denied' || camState === 'error') && (
              <p>Your question has not been revealed and your time has not started.</p>
            )}
          </div>
        )}
        {phase === 'recording' && camState === 'live' && (
          <span className="screen-tally">
            <span className="dot" /> REC
          </span>
        )}
      </div>

      {phase === 'recording' && (
        <button
          className="btn btn--ghost stop-btn"
          onClick={stopEarly}
          disabled={elapsed < 5}
        >
          {elapsed < 5 ? `RECORD AT LEAST 5s (${Math.ceil(5 - elapsed)}s)` : '■ DONE'}
        </button>
      )}

      {onBack && (camState === 'denied' || camState === 'error') && (
        <button className="btn btn--ghost stop-btn" onClick={onBack}>
          ← HOME
        </button>
      )}

      {phase === 'getready' && camState === 'live' && <div className="countdown">{count}</div>}

      {(phase === 'uploading' || phase === 'processing') && (
        <div className="scoring-screen">
          <CinematicBackdrop sources={LOADING_SCENES} />
          <FunFact />
          <div className="menu-brand" aria-label="Larple">
            LARPLE<span>DOES HE KNOW?</span>
          </div>
          <div className="scoring-status" role="status">
            <div className="spinner" />
            <div>
              <p>{statusText}</p>
              {slow && phase === 'processing' && (
                <p className="scoring-slow">
                  This is taking longer than usual. Your answer is saved — you can{' '}
                  {onBack ? (
                    <button type="button" className="linkbtn" onClick={onBack}>
                      go home
                    </button>
                  ) : (
                    'go home'
                  )}{' '}
                  and press PLAY later to see your score.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
