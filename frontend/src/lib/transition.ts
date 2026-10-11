import { flushSync } from 'react-dom';

// Runs a screen change inside a View Transition, so the old screen eases out while the new one
// eases in (styled in styles.css under "Screen transitions"). Browsers without the API, and
// people who prefer reduced motion, just get the instant switch.
export function smoothly(update: () => void): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduced) {
    update();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(update));
  // A skipped transition (hidden tab, overlapping change) still applies the update.
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
}
