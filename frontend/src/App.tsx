import { useCallback, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import StartScreen from './components/StartScreen';
import LeaderboardPage from './pages/LeaderboardPage';
import PlayPage from './pages/PlayPage';
import ResultsPage from './pages/ResultsPage';
import { apiConfigured, isAuthed, requestReplacement } from './lib/api';
import type { Attempt } from './types/game';

type Screen = 'start' | 'auth' | 'play' | 'results' | 'leaderboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [result, setResult] = useState<Attempt | null>(null);

  // From the start screen: sign in first if a backend needs it, otherwise play.
  const beginPlay = useCallback(() => {
    setScreen(apiConfigured && !isAuthed() ? 'auth' : 'play');
  }, []);

  const finish = useCallback((attempt: Attempt) => {
    setResult(attempt);
    setScreen('results');
  }, []);

  const fail = useCallback((message: string) => {
    setResult({ failure: message } as Attempt);
    setScreen('results');
  }, []);

  const retry = useCallback(async () => {
    if (result?.id) {
      try {
        await requestReplacement(result.id);
      } catch {
        /* if replacement is not allowed, startAttempt will return the current state */
      }
    }
    setScreen('play');
  }, [result]);

  switch (screen) {
    case 'auth':
      return <AuthScreen onAuthed={() => setScreen('play')} onBack={() => setScreen('start')} />;
    case 'play':
      return <PlayPage onFinish={finish} onError={fail} />;
    case 'results':
      return result ? (
        <ResultsPage
          attempt={result}
          onLeaderboard={() => setScreen('leaderboard')}
          onBack={() => setScreen('start')}
          onRetry={retry}
        />
      ) : (
        <StartScreen onStart={beginPlay} onLeaderboard={() => setScreen('leaderboard')} />
      );
    case 'leaderboard':
      return <LeaderboardPage onBack={() => setScreen('start')} />;
    default:
      return <StartScreen onStart={beginPlay} onLeaderboard={() => setScreen('leaderboard')} />;
  }
}
