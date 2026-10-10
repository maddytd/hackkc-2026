import { useEffect, useRef, useState } from 'react';

export type WebcamState = 'idle' | 'requesting' | 'live' | 'denied' | 'error';

// Requests the camera + mic and streams it into a <video>. Exposes the MediaStream so a
// recorder can capture it. Tracks are stopped on unmount so the camera light turns off.
export function useWebcam(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
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
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
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
      setStream(null);
    };
  }, [active]);

  return { videoRef, state, stream };
}
