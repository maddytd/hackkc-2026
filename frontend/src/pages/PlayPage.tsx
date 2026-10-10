import { useCallback, useEffect, useRef, useState } from 'react';
import Mic from '../components/Mic';
import RecordingTimer from '../components/RecordingTimer';
import { useRecorder } from '../hooks/useRecorder';
import { useWebcam } from '../hooks/useWebcam';
import { getAttempt, startAttempt, uploadRecording } from '../lib/api';
import { RESPONSE_SECONDS } from '../lib/constants';
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
}: {
  onFinish: (attempt: Attempt) => void;
  onError: (message: string) => void;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const { videoRef, state: camState, stream } = useWebcam(true);
  const recorder = useRecorder();

  // Load today's attempt.
  useEffect(() => {
    let cancelled = false;
    startAttempt()
      .then((a) => {
        if (cancelled) return;
        if (a.status === 'completed' || a.score) {
          onFinish(a); // already played today
          return;
        }
        setAttempt(a);
        setPhase('getready');
      })
      .catch((err) => {
        if (!cancelled) {
          setPhase('error');
          onError(err?.message ?? "Couldn't start today's attempt.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onError, onFinish]);

  // Upload the recording, then poll until the judge finishes.
  const finishRecording = useCallback(
    async (blob: Blob) => {
      if (!attempt) return;
      setPhase('uploading');
      try {
        let current = await uploadRecording(attempt.id, blob);
        setPhase('processing');
        while (!TERMINAL.has(current.status)) {
          await new Promise((r) => setTimeout(r, 2000));
          current = await getAttempt(attempt.id);
        }
        onFinish(current);
      } catch (err) {
        setPhase('error');
        onError(err instanceof Error ? err.message : 'Upload failed.');
      }
    },
    [attempt, onFinish, onError],
  );

  // 3-2-1 get-ready, then start recording (also gives the camera a moment to warm up).
  useEffect(() => {
    if (phase !== 'getready') return;
    setCount(3);
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          window.clearInterval(id);
          if (stream) recorder.start(stream);
          startedAt.current = performance.now();
          setElapsed(0);
          setPhase('recording');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, stream, recorder]);

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
        <div className="overlay-center">
          <div className="spinner" />
          <p className="big">{statusText}</p>
        </div>
      )}
    </main>
  );
}
