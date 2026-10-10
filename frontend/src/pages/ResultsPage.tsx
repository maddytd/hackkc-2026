import ScoreCard from '../components/ScoreCard';
import type { Attempt } from '../types/game';

export default function ResultsPage({
  attempt,
  onLeaderboard,
  onBack,
  onRetry,
}: {
  attempt: Attempt;
  onLeaderboard: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  const scored = attempt.score;
  const canRetry = attempt.status === 'upload_failed';

  return (
    <main className="results">
      <div className="results-inner">
        {scored ? (
          <>
            <h1 className="results-title">{verdict(scored.final_score)}</h1>
            {attempt.demo && <p className="demo-badge">DEMO MODE — not a real evaluation</p>}
            <ScoreCard score={scored} />
          </>
        ) : (
          <>
            <h1 className="results-title">THAT ONE DIDN'T COUNT</h1>
            <p className="notice">{attempt.failure ?? 'Your attempt could not be scored.'}</p>
          </>
        )}

        <div className="results-buttons">
          {canRetry && (
            <button className="btn btn--play" onClick={onRetry}>
              ▶ TRY A NEW QUESTION
            </button>
          )}
          <button className="btn btn--play" onClick={onLeaderboard}>
            LEADERBOARD
          </button>
          <button className="btn btn--ghost" onClick={onBack}>
            HOME
          </button>
        </div>
      </div>
    </main>
  );
}

function verdict(finalScore: number): string {
  if (finalScore >= 4000) return 'HE KNOWS.';
  if (finalScore >= 2500) return 'HE MIGHT KNOW…';
  return 'HE HAS NO IDEA.';
}
