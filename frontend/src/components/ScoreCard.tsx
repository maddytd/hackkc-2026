import type { Score } from '../types/game';

const CATEGORIES: { key: keyof Score['feedback']; label: string }[] = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'delivery', label: 'Delivery' },
];

const MAX = 5000;

export default function ScoreCard({ score }: { score: Score }) {
  return (
    <div className="score-card">
      <div className="final">
        <span className="final-num">{score.final_score.toLocaleString()}</span>
        <span className="final-max">/ {MAX.toLocaleString()}</span>
      </div>
      <ul className="score-list">
        {CATEGORIES.map(({ key, label }) => {
          const points = score[key];
          return (
            <li key={key}>
              <div className="score-row">
                <strong>{label}</strong>
                <span>{points.toLocaleString()}</span>
              </div>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${(points / MAX) * 100}%` }} />
              </div>
              <p className="score-feedback">{score.feedback[key]}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
