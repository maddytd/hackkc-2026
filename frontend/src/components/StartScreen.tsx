import { useEffect, useRef, useState } from 'react';
import CinematicBackdrop from './CinematicBackdrop';
import FunFact from './FunFact';
import TopThree from './TopThree';

export default function StartScreen({
  onStart,
  onLeaderboard,
  onLogout,
  onCreateAccount,
  authed,
  testing,
  replay,
  day,
  onPrevDay,
  onNextDay,
}: {
  onStart: () => void;
  onLeaderboard: () => void;
  onLogout: () => void;
  onCreateAccount: () => void;
  authed: boolean;
  testing: boolean;
  // The day on the menu already has a scored round: offer to watch it back instead.
  replay: boolean;
  day: string;
  onPrevDay: () => void;
  onNextDay: () => void;
}) {
  const [settings, setSettings] = useState(false);
  const [paused, setPaused] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const howTo = useRef<HTMLDialogElement>(null);

  // Let the dialog ease out before it closes; `after` runs once it is gone.
  const closeHowTo = (after?: () => void) => {
    const dialog = howTo.current;
    if (!dialog?.open || dialog.dataset.closing) return;
    const finish = () => {
      delete dialog.dataset.closing;
      dialog.close();
      after?.();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    dialog.dataset.closing = 'true';
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      dialog.removeEventListener('animationend', onEnd);
      finish();
    };
    const onEnd = (event: AnimationEvent) => {
      if (event.target === dialog) once();
    };
    dialog.addEventListener('animationend', onEnd);
    // Fallback in case the animation never reports back.
    window.setTimeout(once, 400);
  };

  useEffect(() => {
    if (!settings) return;
    const outside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettings(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettings(false);
        settingsButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [settings]);

  return (
    <main className="start main-menu">
      <CinematicBackdrop paused={paused} />
      <div className="menu-settings" ref={settingsRef}>
        <button
          className="settings-toggle"
          ref={settingsButton}
          aria-label="Settings"
          aria-expanded={settings}
          aria-controls="settings-panel"
          onClick={() => setSettings((v) => !v)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        {settings && (
          <section className="settings-panel" id="settings-panel" aria-label="Settings">
            <h2>SETTINGS</h2>
            <button
              onClick={() => {
                setSettings(false);
                if (authed) onLogout();
                else onCreateAccount();
              }}
            >
              {authed ? 'LOG OUT' : 'CREATE ACCOUNT'}
              <span>↗</span>
            </button>
            <button aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
              {paused ? 'RESUME BACKGROUND' : 'PAUSE BACKGROUND'}
              <span>{paused ? '▶' : 'Ⅱ'}</span>
            </button>
            {testing && (
              <div className="menu-day-switch">
                <p>TRY A DIFFERENT DAY</p>
                <div className="day-switch-controls">
                  <button onClick={onPrevDay} aria-label="Previous day">
                    ‹
                  </button>
                  <span className="day-switch-day">{day}</span>
                  <button onClick={onNextDay} aria-label="Next day">
                    ›
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <nav className="menu-actions" aria-label="Main menu">
        <p className="menu-eyebrow">30 SECONDS. ALL CONFIDENCE.</p>
        <button className="menu-play" onClick={onStart}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {replay ? (
              <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" />
            ) : (
              <path d="M6 3 21 12 6 21Z" />
            )}
          </svg>
          {replay ? 'REPLAY' : 'PLAY'}
        </button>
        <button className="menu-how" onClick={() => howTo.current?.showModal()}>
          HOW TO PLAY <span>↗</span>
        </button>
      </nav>

      <FunFact />

      <div className="menu-brand">
        <h1>LARPLE</h1>
        <span>DOES HE KNOW?</span>
        <TopThree day={testing ? day : undefined} onLeaderboard={onLeaderboard} />
      </div>

      <dialog
        className="menu-dialog howto-card"
        ref={howTo}
        aria-labelledby="howto-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeHowTo();
        }}
        onCancel={(e) => {
          // Escape key: play the same exit as the close button.
          e.preventDefault();
          closeHowTo();
        }}
      >
        <button className="howto-close" onClick={() => closeHowTo()} aria-label="Close">
          ×
        </button>
        <p className="menu-eyebrow">KNOW IT. OR SELL IT.</p>
        <h2 id="howto-title">HOW TO PLAY</h2>
        <ol>
          <li>Everyone gets the same daily question.</li>
          <li>Allow your camera and mic, then answer in 30 seconds.</li>
          <li>AI scores your accuracy, confidence, and delivery.</li>
          <li>A convincing bluff can still earn points.</li>
          <li>See how you stack up on the leaderboard.</li>
        </ol>
        <button
          className="btn btn--play"
          onClick={() => closeHowTo(onStart)}
        >
          LET’S PLAY
        </button>
      </dialog>
    </main>
  );
}
