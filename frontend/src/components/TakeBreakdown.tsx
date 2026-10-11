import { useEffect, useState, type ReactNode } from 'react';
import type { Question, Score } from '../types/game';

const MAX = 5000;
const ELITE = 4000;
const fmt = (n: number) => n.toLocaleString();
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Counts up to `target` once, like the end-of-mission tally. Instant with reduced motion.
function useCountUp(target: number, delayMs: number, durationMs = 900) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(Math.max((now - start) / durationMs, 0), 1);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delayMs, durationMs, reduced]);
  return value;
}

// End-of-heist style score breakdown: one row per category, then "Your Final Take".
export default function TakeBreakdown({ score, question }: { score: Score; question?: Question }) {
  const rows: [string, ReactNode][] = [];
  if (question?.category) rows.push(['Category', title(question.category)]);
  if (question?.difficulty) rows.push(['Difficulty', title(question.difficulty)]);
  rows.push(['Potential Take', fmt(MAX)]);
  rows.push(['Accuracy', fmt(score.accuracy)]);
  rows.push(['Confidence', fmt(score.confidence)]);
  rows.push(['Delivery', fmt(score.delivery)]);
  rows.push(['Split 3 Ways', 'Average']);
  const elite = score.final_score >= ELITE;
  rows.push([
    'Elite Challenge',
    <span
      key="elite"
      className={`take-check ${elite ? 'is-done' : ''}`}
      role="img"
      aria-label={elite ? 'Completed: 4,000 or more' : 'Not completed: needs 4,000'}
    />,
  ]);

  const stepMs = 110;
  const finalDelay = rows.length * stepMs + 150;
  const finalTake = useCountUp(score.final_score, finalDelay);

  return (
    <section className="take" aria-label="Score breakdown">
      <dl className="take-rows">
        {rows.map(([label, value], i) => (
          <div className="take-row" key={label} style={{ animationDelay: `${i * stepMs}ms` }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="take-final" style={{ animationDelay: `${finalDelay}ms` }}>
        <span>Your Final Take</span>
        <strong aria-label={fmt(score.final_score)}>{fmt(finalTake)}</strong>
      </div>

      <ul className="take-notes" aria-label="Judge's notes">
        {(['accuracy', 'confidence', 'delivery'] as const).map((key) => (
          <li key={key}>
            <strong>{title(key)}</strong> {score.feedback[key]}
          </li>
        ))}
      </ul>
    </section>
  );
}
