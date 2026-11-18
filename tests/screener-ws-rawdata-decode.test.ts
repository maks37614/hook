import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeScreenerQuoteRawData, parseScreenerSubscription } from '../server/screenerLiveQuotes';

const payload = {
  type: 'subscribe',
  scopes: [
    { exchange: 'binance', marketType: 'futures', symbol: '牛来USDT' },
    { exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT' },
  ],
};
const bytes = Buffer.from(JSON.stringify(payload), 'utf8');

test('Screener quote subscriptions decode every ws RawData representation', () => {
  const variants = [
    bytes,
    Uint8Array.from(bytes).buffer as ArrayBuffer,
    [bytes.subarray(0, 4), bytes.subarray(4, 17), bytes.subarray(17)],
  ];
  for (const data of variants) {
    const decoded = decodeScreenerQuoteRawData(data);
    assert.equal(decoded, bytes.toString('utf8'));
    const scopes = parseScreenerSubscription(JSON.parse(decoded));
    assert.equal(scopes?.length, 2);
    assert.equal(scopes?.[0]?.symbol, '牛来USDT');
    assert.equal(scopes?.[1]?.symbol, 'BTCUSDT');
  }
});

test('existing byte limit and invalid-message close codes stay in place', () => {
  const src = readFileSync(new URL('../server/screenerLiveQuotes.ts', import.meta.url), 'utf8');
  assert.match(src, /payloadBytes = Array\.isArray\(raw\)/);
  assert.match(src, /raw\.reduce\(\(size, chunk\) => size \+ chunk\.byteLength, 0\)/);
  assert.match(src, /if \(payloadBytes > 24_000\) \{ ws\.close\(1009, 'Message too large'\)/);
  assert.match(src, /JSON\.parse\(decodeScreenerQuoteRawData\(raw\)\)/);
  assert.match(src, /JSON\.parse\(decodeScreenerQuoteRawData\(bytes\)\)/);
  assert.match(src, /ws\.close\(1008, 'Invalid subscription'\)/);
  assert.match(src, /ws\.close\(1008, 'Too many subscription updates'\)/);
  assert.equal(parseScreenerSubscription({type:'subscribe', scopes: [{exchange:'binance', marketType:'futures', symbol:'🚫'}]}), null);
});
