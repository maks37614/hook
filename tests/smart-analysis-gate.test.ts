import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SmartAnalysisGate } from '../server/smartAnalysisGate';

test('Quant endpoint validates inputs and uses a bounded public request gate', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(server, /app.get\('\/api\/market\/smart-analysis'/);
  assert.match(server, /smartAnalysisGate\.enter\(req\.ip \|\| 'unknown'\)/);
  assert.match(server, /admission\.release\(\)/);
  assert.match(server, /INVALID_ANALYSIS_INPUT/);
  assert.doesNotMatch(server, /\/api\/ai\/|geminiService|GEMINI_API_KEY/);
});

test('per-IP capacity resets and independent visitors do not steal each others quota', () => {
  let now = 10_000;
  const gate = new SmartAnalysisGate(() => now, 2, 4);
  const first = gate.enter('a');
  assert.equal(first.status, 'ok');
  if (first.status === 'ok') first.release();
  const second = gate.enter('a');
  assert.equal(second.status, 'ok');
  if (second.status === 'ok') second.release();
  const limit = gate.enter('a');
  assert.equal(limit.status, 'rate_limited');
  assert.equal(gate.enter('b').status, 'ok');
  now += 60_001;
  assert.equal(gate.enter('a').status, 'ok');
});

test('global concurrent cap releases once, including after request errors', () => {
  const gate = new SmartAnalysisGate(() => 1, 50, 1);
  const first = gate.enter('a');
  assert.equal(first.status, 'ok');
  assert.deepEqual(gate.enter('b'), { status: 'busy', retryAfterSeconds: 5 });
  if (first.status === 'ok') { first.release(); first.release(); }
  assert.equal(gate.enter('b').status, 'ok');
});

test('same public instrument joins an in-flight calculation but private inputs bypass it', () => {
  const service = readFileSync(new URL('../server/smartAnalysisService.ts', import.meta.url), 'utf8');
  assert.match(service, /const activePublicAnalyses = new Map<string, Promise<SmartAnalysisData>>\(\)/);
  assert.match(service, /if \(params\.formation \|\| params\.klines\?\.length\) return calculateSmartAnalysis\(params\)/);
  assert.match(service, /const pending = activePublicAnalyses\.get\(key\)/);
  assert.match(service, /activePublicAnalyses\.set\(key, operation\)/);
  assert.match(service, /activePublicAnalyses\.delete\(key\)/);
});
