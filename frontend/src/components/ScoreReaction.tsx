import { useState } from 'react';
import { REACTIONS, reactionTier, type Reaction, type ReactionTier } from '../lib/reactions';

// One reaction (image, or muted looping video). Hides itself if the media fails to load.
function ReactionMedia({ reaction, tier }: { reaction: Reaction; tier: ReactionTier }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const hide = () => setFailed(true);
  return (
    <figure className={`score-reaction score-reaction--${tier}`}>
      {reaction.kind === 'video' ? (
        <video
          src={reaction.src}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onError={hide}
        />
      ) : (
        <img src={reaction.src} alt="" onError={hide} />
      )}
      {reaction.viaTenor && <figcaption>via Tenor</figcaption>}
    </figure>
  );
}

export default function ScoreReaction({ finalScore }: { finalScore: number }) {
  const tier = reactionTier(finalScore);
  const reaction = REACTIONS[tier];
  // key resets the failed state if the tier (and so the media) changes
  return <ReactionMedia key={reaction.src} reaction={reaction} tier={tier} />;
}
