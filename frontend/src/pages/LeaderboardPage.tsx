import { useEffect, useState } from 'react';
import { getLeaderboard } from '../lib/api';
import type { Leaderboard } from '../types/game';

export default function LeaderboardPage({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard()
      .then((b) => !cancelled && setBoard(b))
      .catch((err) => !cancelled && setError(err?.message ?? 'Could not load the leaderboard.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="results">
      <div className="results-inner">
        <h1 className="results-title">LEADERBOARD</h1>
        {board && <p className="notice">{board.day} · {board.timezone}</p>}
        {board?.demo && <p className="demo-badge">DEMO MODE</p>}

        {error && <p className="notice">{error}</p>}
        {!board && !error && <p className="notice">Loading…</p>}

        {board && board.entries.length === 0 && (
          <p className="notice">No scores yet today. Be the first.</p>
        )}

        {board && board.entries.length > 0 && (
          <ol className="board">
            {board.entries.map((e, i) => (
              <li key={`${e.rank}-${e.alias}-${i}`} className="board-row">
                <span className="board-rank">{e.rank}</span>
                <span className="board-alias">{e.alias}</span>
                <span className="board-score">{e.final_score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="results-buttons">
          <button className="btn btn--ghost" onClick={onBack}>
            ← BACK
          </button>
        </div>
      </div>
    </main>
  );
}
