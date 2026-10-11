import { useEffect, useState } from 'react';

const scenes = ['does-he-know', 'hold-up', 'raven', 'cooking', 'lying', 'brains', 'doomed'];
const SCENE_MS = 9000;

// Flat artwork moves on its own plane over a softer, slower background layer.
export default function CinematicBackdrop({ paused = false }: { paused?: boolean }) {
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
      {scenes.map((name, index) => {
        const active = scene % scenes.length === index;
        const previous = scene > 0 && (scene - 1) % scenes.length === index;
        return (
          <div
            key={name}
            className={`cinematic-scene ${active ? 'is-active' : ''} ${previous ? 'is-previous' : ''}`}
          >
            <img className="cinematic-glow" src={`/backgrounds/${name}.jpg`} alt="" />
            <div className={`cinematic-plane ${index % 2 ? 'cinematic-plane--reverse' : ''}`}>
              <img src={`/backgrounds/${name}.jpg`} alt="" decoding="async" />
            </div>
          </div>
        );
      })}
      <div className="cinematic-shade" />
    </div>
  );
}
