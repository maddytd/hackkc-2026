import CinematicBackdrop from '../components/CinematicBackdrop';
import FunFact from '../components/FunFact';
import { useCallback, useEffect, useRef, useState } from 'react';
import Mic from '../components/Mic';
import RecordingTimer from '../components/RecordingTimer';
import { useRecorder } from '../hooks/useRecorder';
import { useWebcam } from '../hooks/useWebcam';
import { ApiError, getAttempt, startAttempt, uploadRecording } from '../lib/api';
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
  denied: 'Camera blocked — allow access and refresh',
  error: 'No camera found',
};

const TERMINAL = new Set(['completed', 'judge_failed', 'upload_failed', 'expired', 'replaced']);

// Runs one attempt end to end: reveal question, record 30s, upload, poll, then hand the
// finished attempt back to App for the results screen.
export default function PlayPage({
  onFinish,
  onError,
  day,
  testing = false,
}: {
  onFinish: (attempt: Attempt, recording: Blob | null) => void;
  onError: (message: string, status?: number) => void;
  day?: string;
  testing?: boolean;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const submissionStarted = useRef(false);
  const { videoRef, state: camState, stream } = useWebcam(true);
  const recorder = useRecorder();

  // Fetch the results-screen reactions while the player records, so they show instantly.
  useEffect(() => preloadReactions(), []);

  // Load today's attempt.
  useEffect(() => {
    let cancelled = false;
    startAttempt(day)
      .then((a) => {
        if (cancelled) return;
        if (a.status === 'completed' || a.score) {
          onFinish(a, null); // already played today
          return;
        }
        setAttempt(a);
        setPhase('getready');
      })
      .catch((err) => {
        if (!cancelled) {
          setPhase('error');
          const status = err instanceof ApiError ? err.status : undefined;
          onError(err?.message ?? "Couldn't start today's attempt.", status);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onError, onFinish, day]);

  // Upload the recording, then poll until the judge finishes.
  const finishRecording = useCallback(
    async (blob: Blob) => {
      if (!attempt) return;
      // Keep the recording in the browser so it can be viewed back today.
      setPhase('uploading');
      try {
        if (!blob.size) throw new Error('The browser captured no recording. Please try again.');
        await saveRecording(attempt.day, blob);
        let current = await uploadRecording(attempt.id, blob);
        setPhase('processing');
        while (!TERMINAL.has(current.status)) {
          await new Promise((r) => setTimeout(r, 2000));
          current = await getAttempt(attempt.id);
        }
        onFinish(current, blob);
      } catch (err) {
        setPhase('error');
        const status = err instanceof ApiError ? err.status : undefined;
        onError(err instanceof Error ? err.message : 'Upload failed.', status);
      }
    },
    [attempt, onFinish, onError],
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
    if (phase !== 'recording') return;
    void stopAndSubmit();
  }

  const statusText =
    phase === 'uploading'
      ? 'Uploading your answer…'
      : phase === 'processing'
        ? 'The judge is scoring you…'
        : '';

  return (
    <main className="game">
      <div className="game-bg" />
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
        {camState !== 'live' && <div className="screen-fallback">{FALLBACK[camState]}</div>}
        {phase === 'recording' && camState === 'live' && (
          <span className="screen-tally">
            <span className="dot" /> REC
          </span>
        )}
      </div>

      {phase === 'recording' && (
        <button className="btn btn--ghost stop-btn" onClick={stopEarly}>
          ■ DONE
        </button>
      )}

      {phase === 'getready' && camState === 'live' && <div className="countdown">{count}</div>}

      {(phase === 'uploading' || phase === 'processing') && (
        <div className="scoring-screen">
          <CinematicBackdrop />
          <FunFact />
          <div className="menu-brand" aria-label="Larple">
            LARPLE<span>DOES HE KNOW?</span>
          </div>
          <div className="scoring-status" role="status">
            <div className="spinner" />
            <p>{statusText}</p>
          </div>
        </div>
      )}
    </main>
  );
}
