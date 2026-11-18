import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';

test('Bybit futures ticker exposes verified OI on the existing WebSocket without REST', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const source = new ExchangeStreamClient('BTCUSDT', 'bybit', 'futures');
  const samples: Array<{ valueUsd: number; amountCoins: number; time: number }> = [];
  source.on('open-interest', sample => samples.push(sample));
  const message = {
    topic: 'tickers.BTCUSDT', type: 'snapshot', ts: Date.now(),
    data: { lastPrice: '100', openInterest: '500', openInterestValue: '50000',
      highPrice24h: '105', lowPrice24h: '98', turnover24h: '100000' },
  };
  try {
    (source as any).handleIncomingMessage(message);
    assert.equal(samples.length, 1);
    assert.equal(samples[0].valueUsd, 50_000);
    assert.equal(samples[0].amountCoins, 500);
    (source as any).handleIncomingMessage({
      topic: 'tickers.BTCUSDT', type: 'delta', ts: Date.now(),
      data: { openInterest: '501', openInterestValue: '50100' },
    });
    assert.equal(samples[1].valueUsd, 50_100);

    (source as any).handleIncomingMessage({
      topic: 'tickers.BTCUSDT', type: 'delta', ts: Date.now(),
      data: { openInterest: '-1', openInterestValue: 'NaN' },
    });
    assert.equal(samples.length, 2, 'invalid values must never be emitted as OI');
  } finally {
    source.destroy();
  }
});

test('spot ticker updates cannot masquerade as futures OI', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const source = new ExchangeStreamClient('BTCUSDT', 'bybit', 'spot');
  let count = 0;
  source.on('open-interest', () => count++);
  try {
    (source as any).handleIncomingMessage({
      topic: 'tickers.BTCUSDT', type: 'snapshot',
      data: { lastPrice: '100', openInterest: '500', openInterestValue: '50000' },
    });
    assert.equal(count, 0);
  } finally {
    source.destroy();
  }
});
