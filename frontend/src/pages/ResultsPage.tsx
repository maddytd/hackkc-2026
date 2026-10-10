import ScoreCard from '../components/ScoreCard';
import type { Attempt } from '../types/game';

export default function ResultsPage({
  attempt,
  recordingUrl,
  onLeaderboard,
  onBack,
  onRetry,
}: {
  attempt: Attempt;
  recordingUrl: string | null;
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
          <h1 className="results-title">{verdict(scored.final_score)}</h1>
        ) : (
          <h1 className="results-title">THAT ONE DIDN'T COUNT</h1>
        )}
        {attempt.demo && <p className="demo-badge">DEMO MODE — not a real evaluation</p>}

        {attempt.question && (
          <div className="results-question">
            <span className="tag">{attempt.question.category}</span>
            <h2>{attempt.question.text}</h2>
          </div>
        )}

        {recordingUrl ? (
          <video className="playback" src={recordingUrl} controls playsInline />
        ) : (
          <p className="notice">Your recording is only saved on the device you played on.</p>
        )}

        {scored ? (
          <ScoreCard score={scored} />
        ) : (
          <p className="notice">{attempt.failure ?? 'Your attempt could not be scored.'}</p>
        )}

        <div className="results-buttons">
          {canRetry && (
            <button className="btn btn--play" onClick={onRetry}>
              ▶ TRY AGAIN
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
