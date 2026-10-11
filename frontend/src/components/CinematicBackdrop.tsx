import { useEffect, useState } from 'react';

// Title screen scenes. The results screen has its own set.
const MENU_SCENES = [
  'what-did-he-see',
  'does-he-know',
  'hold-up',
  'raven',
  'cooking',
  'lying',
  'brains',
  'doomed',
].map((name) => `/backgrounds/${name}.jpg`);
const SCENE_MS = 9000;

// Fisher-Yates shuffle, so each visit plays the thumbnails in a fresh random order.
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Flat artwork moves on its own plane over a softer, slower background layer.
// `sources` swaps in a different image set (e.g. the results screen); defaults to the menu's.
export default function CinematicBackdrop({
  paused = false,
  sources = MENU_SCENES,
}: {
  paused?: boolean;
  sources?: string[];
}) {
  // Picked once per mount: a new random order every time the screen opens.
  const [scenes] = useState(() => shuffled(sources));
  const [scene, setScene] = useState(0);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setInterval(() => setScene((n) => n + 1), SCENE_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduced]);

  return (
    <div className={`cinematic ${paused || reduced ? 'cinematic--paused' : ''}`} aria-hidden="true">
      {scenes.map((src, index) => {
        const active = scene % scenes.length === index;
        const previous = scene > 0 && (scene - 1) % scenes.length === index;
        return (
          <div
            key={src}
            className={`cinematic-scene ${active ? 'is-active' : ''} ${previous ? 'is-previous' : ''}`}
          >
            <img className="cinematic-glow" src={src} alt="" />
            <div className={`cinematic-plane ${index % 2 ? 'cinematic-plane--reverse' : ''}`}>
              <img src={src} alt="" decoding="async" />
            </div>
          </div>
        );
      })}
      <div className="cinematic-shade" />
    </div>
  );
}
