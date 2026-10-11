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
import { smoothly } from './lib/transition';
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
  const [authDestination, setAuthDestination] = useState<'start' | 'play'>('play');
  const [screen, setScreen] = useState<Screen>('start');
  const [result, setResult] = useState<Attempt | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [authTick, setAuthTick] = useState(0);
  const [testing, setTesting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(todayUTC());
  const authed = apiConfigured && isAuthed();

  // Learn whether day-switching is enabled (demo mode, or the allow_day_override flag).
  // This also drives the longer get-ready countdown.
  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((h) => {
        if (cancelled) return;
        setTesting(h.day_override ?? h.judge_mode === 'demo');
        // The server decides when the day rolls over; start the day-switcher there.
        if (h.day) setSelectedDay(h.day);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // In normal play, preload today's scored attempt so you can view your answer. Skipped when
  // testing, where the day-switcher drives which prompt you load.
  useEffect(() => {
    if (!authed || testing) return;
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
  }, [authed, authTick, testing]);

  const beginPlay = useCallback(() => {
    if (apiConfigured && !isAuthed()) {
      smoothly(() => {
        setAuthDestination('play');
        setScreen('auth');
      });
    } else if (!testing && hasScore(result)) setScreen('results');
    else setScreen('play');
  }, [result, testing]);

  const finish = useCallback((attempt: Attempt, recording: Blob | null) => {
    setResult(attempt);
    setRecordingUrl(recording ? URL.createObjectURL(recording) : null);
    setScreen('results');
    // A round that was already played arrives without its recording; show the saved one
    // if this device still has it.
    if (!recording && attempt.day)
      void loadRecording(attempt.day).then((blob) => {
        if (blob) setRecordingUrl(URL.createObjectURL(blob));
      });
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
    smoothly(() => {
      setAuthTick((t) => t + 1);
      setScreen('start');
    });
  }, []);

  const start = (
    <StartScreen
      onStart={beginPlay}
      onLeaderboard={() => smoothly(() => setScreen('leaderboard'))}
      onLogout={doLogout}
      onCreateAccount={() =>
        smoothly(() => {
          setAuthDestination('start');
          setScreen('auth');
        })
      }
      authed={authed}
      testing={testing}
      day={selectedDay}
      onPrevDay={() => setSelectedDay((d) => addDaysISO(d, -1))}
      onNextDay={() => setSelectedDay((d) => addDaysISO(d, 1))}
    />
  );

  switch (screen) {
    case 'auth':
      return (
        <AuthScreen
          onAuthed={() =>
            smoothly(() => {
              setAuthTick((t) => t + 1);
              setScreen(authDestination);
            })
          }
          onBack={() => smoothly(() => setScreen('start'))}
        />
      );
    case 'play':
      return (
        <PlayPage
          onFinish={finish}
          onError={fail}
          onBack={() => smoothly(() => setScreen('start'))}
          day={testing ? selectedDay : undefined}
          testing={testing}
        />
      );
    case 'results':
      return result ? (
        <ResultsPage
          attempt={result}
          recordingUrl={recordingUrl}
          onLeaderboard={() => smoothly(() => setScreen('leaderboard'))}
          onBack={() => smoothly(() => setScreen('start'))}
          onRetry={retry}
        />
      ) : (
        start
      );
    case 'leaderboard':
      return (
        <LeaderboardPage
          onBack={() => smoothly(() => setScreen('start'))}
          day={testing ? selectedDay : undefined}
        />
      );
    default:
      return start;
  }
}
