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
  // 'image' covers stills and GIFs. 'video' (muted, looping) is lighter, but some browsers
  // (e.g. Safari) refuse to autoplay it and show a black box, so the reactions use GIFs.
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
    src: 'https://media.tenor.com/JuIJXxDnQIMAAAAd/flight-reacts-stranger-things.gif',
    kind: 'image',
    viaTenor: true,
  },
  // 1000-2499: unimpressed stare (no GIF of this one exists; still supplied by the team)
  meh: { src: '/reactions/meh.jpg', kind: 'image' },
  // < 1000: jaw drop
  bad: {
    src: 'https://media.tenor.com/hZ8DNkvJitgAAAAd/flight-reacts-flight-reacts-stare.gif',
    kind: 'image',
    viaTenor: true,
  },
};

// Start downloading every reaction in the background (called when the play screen opens), so
// the one the player earns is already cached when results appear instead of loading then.
const preloaded: HTMLImageElement[] = [];
export function preloadReactions() {
  if (preloaded.length) return;
  for (const reaction of Object.values(REACTIONS)) {
    if (reaction.kind !== 'image') continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = reaction.src;
    preloaded.push(img); // keep a reference so the download isn't dropped
  }
}
