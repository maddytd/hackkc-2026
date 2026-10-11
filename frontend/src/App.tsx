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

// The browser's local date: the best first guess at the server's day until /health answers.
function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Days this browser has already seen a scored round for. The menu uses them to show REPLAY
// straight away instead of flashing PLAY while it asks the server.
const PLAYED_DAYS_KEY = 'larple_played_days';

function readPlayedDays(): string[] {
  try {
    const days: unknown = JSON.parse(localStorage.getItem(PLAYED_DAYS_KEY) ?? '[]');
    return Array.isArray(days) ? days.filter((day) => typeof day === 'string') : [];
  } catch {
    return [];
  }
}

function writePlayedDays(days: string[]) {
  try {
    localStorage.setItem(PLAYED_DAYS_KEY, JSON.stringify(days.slice(-60)));
  } catch {
    /* storage unavailable: the menu just asks the server first */
  }
}

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
  // The server's answer to "does this player have a scored round for `day`?".
  const [lookup, setLookup] = useState<{ day: string; attempt: Attempt | null } | null>(null);
  const [playedDays, setPlayedDays] = useState(readPlayedDays);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [authTick, setAuthTick] = useState(0);
  const [testing, setTesting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(todayLocal());
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

  const notePlayed = useCallback((day: string, attempt: Attempt | null) => {
    setLookup({ day, attempt });
    setPlayedDays((days) => {
      if (days.includes(day) === !!attempt) return days;
      return attempt ? [...days, day] : days.filter((d) => d !== day);
    });
  }, []);
  useEffect(() => writePlayedDays(playedDays), [playedDays]);

  // Learn whether the day on the menu has already been played, so the menu can offer REPLAY.
  // The day-switcher picks the day when testing; otherwise the server uses today.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    currentAttempt(testing ? selectedDay : undefined)
      .then((a) => {
        if (cancelled) return;
        const scored = hasScore(a) ? a : null;
        notePlayed(scored?.day ?? selectedDay, scored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authed, authTick, testing, selectedDay, notePlayed]);
  // Until the server has answered for the day on the menu, go by what this browser remembers.
  const played = lookup?.day === selectedDay ? lookup.attempt : null;
  const replay =
    authed && (lookup?.day === selectedDay ? !!played : playedDays.includes(selectedDay));

  const finish = useCallback((attempt: Attempt, recording: Blob | null) => {
    setResult(attempt);
    if (hasScore(attempt) && attempt.day) notePlayed(attempt.day, attempt);
    setRecordingUrl(recording ? URL.createObjectURL(recording) : null);
    setScreen('results');
    // A round that was already played arrives without its recording; show the saved one
    // if this device still has it.
    if (!recording && attempt.day)
      void loadRecording(attempt.day).then((blob) => {
        if (blob) setRecordingUrl(URL.createObjectURL(blob));
      });
  }, [notePlayed]);

  const beginPlay = useCallback(() => {
    if (apiConfigured && !isAuthed()) {
      smoothly(() => {
        setAuthDestination('play');
        setScreen('auth');
      });
    } else if (played) finish(played, null);
    // Also reached when REPLAY is shown from memory alone: the play page finds the round.
    else setScreen('play');
  }, [played, finish]);

  const fail = useCallback((message: string, status?: number) => {
    if (status === 401) {
      setResult(null);
      setLookup(null);
      setPlayedDays([]);
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
    setLookup(null);
    setPlayedDays([]);
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
      replay={replay}
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
