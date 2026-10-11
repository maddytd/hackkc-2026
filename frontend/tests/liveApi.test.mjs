// Read-only smoke checks against a running local AWS API; no AI calls or account writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const url = process.env.LARP_SMOKE_API_URL ?? 'http://localhost:8000';
const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
  .replace('import.meta.env.VITE_API_URL', JSON.stringify(url));
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('current frontend API client reads AWS health and processing disclosure', async () => {
  const health = await api.getHealth();
  assert.equal(health.status, 'ok');
  assert.equal(health.judge_mode, 'aws');
  assert.match(health.processing_notice, /Bedrock/);
  assert.match(health.processing_notice, /TwelveLabs/);
});

test('current frontend API client reads real scores in the expected UI format', async () => {
  const board = await api.getLeaderboard(process.env.LARP_SMOKE_DAY);
  assert.equal(board.demo, false);
  // The server labels its day rollover offset, e.g. "UTC-05:00" for US Central daylight time.
  assert.match(board.timezone, /^UTC[+-]\d{2}:00$/);
  assert.ok(Array.isArray(board.entries));
  if (process.env.LARP_SMOKE_DAY) {
    assert.equal(board.day, process.env.LARP_SMOKE_DAY);
    assert.ok(board.entries.length > 0, 'Expected an existing scored test day');
  }
  for (const entry of board.entries) {
    assert.equal(typeof entry.alias, 'string');
    assert.ok(Number.isInteger(entry.rank) && entry.rank > 0);
    for (const category of ['accuracy', 'confidence', 'delivery', 'final_score']) {
      assert.ok(Number.isInteger(entry[category]));
      assert.ok(entry[category] >= 0 && entry[category] <= 5000);
    }
  }
});
