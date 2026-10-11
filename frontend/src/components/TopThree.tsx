import { useEffect, useState } from 'react';
import { getLeaderboard } from '../lib/api';
import type { LeaderboardEntry } from '../types/game';

// Today's top three, shown under the LARPLE logo on the title screen.
export default function TopThree({
  day,
  onLeaderboard,
}: {
  day?: string;
  onLeaderboard: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard(day)
      .then((board) => {
        if (cancelled) return;
        setEntries(board.entries.slice(0, 3));
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [day]);

  return (
    <section className="menu-top3" aria-labelledby="menu-top3-title">
      <h2 id="menu-top3-title">TODAY’S TOP 3</h2>
      {failed ? (
        <p className="menu-top3-note">Leaderboard is unavailable right now.</p>
      ) : entries === null ? (
        <p className="menu-top3-note">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="menu-top3-note">No scores yet today. Be the first.</p>
      ) : (
        <ol>
          {entries.map((e, i) => (
            <li key={`${e.rank}-${e.alias}-${i}`} className={`menu-top3-row menu-top3-row--${Math.min(e.rank, 4)}`}>
              <span className="menu-top3-rank">{e.rank}</span>
              <span className="menu-top3-alias">{e.alias}</span>
              <span className="menu-top3-score">{e.final_score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      <button className="menu-top3-link" onClick={onLeaderboard}>
        FULL LEADERBOARD <span>↗</span>
      </button>
    </section>
  );
}
