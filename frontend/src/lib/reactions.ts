// Reaction shown on the results screen, picked by final score (0-5000).
export type ReactionTier = 'elite' | 'good' | 'meh' | 'bad';

export function reactionTier(finalScore: number): ReactionTier {
  if (finalScore >= 4000) return 'elite';
  if (finalScore >= 2500) return 'good';
  if (finalScore >= 1000) return 'meh';
  return 'bad';
}

// Files live in frontend/public/reactions/. To swap a still for a GIF, drop the
// file in that folder and change its path here. A missing file just hides the reaction.
export const REACTION_SRC: Record<ReactionTier, string> = {
  elite: '/reactions/elite.jpg',
  good: '/reactions/good.jpg',
  meh: '/reactions/meh.jpg',
  bad: '/reactions/bad.jpg',
};
