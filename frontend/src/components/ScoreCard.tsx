import type { Score } from '../types/game';

const CATEGORIES = ['accuracy', 'confidence', 'delivery'] as const;

export default function ScoreCard({ score }: { score: Score }) {
  return (
    <article className="score-card">
      <p className="final">
        {score.final_score}
        <span>/5000</span>
      </p>
      <ul>
        {CATEGORIES.map((category) => (
          <li key={category}>
            <strong>{category}</strong> {score[category]}: {score.feedback[category]}
          </li>
        ))}
      </ul>
    </article>
  );
}
