import { useEffect, useState } from 'react';
import { FUN_FACTS } from '../lib/funFacts';

const randomIndex = () => Math.floor(Math.random() * FUN_FACTS.length);

// Next fact, never the same one twice in a row.
function nextIndex(current: number): number {
  if (FUN_FACTS.length < 2) return 0;
  let n = current;
  while (n === current) n = randomIndex();
  return n;
}

// A rotating "FUN FACT" tip in the bottom-right corner, like the tips on a game loading
// screen: a small label, a bold line, and a bar that fills until the next fact.
export default function FunFact({
  className = '',
  intervalMs = 7000,
}: {
  className?: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(randomIndex);

  useEffect(() => {
    const id = window.setInterval(() => setIndex(nextIndex), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return (
    <aside className={`fun-fact ${className}`.trim()} aria-live="polite">
      <span className="fun-fact-label">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />
        </svg>
        FUN FACT
      </span>
      {/* key restarts the fade-in and the timer bar each time the fact changes */}
      <p key={index} className="fun-fact-text">
        {FUN_FACTS[index]}
      </p>
      <div className="fun-fact-bar" aria-hidden="true">
        <span key={index} style={{ animationDuration: `${intervalMs}ms` }} />
      </div>
    </aside>
  );
}
