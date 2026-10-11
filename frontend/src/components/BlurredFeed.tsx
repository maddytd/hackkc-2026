import { useEffect, useRef } from 'react';

// A second, display-only view of the live camera, blurred to fill the screen behind the
// recording frame. It only shows the same stream; the recorder is untouched.
export default function BlurredFeed({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      className={`feed-blur ${stream ? 'is-live' : ''}`}
      muted
      playsInline
      autoPlay
      aria-hidden="true"
    />
  );
}
