import test from 'node:test';
import assert from 'node:assert/strict';
import { priceBucketStep, emptyHistoricalFootprint, appendHistoricalFootprint } from '../src/utils/domHistory';
import { fetchDomTradeHistoryPage } from '../server/domTradeHistory';

const trade = (id: string, price: number, vol: number, ms: number, sell = false) =>
  ({ id, price, qty: vol / price, volumeUsd: vol, isBuyerMaker: sell, timestamp: ms });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test('historical footprints sum every real trade across pages without capping tape at 20k', () => {
  const step = priceBucketStep(102, 100, .01);
  let col = emptyHistoricalFootprint(1_000_000);
  col = appendHistoricalFootprint(col, [trade('1', 100, 100, 1), trade('2', 100, 200, 2, true)], step, .01, false);
  col = appendHistoricalFootprint(col, [trade('3', 101, 40, 3)], step, .01, true);
  assert.equal(col.tradeCount, 3);
  assert.equal(col.totalVolume, 340);
  assert.equal(Object.values(col.levels).reduce((a, b) => a + b.buyVol + b.sellVol, 0), 340);
  assert.equal(Object.values(col.levels).filter(l => l.isPOC).length, 1);
  assert.equal(col.complete, true);
});

test('Binance history advances fromId and stops at exclusive candle end', async () => {
  const now = Date.now();
  const begin = now - 120000;
  const end = begin + 60000;
  const calls: URL[] = [];
  const request = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    if (!url.searchParams.has('fromId')) {
      const batch = Array.from({ length: 1000 }, (_, i) => ({ a: i + 10, p: '100', q: '1', T: begin + i * 5, m: false }));
      return json(batch);
    }
    return json([
      { a: 1010, p: '100', q: '3', T: begin + 10000, m: true },
      { a: 1011, p: '100', q: '2', T: end, m: true },
    ]);
  };
  const first = await fetchDomTradeHistoryPage({ exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', startTime: begin, endTime: end }, request as typeof fetch);
  assert.equal(first.complete, false);
  assert.equal(first.trades.length, 1000);
  assert.equal(first.nextFromId, 1010);
  const second = await fetchDomTradeHistoryPage({ exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', startTime: begin, endTime: end, fromId: first.nextFromId! }, request as typeof fetch);
  assert.equal(second.complete, true);
  assert.deepEqual(second.trades.map(x => x.id), ['1010']);
  assert.equal(calls[1].searchParams.get('fromId'), '1010');
  assert.equal(calls[1].searchParams.has('startTime'), false);
});

test('Bybit marks unbounded recent-trade sample incomplete, never falsely historical', async () => {
  const now = Date.now();
  const begin = now - 90000, end = now - 30000;
  const request = async () => json({
    retCode: 0, result: { list: [
      { execId: 'b1', price: '101', size: '2', side: 'Buy', time: String(now - 60000) },
    ] },
  });
  const result = await fetchDomTradeHistoryPage({ exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT', startTime: begin, endTime: end }, request as typeof fetch);
  assert.equal(result.complete, false);
  assert.equal(result.trades.length, 1);
  const older = await fetchDomTradeHistoryPage({ exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT', startTime: now - 50000, endTime: now - 30000 }, request as typeof fetch);
  assert.equal(older.complete, true);
});

test('Trade history rejects illegal time range and cursor without calling exchange', async () => {
  let called = false;
  const request = async () => { called = true; return json([]); };
  await assert.rejects(fetchDomTradeHistoryPage({ exchange: 'binance', marketType: 'spot', symbol: 'BTCUSDT', startTime: 0, endTime: 4_000_000 }, request as typeof fetch), RangeError);
  assert.equal(called, false);
});
