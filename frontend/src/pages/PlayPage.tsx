import { useEffect, useRef, useState } from 'react';
import Mic from '../components/Mic';
import RecordingTimer from '../components/RecordingTimer';
import { useWebcam } from '../hooks/useWebcam';
import { startAttempt } from '../lib/api';
import { RESPONSE_SECONDS } from '../lib/constants';
import type { Attempt } from '../types/game';

type Phase = 'loading' | 'getready' | 'recording' | 'done' | 'error';

const FALLBACK: Record<string, string> = {
  idle: 'Camera off',
  requesting: 'Starting camera…',
  denied: 'Camera blocked — allow access and refresh',
  error: 'No camera found',
};

// Full-screen game: the venue fills the viewport, the prompt floats in a transparent
// bar at the top, and your webcam + the centered mic sit in the middle. No scrolling.
export default function PlayPage({ onExit }: { onExit: () => void }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const { videoRef, state: camState } = useWebcam(true);

  // Load today's question.
  useEffect(() => {
    let cancelled = false;
    startAttempt()
      .then((a) => {
        if (!cancelled) {
          setAttempt(a);
          setPhase('getready');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 3-2-1 get-ready, which also gives the camera a moment to start.
  useEffect(() => {
    if (phase !== 'getready') return;
    setCount(3);
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          window.clearInterval(id);
          startedAt.current = performance.now();
          setElapsed(0);
          setPhase('recording');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // 30-second recording window.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      const s = (performance.now() - startedAt.current) / 1000;
      if (s >= RESPONSE_SECONDS) {
        window.clearInterval(id);
        setElapsed(RESPONSE_SECONDS);
        setPhase('done');
      } else {
        setElapsed(s);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  return (
    <main className="game">
      <div className="game-bg" />
      <div className="floor" />

      {/* Mic hangs in from the top, in front of your face. */}
      <Mic className="rig-mic rig-mic--top" />

      {attempt && (
        <div className="prompt-bar">
          <span className="tag">{attempt.question.category}</span>
          <h2>{attempt.question.text}</h2>
          {attempt.question.context && <p>{attempt.question.context}</p>}
        </div>
      )}

      {(phase === 'recording' || phase === 'done') && (
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

      {phase === 'getready' && <div className="countdown">{count}</div>}

      {phase === 'done' && (
        <div className="overlay-center">
          <p className="big">Time's up!</p>
          <p className="notice">Scoring comes next.</p>
          <button className="btn btn--ghost" onClick={onExit}>
            Back to start
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="overlay-center">
          <p className="big">Couldn't load today's question.</p>
          <button className="btn btn--ghost" onClick={onExit}>
            Back to start
          </button>
        </div>
      )}
    </main>
  );
}
