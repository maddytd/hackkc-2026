// Open /tests/playPageHarness.html with VITE_API_URL=/__test_api.
// Exercises the real React page/effects with a synthetic stream and simulated API.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PlayPage from '../src/pages/PlayPage';
import type { Attempt } from '../src/types/game';

if (import.meta.env.VITE_API_URL !== '/__test_api') {
  throw new Error('Run with VITE_API_URL=/__test_api to isolate this harness.');
}
const nativeTimeout = window.setTimeout.bind(window);
const nativeInterval = window.setInterval.bind(window);
const nativeNow = performance.now.bind(performance);
const origin = nativeNow();
Object.defineProperty(performance, 'now', { value: () => (nativeNow() - origin) * 20 });
window.setInterval = ((fn: TimerHandler, delay?: number) =>
  nativeInterval(fn, (delay ?? 0) / 20)) as typeof window.setInterval;
window.setTimeout = ((fn: TimerHandler, delay?: number) =>
  nativeTimeout(fn, (delay ?? 0) / 20)) as typeof window.setTimeout;
let starts = 0;
let uploads = 0;
let polls = 0;
let final: Attempt | null = null;
let failure = '';
let initial: Attempt['status'] = 'recording';
const quota = "Gemini's daily request or token quota is exhausted. No score was created.";
const attempt = (status: Attempt['status']): Attempt => ({
  id: 'regression-attempt', day: '2026-10-11', status,
  created: Date.now() / 1000, deadline: Date.now() / 1000 + 150,
  replacement_of: null, demo: true, score: null,
  failure: status === 'judge_failed' ? quota : null,
  question: { id: 'test', text: 'Name a planet.', category: 'science', difficulty: 'easy', context: '' },
});
window.fetch = async (input, options) => {
  const path = String(input);
  if (!path.startsWith('/__test_api/')) throw new Error('Unexpected test request: ' + path);
  if (options?.method === 'PUT') { uploads++; return Response.json(attempt('completed')); }
  if (options?.method === 'POST') return Response.json(attempt(initial));
  if (path.includes('/attempts/current')) {
    return Response.json(initial === 'recording' ? null : attempt(initial));
  }
  polls++;
  return Response.json(attempt('judge_failed'));
};
class FakeRecorder {
  static isTypeSupported() { return true; }
  state = 'inactive';
  mimeType = 'video/webm';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start() { starts++; this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['synthetic-recording']) });
      this.onstop?.();
    });
  }
}
window.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder;
const streams: MediaStream[] = [];
const contexts: AudioContext[] = [];
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 120;
  canvas.getContext('2d')!.fillRect(0, 0, 160, 120);
  const stream = canvas.captureStream(10);
  const audio = new AudioContext();
  stream.addTrack(audio.createMediaStreamDestination().stream.getAudioTracks()[0]);
  streams.push(stream); contexts.push(audio);
  return stream;
} });
const root = createRoot(document.getElementById('root')!);
const onFinish = (result: Attempt) => { final = result; };
const onError = (message: string) => { failure = message; };
const sleep = (ms: number) => new Promise<void>((resolve) => nativeTimeout(resolve, ms));
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
async function until(condition: () => boolean, label: string) {
  const end = nativeNow() + 4000;
  while (!condition() && nativeNow() < end) await sleep(10);
  assert(condition(), label + ' timed out');
}
async function mount(status: Attempt['status']) {
  root.render(null); await sleep(30);
  initial = status; starts = 0; uploads = 0; polls = 0; final = null; failure = '';
  root.render(<StrictMode><PlayPage onFinish={onFinish} onError={onError} /></StrictMode>);
}
async function check(label: string, run: () => Promise<void>) {
  const row = document.createElement('li');
  document.getElementById('test-results')!.append(row);
  try { await run(); row.textContent = 'PASS: ' + label; }
  catch (error) { row.textContent = 'FAIL: ' + label + ': ' + String(error); throw error; }
}
try {
  await check('Timer advances, DONE unlocks after five seconds, and automatic stop uploads once', async () => {
    await mount('recording');
    await until(() => !!document.querySelector('.stop-btn'), 'recording start');
    assert((document.querySelector('.stop-btn') as HTMLButtonElement).disabled, 'DONE enabled too early');
    await until(() => !(document.querySelector('.stop-btn') as HTMLButtonElement)?.disabled, 'DONE unlock');
    await until(() => final !== null || !!failure, 'automatic finish');
    assert(!failure && final?.status === 'completed', 'Recording failed: ' + failure);
    assert(starts === 1 && uploads === 1, 'Expected one recording and upload');
  });
  await check('Repeated DONE clicks submit only once', async () => {
    await mount('recording');
    await until(() => !!document.querySelector('.stop-btn:not(:disabled)'), 'DONE unlock');
    const done = document.querySelector('.stop-btn') as HTMLButtonElement;
    done.click(); done.click();
    await until(() => final !== null || !!failure, 'manual finish');
    assert(!failure && uploads === 1 && starts === 1, 'Duplicate or failed upload');
  });
  await check('Reopening queued scoring polls the existing job and preserves its quota message', async () => {
    await mount('queued');
    await until(() => final !== null || !!failure, 'queue recovery');
    assert(final?.failure === quota && polls > 0, 'Quota result lost');
    assert(starts === 0 && uploads === 0, 'Recovery recorded or uploaded again');
  });
  await check('Reopening a failed judgment shows its result without another recording', async () => {
    await mount('judge_failed');
    await until(() => final !== null || !!failure, 'failure recovery');
    assert(final?.failure === quota && starts === 0 && uploads === 0, 'Failed attempt restarted');
  });
  document.body.dataset.result = 'passed';
} catch {
  document.body.dataset.result = 'failed';
} finally {
  root.unmount();
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  await Promise.all(contexts.map((context) => context.close()));
}
