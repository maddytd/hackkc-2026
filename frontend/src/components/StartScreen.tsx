import { useState } from 'react';
import Mic from './Mic';

// YouTube-thumbnail-style landing: the meme face fills the frame, "LARPLE" + "does he know?"
// in bold outlined caption text, and the mic out front. Hitting Play slides the face away.
export default function StartScreen({ onStart }: { onStart: () => void }) {
  const [launching, setLaunching] = useState(false);
  const [showHow, setShowHow] = useState(false);

  function launch() {
    if (launching) return;
    setShowHow(false);
    setLaunching(true);
    window.setTimeout(onStart, 700); // let the face slide out before the game mounts
  }

  return (
    <main className={`start ${launching ? 'start--launching' : ''}`}>
      <img className="face" src="/face.png" alt="" aria-hidden="true" />
      <div className="start-overlay" />

      <div className="start-content">
        <h1 className="title">LARPLE</h1>
        <p className="subtitle">does he know?</p>
        <div className="start-buttons">
          <button className="btn btn--play" onClick={launch}>
            ▶ PLAY
          </button>
          <button className="btn btn--ghost" onClick={() => setShowHow((v) => !v)}>
            HOW TO PLAY
          </button>
        </div>
      </div>

      <div className="mic-rig">
        <Mic />
      </div>

      {showHow && (
        <div className="howto" role="dialog" aria-label="How to play">
          <div className="howto-card">
            <button className="howto-close" onClick={() => setShowHow(false)} aria-label="Close">
              ×
            </button>
            <h2>HOW TO PLAY</h2>
            <ol>
              <li>Each day everyone gets the same question.</li>
              <li>You have 30 seconds to answer it on camera.</li>
              <li>An AI judges your accuracy, confidence, and delivery.</li>
              <li>Sound convincing — a confident bluff still earns points.</li>
              <li>See where your score lands on today's leaderboard.</li>
            </ol>
            <button className="btn btn--play" onClick={launch}>
              ▶ START
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
