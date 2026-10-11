import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/recordingSession.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { RecordingSession } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

class FakeRecorder {
  static instances = [];
  static isTypeSupported() { return true; }
  state = 'inactive';
  stops = 0;
  constructor(stream, options) {
    this.options = options;
    this.mimeType = options.mimeType;
    FakeRecorder.instances.push(this);
  }
  start(timeslice) { this.state = 'recording'; this.timeslice = timeslice; }
  stop() { this.state = 'inactive'; this.stops++; }
  data(text) { this.ondataavailable({ data: new Blob([text]) }); }
  finish() { this.onstop(); }
}

const liveStream = () => ({ getTracks: () => [
  { kind: 'audio', readyState: 'live' }, { kind: 'video', readyState: 'live' },
] });

beforeEach(() => {
  FakeRecorder.instances = [];
  globalThis.MediaRecorder = FakeRecorder;
});

test('simultaneous timer and Done stops share the final nonempty recording', async () => {
  const session = new RecordingSession();
  session.start(liveStream());
  const recorder = FakeRecorder.instances[0];
  const timerStop = session.stop();
  const buttonStop = session.stop();
  assert.equal(timerStop, buttonStop);
  assert.equal(recorder.stops, 1);
  recorder.data('final video bytes');
  recorder.finish();
  assert.equal(await (await timerStop).text(), 'final video bytes');
  assert.equal((await buttonStop).type, recorder.mimeType);
});

test('inactive recorder still waits for the browsers final events', async () => {
  const session = new RecordingSession();
  session.start(liveStream());
  const recorder = FakeRecorder.instances[0];
  recorder.state = 'inactive';
  let resolved = false;
  const result = session.stop().then((blob) => { resolved = true; return blob; });
  await Promise.resolve();
  assert.equal(resolved, false);
  recorder.data('last chunk');
  recorder.finish();
  assert.equal(await (await result).text(), 'last chunk');
});

test('empty recordings reject instead of becoming uploadable blobs', async () => {
  const session = new RecordingSession();
  session.start(liveStream());
  const result = session.stop();
  FakeRecorder.instances[0].finish();
  await assert.rejects(result, /captured no recording/);
});

test('recording cannot start without both live camera and microphone tracks', () => {
  const session = new RecordingSession();
  assert.throws(() => session.start({ getTracks: () => [] }), /camera and microphone/);
  assert.equal(FakeRecorder.instances.length, 0);
});

test('duplicate start cannot replace the active recorder or clear its data', async () => {
  const session = new RecordingSession();
  session.start(liveStream());
  FakeRecorder.instances[0].data('first chunk');
  assert.throws(() => session.start(liveStream()), /already started/);
  assert.equal(FakeRecorder.instances.length, 1);
  const result = session.stop();
  FakeRecorder.instances[0].finish();
  assert.equal(await (await result).text(), 'first chunk');
});

test('late old recorder callbacks cannot corrupt a subsequent recording', async () => {
  const session = new RecordingSession();
  session.start(liveStream());
  const old = FakeRecorder.instances[0];
  const first = session.stop();
  old.data('old');
  old.finish();
  await first;
  session.start(liveStream());
  old.data('late old data');
  old.finish();
  const next = session.stop();
  FakeRecorder.instances[1].data('new');
  FakeRecorder.instances[1].finish();
  assert.equal(await (await next).text(), 'new');
});

test('recorder requests periodic chunks and a bounded video bitrate', () => {
  const session = new RecordingSession();
  session.start(liveStream());
  assert.equal(FakeRecorder.instances[0].timeslice, 250);
  assert.equal(FakeRecorder.instances[0].options.videoBitsPerSecond, 1_000_000);
});
