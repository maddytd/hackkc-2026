import { useCallback, useEffect, useRef, useState } from 'react';
import Mic from '../components/Mic';
import RecordingTimer from '../components/RecordingTimer';
import { useRecorder } from '../hooks/useRecorder';
import { useWebcam } from '../hooks/useWebcam';
import { ApiError, apiConfigured, getAttempt, startAttempt, uploadRecording } from '../lib/api';
import { RESPONSE_SECONDS } from '../lib/constants';
import { saveRecording } from '../lib/recordingStore';
import type { Attempt } from '../types/game';

type Phase =
  | 'prepare'
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
}: {
  onFinish: (attempt: Attempt, recording: Blob | null) => void;
  onError: (message: string, status?: number) => void;
  day?: string;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<Phase>('prepare');
  const [consented, setConsented] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const { videoRef, state: camState, stream } = useWebcam(cameraEnabled);
  const recorder = useRecorder();

  // Load today's attempt.
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
        setCount(a.demo ? 10 : 3);
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
  }, [camState, onError, onFinish, day]);

  // Upload the recording, then poll until the judge finishes.
  const finishRecording = useCallback(
    async (blob: Blob) => {
      if (!attempt) return;
      // Keep the recording in the browser so it can be viewed back today.
      setPhase('uploading');
      try {
        // Browser storage can be unavailable; that must not discard the answer.
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

  // Demo mode keeps its 10s lead-in; live judging uses a 3s countdown.
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

      {phase === 'prepare' && (
        <div className="howto">
          <div className="howto-card">
            <h2>READY TO ANSWER?</h2>
            <p className="notice">Allow your camera and microphone. Then you’ll see today’s question and have 30 seconds to answer.</p>
            <label className="consent-label">
              <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} />
              <span>{apiConfigured
                ? 'I agree to send my video and audio to Google Gemini for AI scoring. A replay is also saved in this browser.'
                : 'I agree to record video and audio for this demo. Scoring is simulated and the replay stays in this browser.'}</span>
            </label>
            <button className="btn btn--play" disabled={!consented} onClick={() => {
              setPhase('loading');
              setCameraEnabled(true);
            }}>ENABLE CAMERA & START</button>
          </div>
        </div>
      )}

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
