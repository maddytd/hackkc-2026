import { useEffect, useRef, useState } from 'react';

export type WebcamState = 'idle' | 'requesting' | 'live' | 'denied' | 'error';

// Requests the camera (and mic, which the game needs) and streams it into a <video>.
// Tracks are stopped on unmount so the camera light turns off when you leave.
export function useWebcam(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<WebcamState>('idle');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setState('requesting');

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setState('live');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active]);

  return { videoRef, state };
}
