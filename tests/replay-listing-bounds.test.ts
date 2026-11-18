import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchReplayHistoryBoundary, resolveReplayHistoryDate,
} from '../src/utils/replayHistoryAvailability';

test('Replay never requests a known pre-listing date and keeps the real chosen date', () => {
  const first = Date.UTC(2026, 4, 15, 14);
  const now = Date.UTC(2026, 10, 16, 12);
  const selected = new Date(Date.UTC(2025, 7, 13));
  const manual = resolveReplayHistoryDate(selected, first, '1h', false, now);
  assert.equal(manual.adjusted, true);
  assert.ok(manual.date.getTime() >= first);
  assert.ok(manual.date.getTime() <= now);
  assert.equal(manual.date.getTime(), first + 280 * 3_600_000);

  const random = resolveReplayHistoryDate(selected, first, '1h', true, now, () => 0.5);
  assert.ok(random.date.getTime() >= first);
  assert.ok(random.date.getTime() <= now - 2 * 3_600_000);
  assert.notEqual(random.date.getTime(), manual.date.getTime());

  const existing = new Date(Date.UTC(2026, 7, 1, 12));
  assert.deepEqual(resolveReplayHistoryDate(existing, first, '1h', false, now),
    { date: existing, adjusted: false });
  assert.deepEqual(resolveReplayHistoryDate(selected, null, '1h', false, now),
    { date: selected, adjusted: false });
});

test('A recently listed instrument cannot produce an invented date before its first candle', () => {
  const now = Date.UTC(2026, 10, 16, 12);
  const first = now - 4 * 86_400_000;
  const random = resolveReplayHistoryDate(new Date(now - 200 * 86_400_000),
    first, '1m', true, now, () => 0);
  assert.ok(random.date.getTime() >= first);
  assert.ok(random.date.getTime() < now);
});

test('Replay availability shares identical browser requests and caches the result', async t => {
  let calls = 0;
  const first = Date.UTC(2026, 4, 15);
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    assert.match(String(url), /\/api\/replay\/history-bounds\?/);
    calls += 1;
    return Response.json({ success: true, firstCandleMs: first });
  });
  const instrument = ['binance', 'futures', 'REPLAYBOUNDSCHECKUSDT'] as const;
  const [a, b] = await Promise.all([
    fetchReplayHistoryBoundary(...instrument),
    fetchReplayHistoryBoundary(...instrument),
  ]);
  assert.equal(a, first);
  assert.equal(b, first);
  assert.equal(await fetchReplayHistoryBoundary(...instrument), first);
  assert.equal(calls, 1);
});
