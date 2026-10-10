import { useCallback, useEffect, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import StartScreen from './components/StartScreen';
import LeaderboardPage from './pages/LeaderboardPage';
import PlayPage from './pages/PlayPage';
import ResultsPage from './pages/ResultsPage';
import {
  apiConfigured,
  currentAttempt,
  getHealth,
  isAuthed,
  logout,
  requestReplacement,
} from './lib/api';
import { clearRecording, loadRecording } from './lib/recordingStore';
import type { Attempt } from './types/game';

type Screen = 'start' | 'auth' | 'play' | 'results' | 'leaderboard';

const todayUTC = () => new Date().toISOString().slice(0, 10);

function addDaysISO(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function hasScore(a: Attempt | null): boolean {
  return !!a && (a.status === 'completed' || !!a.score);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [result, setResult] = useState<Attempt | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [authTick, setAuthTick] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedDay, setSelectedDay] = useState(todayUTC());
  const authed = apiConfigured && isAuthed();

  // Learn whether the backend is in demo mode (enables the day-switcher + longer countdown).
  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((h) => !cancelled && setDemoMode(h.judge_mode === 'demo'))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // In normal play, preload today's scored attempt so you can view your answer. Skipped in
  // demo, where the day-switcher drives which prompt you load.
  useEffect(() => {
    if (!authed || demoMode) return;
    let cancelled = false;
    currentAttempt()
      .then(async (a) => {
        if (cancelled || !hasScore(a) || !a) return;
        setResult(a);
        const blob = await loadRecording(a.day);
        if (!cancelled && blob) setRecordingUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authed, authTick, demoMode]);

  const beginPlay = useCallback(() => {
    if (apiConfigured && !isAuthed()) setScreen('auth');
    else if (!demoMode && hasScore(result)) setScreen('results');
    else setScreen('play');
  }, [result, demoMode]);

  const finish = useCallback((attempt: Attempt, recording: Blob | null) => {
    setResult(attempt);
    if (recording) setRecordingUrl(URL.createObjectURL(recording));
    setScreen('results');
  }, []);

  const fail = useCallback((message: string, status?: number) => {
    if (status === 401) {
      setResult(null);
      setRecordingUrl(null);
      setAuthTick((t) => t + 1);
      setScreen('auth');
      return;
    }
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

  const start = (
    <StartScreen
      onStart={beginPlay}
      onLeaderboard={() => setScreen('leaderboard')}
      onLogout={doLogout}
      authed={authed}
      demoMode={demoMode}
      day={selectedDay}
      onPrevDay={() => setSelectedDay((d) => addDaysISO(d, -1))}
      onNextDay={() => setSelectedDay((d) => addDaysISO(d, 1))}
    />
  );

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
      return <PlayPage onFinish={finish} onError={fail} day={demoMode ? selectedDay : undefined} />;
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
        start
      );
    case 'leaderboard':
      return (
        <LeaderboardPage onBack={() => setScreen('start')} day={demoMode ? selectedDay : undefined} />
      );
    default:
      return start;
  }
}
