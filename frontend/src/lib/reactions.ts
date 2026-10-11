// Reaction shown on the results screen, picked by final score (0-5000).
export type ReactionTier = 'elite' | 'good' | 'meh' | 'bad';

export function reactionTier(finalScore: number): ReactionTier {
  if (finalScore >= 4000) return 'elite';
  if (finalScore >= 2500) return 'good';
  if (finalScore >= 1000) return 'meh';
  return 'bad';
}

export type Reaction = {
  src: string;
  // 'video' plays muted and looping like a GIF; Tenor's MP4s are far smaller than its GIFs.
  kind: 'image' | 'video';
  // Shown as a small "via Tenor" credit for media embedded from Tenor.
  viaTenor?: boolean;
};

// FlightReacts reactions. Tenor media is embedded from Tenor's CDN (not re-hosted);
// local files live in frontend/public/reactions/. A file that fails to load hides the reaction.
export const REACTIONS: Record<ReactionTier, Reaction> = {
  // >= 4000: tongue out (Tenor only has this one as a still)
  elite: {
    src: 'https://media.tenor.com/naLfAmeZGOgAAAAC/flight-reacts.gif',
    kind: 'image',
    viaTenor: true,
  },
  // 2500-3999: wide-eyed stare
  good: {
    src: 'https://media.tenor.com/JuIJXxDnQIMAAAPo/flight-reacts-stranger-things.mp4',
    kind: 'video',
    viaTenor: true,
  },
  // 1000-2499: unimpressed stare (no GIF of this one exists; still supplied by the team)
  meh: { src: '/reactions/meh.jpg', kind: 'image' },
  // < 1000: jaw drop
  bad: {
    src: 'https://media.tenor.com/hZ8DNkvJitgAAAPo/flight-reacts-flight-reacts-stare.mp4',
    kind: 'video',
    viaTenor: true,
  },
};
