import { useCallback, useMemo, useRef } from 'react';

// Picks a recording container the browser and backend both accept (WebM or MP4).
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

// Records a MediaStream and resolves with the finished Blob when stopped.
// The returned object is stable across renders so it is safe in effect deps.
export function useRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const resolveRef = useRef<((blob: Blob) => void) | null>(null);

  const start = useCallback((stream: MediaStream) => {
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      resolveRef.current?.(blob);
      resolveRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(chunksRef.current, { type: 'video/webm' }));
        return;
      }
      resolveRef.current = resolve;
      recorder.stop();
      recorderRef.current = null;
    });
  }, []);

  return useMemo(() => ({ start, stop }), [start, stop]);
}
