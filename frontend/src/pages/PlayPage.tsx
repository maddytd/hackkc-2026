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
  const { videoRef, state: camState, stream } = useWebcam(true);
  const recorder = useRecorder();

  // Fetch the results-screen reactions while the player records, so they show instantly.
  useEffect(() => preloadReactions(), []);

  // Load today's attempt once the camera is live, so the clock never starts on a dead camera.
  useEffect(() => {
    if (camState !== 'live') return;
    let cancelled = false;
    startAttempt(day)
      .then(async (a) => {
        if (cancelled) return;
        if (TERMINAL.has(a.status) || a.score) {
          onFinish(a, null); // already played today
          return;
        }
        if (a.status === 'queued' || a.status === 'processing' || a.status === 'uploading') {
          setPhase('processing');
          while (!cancelled && !TERMINAL.has(a.status)) {
            await new Promise((r) => setTimeout(r, 2000));
            if (cancelled) return;
            a = await getAttempt(a.id);
          }
          if (!cancelled) onFinish(a, null);
          return;
        }
        setAttempt(a);
        setCount(testing ? 10 : 3);
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
  }, [camState, onError, onFinish, day, testing]);

  // Upload the recording, then poll until the judge finishes.
  const finishRecording = useCallback(
    async (blob: Blob) => {
      if (!attempt) return;
      setPhase('uploading');
      try {
        // Keep the recording in the browser so it can be viewed back today. Browser storage
        // can be unavailable; that must not discard the answer.
        await saveRecording(attempt.day, blob).catch(() => {});
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

  // Get-ready countdown, then start recording. Testing uses a 10s lead-in (set above).
  // The recorder is started here, never inside a setState updater: React StrictMode runs
  // updaters twice in development, which started two recorders and broke the upload.
  useEffect(() => {
    if (phase !== 'getready' || !stream) return;
    const id = window.setTimeout(() => {
      if (count <= 1) {
        try {
          recorder.start(stream);
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Unable to start recording.');
          return;
        }
        startedAt.current = performance.now();
        setElapsed(0);
        setPhase('recording');
        setCount(0);
      } else {
        setCount(count - 1);
      }
    }, 1000);
    return () => window.clearTimeout(id);
  }, [phase, count, stream, recorder, onError]);

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
          setPhase('uploading');
          setElapsed(RESPONSE_SECONDS);
          recorder.stop().then(finishRecording);
        }
      } else {
        setElapsed(s);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, recorder, finishRecording]);

  function stopEarly() {
    if (phase !== 'recording') return;
    setPhase('uploading');
    recorder.stop().then(finishRecording);
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

      {phase === 'getready' && <div className="countdown">{count}</div>}

      {(phase === 'uploading' || phase === 'processing') && (
        <div className="scoring-screen">
          <CinematicBackdrop />
          <FunFact className="fun-fact--loading" />
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
