import { useEffect, useState } from 'react';
import { RecordingSession } from '../lib/recordingSession';

// Records a MediaStream and resolves with the finished Blob when stopped.
// The returned object is stable across renders so it is safe in effect deps.
export function useRecorder() {
  const [recorder] = useState(() => new RecordingSession());
  useEffect(() => () => recorder.dispose(), [recorder]);
  return recorder;
}
