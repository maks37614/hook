import test from 'node:test';
import assert from 'node:assert/strict';
import './fixtures/mock-exchange';
import { generateSmartAnalysis } from '../server/smartAnalysisService';

test('analysis uses actual candles, the selected venue book, real OI history and preserves zero funding', async () => {
  const output = await generateSmartAnalysis({ symbol: 'BTCUSDT', exchange: 'bybit', currentPrice: 999999 });
  assert.equal(output.currentPrice, 100, 'a caller cannot poison a shared analysis with an arbitrary price');
  assert.equal(output.orderbook?.bestBid, 99); assert.equal(output.orderbook?.bestAsk, 101);
  assert.equal(output.derivatives.binanceFundingRate, 0); assert.equal(output.derivatives.bybitFundingRate, 0);
  assert.ok(output.derivatives.binanceOI!.history.length > 1);
  assert.ok(output.derivatives.binanceOI!.change1hPct! > 0);
  assert.equal(output.trend.ema200, 100);
  assert.equal('participants' in output, false, 'wallet holders and alleged participant identities are not fabricated');
  assert.ok(!JSON.stringify(output).includes('NaN'));
});

test('missing auxiliary sources remain null and do not create a false orderbook or OI history', async () => {
  const native = globalThis.fetch;
  globalThis.fetch = (input, init) => String(input).includes('klines') || String(input).includes('/kline?') ? native(input, init) : Promise.resolve(new Response('{}', { status: 503 }));
  try {
    const output = await generateSmartAnalysis({ symbol: 'MISSINGUSDT', exchange: 'binance' });
    assert.equal(output.orderbook, null); assert.equal(output.derivatives.binanceOI, null); assert.equal(output.derivatives.bybitOI, null);
    assert.equal(output.derivatives.bybitFundingRate, null); assert.ok(output.unavailable.includes('Стакан'));
  } finally { globalThis.fetch = native; }
});

test('missing price candles cannot yield an invented analysis', async () => {
  const native = globalThis.fetch; globalThis.fetch = async () => new Response('{}', { status: 503 });
  try { await assert.rejects(generateSmartAnalysis({ symbol: 'NOCANDLESUSDT', currentPrice: 100 }), /свічок/); }
  finally { globalThis.fetch = native; }
});
