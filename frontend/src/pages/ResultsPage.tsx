import BrandHome from '../components/BrandHome';
import CinematicBackdrop from '../components/CinematicBackdrop';
import Playback from '../components/Playback';
import ScoreReaction from '../components/ScoreReaction';
import TakeBreakdown from '../components/TakeBreakdown';
import type { Attempt } from '../types/game';

// Thumbnails that drift behind the results, faded like the end-of-heist screen.
// Results-only images; none of these appear on the title screen.
const RESULT_SCENES = [
  '/results/what-does-he-even-do.jpg',
  '/results/lets-talk.jpg',
  '/results/useless-info.webp',
  '/results/feels-the-larp.webp',
  '/results/no-limit-to-the-larp.webp',
  '/results/one-percent.webp',
];

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
      <div className="results-backdrop" aria-hidden="true">
        <CinematicBackdrop sources={RESULT_SCENES} />
        <div className="results-fade" />
      </div>
      <header className="page-head">
        <BrandHome onHome={onBack} />
        <nav className="page-links" aria-label="Results">
          <button onClick={onBack}>
            <span>←</span> HOME
          </button>
          <button onClick={onLeaderboard}>
            LEADERBOARD <span>↗</span>
          </button>
        </nav>
      </header>
      <div className="results-inner">
        {scored ? (
          <>
            <h1 className="results-title">{verdict(scored.final_score)}</h1>
            {attempt.question && <p className="results-subtitle">{attempt.question.text}</p>}
            {attempt.demo && <p className="demo-badge">DEMO MODE — not a real evaluation</p>}
            <ScoreReaction finalScore={scored.final_score} />
            <TakeBreakdown score={scored} question={attempt.question} />
          </>
        ) : (
          <>
            <h1 className="results-title">
              {attempt.status === 'judge_failed' ? 'SCORING UNAVAILABLE' : "THAT ONE DIDN'T COUNT"}
            </h1>
            {attempt.question && (
              <div className="results-question">
                <span className="tag">{attempt.question.category}</span>
                <h2>{attempt.question.text}</h2>
              </div>
            )}
            <p className="notice">{attempt.failure ?? 'Your attempt could not be scored.'}</p>
          </>
        )}

        {recordingUrl ? (
          <Playback src={recordingUrl} />
        ) : (
          <p className="notice">Only your latest recording is kept, on the device you played on.</p>
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
