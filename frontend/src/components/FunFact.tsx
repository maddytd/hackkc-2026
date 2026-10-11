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

// A rotating "FUN FACT" line, like the tips on a game loading screen.
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
    <aside className={`fun-fact ${className}`.trim()}>
      <span className="fun-fact-label">FUN FACT</span>
      {/* key restarts the fade-in each time the fact changes */}
      <p key={index} className="fun-fact-text">
        {FUN_FACTS[index]}
      </p>
    </aside>
  );
}
