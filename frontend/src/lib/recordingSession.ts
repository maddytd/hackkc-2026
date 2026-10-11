function pickMimeType(): string | undefined {
  return [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

type Session = {
  recorder: MediaRecorder;
  result: Promise<Blob>;
  stopping: boolean;
  finished: boolean;
};

export class RecordingSession {
  private session: Session | null = null;

  start(stream: MediaStream): void {
    if (this.session && !this.session.finished) throw new Error('Recording already started.');
    for (const kind of ['audio', 'video']) {
      if (!stream.getTracks().some((track) => track.kind === kind && track.readyState === 'live')) {
        throw new Error('Allow camera and microphone access before recording.');
      }
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 1_000_000,
      audioBitsPerSecond: 96_000,
    });
    const chunks: BlobPart[] = [];
    let resolve!: (blob: Blob) => void;
    let reject!: (error: Error) => void;
    const result = new Promise<Blob>((yes, no) => { resolve = yes; reject = no; });
    void result.catch(() => {});
    const session: Session = { recorder, result, stopping: false, finished: false };
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      session.finished = true;
      reject(new Error('The browser could not record your camera and microphone.'));
    };
    recorder.onstop = () => {
      session.finished = true;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (!blob.size) {
        reject(new Error('The browser captured no recording. Check camera and microphone permissions.'));
      } else {
        resolve(blob);
      }
    };
    this.session = session;
    try {
      recorder.start(250);
    } catch (error) {
      session.finished = true;
      reject(error instanceof Error ? error : new Error('Recording could not start.'));
      throw error;
    }
  }

  stop(): Promise<Blob> {
    const session = this.session;
    if (!session) return Promise.reject(new Error('Recording has not started.'));
    if (!session.stopping && !session.finished && session.recorder.state !== 'inactive') {
      session.stopping = true;
      session.recorder.stop();
    }
    return session.result;
  }

  dispose(): void {
    if (this.session && !this.session.finished) void this.stop().catch(() => {});
  }
}
