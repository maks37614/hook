import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { normalizeTerminalMarketPair } from '../src/utils/terminalPresets';
import { createSharedKlineSubscriptions, parseSharedKlineMessage } from '../src/components/hookchart/sharedKlineStream';

test('Exchange pair normalization preserves UTF-8 asset names for historical klines', () => {
  assert.equal(normalizeExchangeSymbol('币安人生/USDT'), '币安人生USDT');
  assert.equal(normalizeExchangeSymbol('龙虾-USDT'), '龙虾USDT');
  assert.equal(normalizeExchangeSymbol('牛来USDT'), '牛来USDT');
  assert.ok(isValidExchangeSymbol('币安人生USDT'));
  assert.ok(isValidExchangeSymbol('龙虾USDT'));
  assert.ok(isValidExchangeSymbol('牛来USDT'));
  assert.ok(isValidExchangeSymbol('BTCUSDT'));
  assert.ok(!isValidExchangeSymbol('BTC/USDT'));
  assert.ok(!isValidExchangeSymbol('BTC USDT'));
  assert.ok(!isValidExchangeSymbol(''));
});

test('Terminal pair normalization preserves both international and existing Latin quotes', () => {
  assert.deepEqual(normalizeTerminalMarketPair('币安人生USDT'), {
    symbol: '币安人生USDT', quoteAsset: 'USDT',
  });
  assert.deepEqual(normalizeTerminalMarketPair('牛来USDT'), {
    symbol: '牛来USDT', quoteAsset: 'USDT',
  });
  assert.deepEqual(normalizeTerminalMarketPair('龙虾BTC'), {
    symbol: '龙虾BTC', quoteAsset: 'BTC',
  });
  assert.deepEqual(normalizeTerminalMarketPair('币安人生/USDT'), {
    symbol: '币安人生USDT', quoteAsset: 'USDT',
  });
  assert.deepEqual(normalizeTerminalMarketPair('ETHBTC'), {
    symbol: 'ETHBTC', quoteAsset: 'BTC',
  });
  assert.deepEqual(normalizeTerminalMarketPair('BTC'), {
    symbol: 'BTCUSDT', quoteAsset: 'USDT',
  });
});

test('Shared live kline feed subscribes to international market symbols', () => {
  const urls: string[] = [];
  const streams = createSharedKlineSubscriptions(url => {
    urls.push(url);
    return { close() {}, send() {}, readyState: 0 } as unknown as WebSocket;
  });
  const stop = streams.subscribe({
    exchange: 'binance', marketType: 'futures',
    symbol: '币安人生USDT', timeframe: '1h',
  }, { onCandle() {} });
  assert.equal(streams.activeScopes(), 1);
  assert.equal(urls.length, 1);
  assert.match(decodeURIComponent(urls[0]), /币安人生usdt@kline_1h/);
  stop();
  assert.equal(streams.activeScopes(), 0);
});

test('Binance live kline parser accepts the matching UTF-8 contract symbol', () => {
  const result = parseSharedKlineMessage('binance', {
    e: 'kline', s: '币安人生USDT', E: 1_700_000_000_500,
    k: { s: '币安人生USDT', i: '1h', t: 1_700_000_000_000,
      o: '1', h: '2', l: '1', c: '2', v: '12', n: 4, V: '9' },
  }, '币安人生USDT', '1h');
  assert.equal(result?.time, 1_700_000_000);
  assert.equal(result?.close, 2);
});
