import { useState } from 'react';
import { REACTION_SRC, reactionTier } from '../lib/reactions';

// Reaction image/GIF for the score tier. Hides itself if the file is missing.
function Reaction({ src, tier }: { src: string; tier: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <figure className={`score-reaction score-reaction--${tier}`}>
      <img src={src} alt="" onError={() => setFailed(true)} />
    </figure>
  );
}

export default function ScoreReaction({ finalScore }: { finalScore: number }) {
  const tier = reactionTier(finalScore);
  const src = REACTION_SRC[tier];
  // key resets the missing-file state if the tier (and so the file) changes
  return <Reaction key={src} src={src} tier={tier} />;
}
