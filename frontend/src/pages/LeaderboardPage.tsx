import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import BrandHome from '../components/BrandHome';
import CinematicBackdrop from '../components/CinematicBackdrop';
import { getAlias, getLeaderboard } from '../lib/api';
import type { Leaderboard, LeaderboardEntry } from '../types/game';

const fmt = (n: number) => n.toLocaleString();

function formatDay(day: string): string {
  return new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Gold / silver / bronze follow the rank, so tied players share a colour.
function tier(rank: number): string {
  return rank <= 3 ? `lb-row--top${rank}` : '';
}

// Game-style daily leaderboard: transparent rows, top three ranks gold/silver/bronze,
// your own row in Larple yellow and pinned to the bottom.
export default function LeaderboardPage({ onBack, day }: { onBack: () => void; day?: string }) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState(false);
  const me = getAlias()?.toLowerCase() ?? null;

  useEffect(() => {
    let cancelled = false;
    getLeaderboard(day)
      .then((b) => !cancelled && setBoard(b))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [day]);

  const isMe = (e: LeaderboardEntry) => me !== null && e.alias.toLowerCase() === me;
  const mine = board?.entries.find(isMe);

  return (
    <main className="lb">
      <div className="lb-backdrop" aria-hidden="true">
        <CinematicBackdrop />
        <div className="lb-tint" />
      </div>

      <header className="page-head">
        <BrandHome onHome={onBack} />
        <nav className="page-links" aria-label="Leaderboard">
          <button onClick={onBack}>
            <span>←</span> HOME
          </button>
        </nav>
      </header>

      <section className={`lb-panel ${mine ? 'lb-panel--pinned' : ''}`} aria-labelledby="lb-title">
        <h1 id="lb-title" className="lb-title">
          LEADERBOARD
        </h1>
        <div className="lb-meta">
          <span className="lb-tab">DAILY</span>
          {board && <span className="lb-day">{formatDay(board.day)}</span>}
          {board?.demo && <span className="lb-demo">Demo scores</span>}
        </div>

        {error && (
          <p className="lb-note">Couldn’t load the leaderboard. Check your connection and reopen it.</p>
        )}
        {!board && !error && <p className="lb-note">Loading today’s scores…</p>}
        {board && board.entries.length === 0 && (
          <p className="lb-note">No scores yet today. Answer today’s question to take the top spot.</p>
        )}

        {board && board.entries.length > 0 && (
          <>
            <div className="lb-cols" aria-hidden="true">
              <span>RANK</span>
              <span>PLAYER</span>
              <span className="lb-stat">ACCURACY</span>
              <span className="lb-stat">CONFIDENCE</span>
              <span className="lb-stat">DELIVERY</span>
              <span className="lb-score-col">SCORE</span>
            </div>
            <ol className="lb-list">
              {board.entries.map((e, i) => (
                <li
                  key={`${e.rank}-${e.alias}-${i}`}
                  className={`lb-row ${tier(e.rank)} ${isMe(e) ? 'is-me' : ''}`}
                  style={{ '--i': Math.min(i, 12) } as CSSProperties}
                  aria-label={`Rank ${e.rank}, ${e.alias}, ${fmt(e.final_score)} points`}
                >
                  <span className="lb-rank">{e.rank}</span>
                  <span className="lb-name">
                    {e.alias}
                    {isMe(e) && <em>You</em>}
                  </span>
                  <span className="lb-stat">{fmt(e.accuracy)}</span>
                  <span className="lb-stat">{fmt(e.confidence)}</span>
                  <span className="lb-stat">{fmt(e.delivery)}</span>
                  <span className="lb-score">{fmt(e.final_score)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {mine && (
        <aside className="lb-you" aria-label="Your rank">
          <span className="lb-you-label">YOUR RANK</span>
          <span className="lb-rank">{mine.rank}</span>
          <span className="lb-name">{mine.alias}</span>
          <span className="lb-score">{fmt(mine.final_score)}</span>
        </aside>
      )}
    </main>
  );
}
