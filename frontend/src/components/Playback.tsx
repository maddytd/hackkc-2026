import { useRef, useState } from 'react';

// Plays back the recording mirrored (to match the live selfie preview). Native video
// controls can't be mirrored independently of the picture, so we use a tap-to-play
// overlay that stays upright instead.
export default function Playback({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  return (
    <button className="playback-wrap" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
      <video
        ref={ref}
        className="playback"
        src={src}
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {!playing && <span className="playback-play">▶</span>}
    </button>
  );
}
