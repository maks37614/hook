import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCoin, TerminalChartBlock } from '../src/types';
import { matchesMarketPreset, selectMarketPresetCoins } from '../src/utils/marketPresets';
import { blocksForMarketPreset, normalizeTerminalPresets, terminalStorageKey, TERMINAL_PRESETS_STORAGE_KEY } from '../src/utils/terminalPresets';

const coin = (symbol: string, change24h: number, values: Partial<MarketCoin> = {}): MarketCoin => ({
  symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures',
  price: 100, change24h, volumeUsd: 5_000_000, high24h: 101, low24h: 99,
  distanceToHighPct: 1, distanceToLowPct: 1, volatility24hPct: 8, volatility5mPct: 1,
  isNearHigh: true, isNearLow: true, isActiveCoin: true, exchangeUrl: '', ...values,
});
const all = { exchange: 'all', marketType: 'all' } as const;
const key = (item: MarketCoin) => `${item.symbol}:${item.exchange}:${item.marketType}`;

test('terminal gainers and losers use the screener categories and correct 24h ranking', () => {
  const data = [coin('FLATUSDT', 0), coin('AUSDT', 8), coin('BUSDT', -2), coin('CUSDT', 20), coin('DUSDT', -15)];
  assert.deepEqual(selectMarketPresetCoins(data, 'top_gainers', all, 4).map(item => item.symbol), ['CUSDT', 'AUSDT']);
  assert.deepEqual(selectMarketPresetCoins(data, 'top_losers', all, 4).map(item => item.symbol), ['DUSDT', 'BUSDT']);
  for (const preset of ['active', 'top_gainers', 'top_losers', 'near_highs', 'near_lows'] as const) {
    assert.equal(selectMarketPresetCoins(data, preset, all, 36).length, data.filter(item => matchesMarketPreset(item, preset)).length);
  }
});

test('active coins sort by 5m volatility; high and low categories sort by proximity', () => {
  const data = [coin('AUSDT', 1, { volatility5mPct: 0.8, distanceToHighPct: 1.5, distanceToLowPct: 0.1 }),
    coin('BUSDT', 1, { volatility5mPct: 3, distanceToHighPct: 0.1, distanceToLowPct: 1.5 }),
    coin('CUSDT', 1, { isActiveCoin: false, isNearHigh: false, isNearLow: false, volatility5mPct: 5 })];
  assert.deepEqual(selectMarketPresetCoins(data, 'active', all, 2).map(item => item.symbol), ['BUSDT', 'AUSDT']);
  assert.deepEqual(selectMarketPresetCoins(data, 'near_highs', all, 2).map(item => item.symbol), ['BUSDT', 'AUSDT']);
  assert.deepEqual(selectMarketPresetCoins(data, 'near_lows', all, 2).map(item => item.symbol), ['AUSDT', 'BUSDT']);
});

test('presets distinguish spot and futures on both exchanges and discard duplicate quotes', () => {
  const data = [coin('BTCUSDT', 2), coin('BTCUSDT', 2), coin('BTCUSDT', 4, { marketType: 'spot' }),
    coin('BTCUSDT', 8, { exchange: 'bybit' }), coin('BTCUSDT', 6, { exchange: 'bybit', marketType: 'spot' })];
  assert.equal(selectMarketPresetCoins(data, 'active', all, 9).length, 4);
  assert.deepEqual(selectMarketPresetCoins(data, 'top_gainers', { exchange: 'bybit', marketType: 'spot' }, 4).map(key), ['BTCUSDT:bybit:spot']);
});

test('limits and invalid prices cannot generate extra or fake charts; inputs remain untouched', () => {
  const data = Array.from({ length: 50 }, (_, index) => coin(`C${index}USDT`, index + 1));
  data.push(coin('BROKENUSDT', 100, { price: NaN }), coin('ZEROPRICEUSDT', 100, { price: 0 }));
  const original = [...data];
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, 4).length, 4);
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, 100).length, 36);
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, -1).length, 0);
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, NaN).length, 0);
  assert.deepEqual(selectMarketPresetCoins([], 'near_highs', all, 4), []);
  assert.deepEqual(data, original);
});

test('automatic refresh preserves widget IDs, timeframes and manual settings for unchanged coins', () => {
  const quotes = [coin('BTCUSDT', 4), coin('ETHUSDT', 3)];
  const blocks = blocksForMarketPreset([], quotes, '15m');
  blocks[0] = { ...blocks[0], mode: 'combined', timeframe: '1h', domSettings: { compression: 10 } };
  assert.equal(blocksForMarketPreset(blocks, quotes, '5m'), blocks);
  const next = blocksForMarketPreset(blocks, [quotes[1], quotes[0], coin('SOLUSDT', 2)], '5m');
  assert.equal(next[1], blocks[0]);
  assert.equal(next[1].domSettings?.compression, 10);
  assert.equal(next[2].timeframe, '5m');
  assert.equal(new Set(next.map(block => block.id)).size, 3);
});

test('custom presets survive a JSON roundtrip without losing exchange, market, timeframe or DOM settings', () => {
  const blocks: TerminalChartBlock[] = blocksForMarketPreset([], [coin('BTCUSDT', 2, { exchange: 'bybit', marketType: 'spot' })], '4h');
  blocks[0] = { ...blocks[0], mode: 'combined', colSpan: 2, domSettings: { depth: 'deep', compression: 20 } };
  const preset = { id: 'my-preset', name: 'Мої монети', blocks, columns: 3, blockHeight: 'large', createdAt: 123 };
  assert.deepEqual(normalizeTerminalPresets(JSON.parse(JSON.stringify([preset]))), [preset]);
  assert.deepEqual(normalizeTerminalPresets([{ ...preset, blocks: [] }]), []);
  assert.deepEqual(normalizeTerminalPresets([{ ...preset, blocks: [{ symbol: 'FAKEUSDT' }] }]), []);
  assert.equal(normalizeTerminalPresets([preset, preset]).length, 1);
  assert.deepEqual(normalizeTerminalPresets([]), []);
});

test('custom preset caches are isolated between users and guests', () => {
  const keys = [terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY, 'user-a'),
    terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY, 'user-b'), terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY)];
  assert.equal(new Set(keys).size, 3);
  const storage = new Map<string, string>();
  storage.set(keys[0], JSON.stringify([{ id: 'private-a', name: 'Мій пресет' }]));
  assert.equal(storage.get(keys[1]), undefined);
  assert.equal(storage.get(keys[2]), undefined);
});
