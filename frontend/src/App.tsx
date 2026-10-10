import { useState } from 'react';
import StartScreen from './components/StartScreen';
import PlayPage from './pages/PlayPage';

export default function App() {
  const [screen, setScreen] = useState<'start' | 'play'>('start');

  return screen === 'start' ? (
    <StartScreen onStart={() => setScreen('play')} />
  ) : (
    <PlayPage onExit={() => setScreen('start')} />
  );
}
