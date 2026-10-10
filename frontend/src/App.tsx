import { useCallback, useEffect, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import StartScreen from './components/StartScreen';
import LeaderboardPage from './pages/LeaderboardPage';
import PlayPage from './pages/PlayPage';
import ResultsPage from './pages/ResultsPage';
import { apiConfigured, currentAttempt, isAuthed, logout, requestReplacement } from './lib/api';
import { clearRecording, loadRecording } from './lib/recordingStore';
import type { Attempt } from './types/game';

type Screen = 'start' | 'auth' | 'play' | 'results' | 'leaderboard';

function hasScore(a: Attempt | null): boolean {
  return !!a && (a.status === 'completed' || !!a.score);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [result, setResult] = useState<Attempt | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [authTick, setAuthTick] = useState(0);
  const authed = apiConfigured && isAuthed();

  // On load (and after sign-in): if today's attempt is already scored, preload it and the
  // locally-stored recording so the player can view their answer.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    currentAttempt()
      .then(async (a) => {
        if (cancelled || !hasScore(a) || !a) return;
        setResult(a);
        const blob = await loadRecording(a.day);
        if (!cancelled && blob) setRecordingUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        /* not signed in / network — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [authed, authTick]);

  const beginPlay = useCallback(() => {
    if (apiConfigured && !isAuthed()) setScreen('auth');
    else if (hasScore(result)) setScreen('results'); // already played today → view it
    else setScreen('play');
  }, [result]);

  const finish = useCallback((attempt: Attempt, recording: Blob | null) => {
    setResult(attempt);
    if (recording) setRecordingUrl(URL.createObjectURL(recording));
    setScreen('results');
  }, []);

  const fail = useCallback((message: string) => {
    setResult({ failure: message } as Attempt);
    setRecordingUrl(null);
    setScreen('results');
  }, []);

  const retry = useCallback(async () => {
    if (result?.id) {
      try {
        await requestReplacement(result.id);
      } catch {
        /* if not allowed, startAttempt returns the current state */
      }
    }
    setScreen('play');
  }, [result]);

  const doLogout = useCallback(async () => {
    await logout();
    await clearRecording();
    setResult(null);
    setRecordingUrl(null);
    setAuthTick((t) => t + 1);
    setScreen('start');
  }, []);

  switch (screen) {
    case 'auth':
      return (
        <AuthScreen
          onAuthed={() => {
            setAuthTick((t) => t + 1);
            setScreen('play');
          }}
          onBack={() => setScreen('start')}
        />
      );
    case 'play':
      return <PlayPage onFinish={finish} onError={fail} />;
    case 'results':
      return result ? (
        <ResultsPage
          attempt={result}
          recordingUrl={recordingUrl}
          onLeaderboard={() => setScreen('leaderboard')}
          onBack={() => setScreen('start')}
          onRetry={retry}
        />
      ) : (
        <StartScreen
          onStart={beginPlay}
          onLeaderboard={() => setScreen('leaderboard')}
          onLogout={doLogout}
          authed={authed}
        />
      );
    case 'leaderboard':
      return <LeaderboardPage onBack={() => setScreen('start')} />;
    default:
      return (
        <StartScreen
          onStart={beginPlay}
          onLeaderboard={() => setScreen('leaderboard')}
          onLogout={doLogout}
          authed={authed}
        />
      );
  }
}
