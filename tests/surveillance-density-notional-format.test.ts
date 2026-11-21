import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import {
  densityEventAmountText, formatDensityUsdCompact, formatDensityUsdExact,
  formatDensityLevelCompact, formatDensityLevelExact,
} from '../src/utils/densityNotional';
import { locales, telegramText } from '../src/locales';

test('compact values use thousands rather than lossy hundredths of a million', () => {
  assert.equal(formatDensityUsdCompact(7_000), '7к$');
  assert.equal(formatDensityUsdCompact(10_000), '10к$');
  assert.equal(formatDensityUsdCompact(110_000), '110к$');
  assert.equal(formatDensityUsdCompact(240_000), '240к$');
  assert.equal(formatDensityUsdCompact(96_300), '96,3к$');
  assert.equal(formatDensityUsdCompact(704_800), '704,8к$');
  assert.equal(formatDensityUsdCompact(0), '0$');
  assert.equal(formatDensityUsdCompact(Number.NaN), '—');
  assert.equal(formatDensityUsdCompact(Number.POSITIVE_INFINITY), '—');
  assert.equal(formatDensityUsdCompact(-500), '—');
  assert.equal(formatDensityUsdCompact(110_000, 'en'), '110k$');
  assert.equal(formatDensityUsdCompact(110_000, 'pl'), '110k$');
  assert.equal(formatDensityUsdCompact(110_000, 'ru'), '110к$');
  assert.equal(formatDensityUsdExact(110_000).replace(/\s/g, ' '), '110 000,00$');
});

test('verified numeric density evidence corrects an existing rounded event, without guessing absent amounts', () => {
  const old = '⚡ Нова щільність BID $0.01M';
  const description = 'Ліквідність рівня $0.01M за ціною $293.51.';
  const evidence = { price: 293.51, quantity: 42, notionalUsd: 293.51 * 42 };
  assert.equal(densityEventAmountText(old, 'DENSITY_APPEARED', evidence),
    '⚡ Нова щільність BID 12,33к$');
  assert.equal(densityEventAmountText(description, 'DENSITY_APPEARED', evidence),
    'Ліквідність рівня 12,33к$ за ціною $293.51.');
  assert.equal(densityEventAmountText(old, 'DENSITY_APPEARED', evidence, 'uk', 'GOOGLUSDT'), '⚡ Нова щільність BID 12,33k USDT');
  assert.equal(densityEventAmountText(description, 'DENSITY_APPEARED', evidence, 'uk', 'GOOGLUSDT'), 'Ліквідність рівня 12,33k USDT за ціною $293.51.');
  assert.equal(densityEventAmountText(old, 'DENSITY_APPEARED', evidence, 'uk', 'GOOGLUSDC'), old);
  assert.equal(densityEventAmountText(old, 'DENSITY_APPEARED', null), old);
  assert.equal(densityEventAmountText(old, 'DENSITY_APPEARED', { notionalUsd: '12000' }), old);
  assert.equal(densityEventAmountText(old, 'THIRD_TOUCH', evidence), old);
});

test('actual Binance USDT-marked level uses price times current quantity, never sums neighbours', () => {
  const book = new OrderBookEngine('GOOGLUSDT', 'binance', 'futures', {
    mode: 'MANUAL', manualThresholdUsd: 5_000, minPersistenceSeconds: 15, minDistancePct: .1,
  });
  const price = 293.51, size = 42;
  book.applyDepth({
    isSnapshot: true, sequence: 1, eventTime: Date.now(),
    bids: [[price, size], [293.50, 10]], asks: [[293.52, 12]],
  });
  const density = book.getDensities().find(d => d.side === 'BID' && d.price === price);
  assert.ok(density);
  assert.equal(density.quantity, size);
  assert.ok(Math.abs(density.notionalUsd - price * size) < 1e-7);
  assert.equal(formatDensityUsdCompact(density.notionalUsd), '12,33к$');
  assert.notEqual(formatDensityUsdCompact(density.notionalUsd), '100к
  book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [[price, 25]], asks: [] });
  assert.equal(book.getDensities().find(d => d.price === price)?.notionalUsd, price * 25,
    'WebSocket replaces a level quantity; it must not accumulate previous amounts');
  book.setStatus('STALE');
  assert.deepEqual(book.getDensities(), [], 'stale book cannot confirm real-time amounts');
});

test('four-language Telegram templates use the numeric density amount without extra million rounding', () => {
  const amount = 293.51 * 42;
  const source = readFileSync(new URL('../server/surveillance/stateMachineAndAlerts.ts',import.meta.url), 'utf8');
  assert.match(source, /volume: formatDensityLevelCompact\(density\.notionalUsd/);
  for (const lang of ['uk', 'en', 'ru', 'pl'] as const) {
    const variables = {
      symbol: 'GOOGLUSDT', exchange: 'BINANCE', side: 'ASK', price: '293.51',
      volume: formatDensityLevelCompact(amount, 'GOOGLUSDT', lang),
      distance: '0.3', quality: '72',
      classification: 'PERSISTENT_LIQUIDITY', duration: '1m 5s',
    };
    const appeared = telegramText(lang, 'densityAppeared', variables);
    const persistent = telegramText(lang, 'densityPersistent', variables);
    assert.ok(appeared.includes(formatDensityLevelCompact(amount, 'GOOGLUSDT', lang)), lang);
    assert.ok(persistent.includes(formatDensityLevelCompact(amount, 'GOOGLUSDT', lang)), lang);
    assert.doesNotMatch(appeared, /\$0\.01M/);
    assert.doesNotMatch(persistent, /\$0\.01M/);
    assert.ok(locales[lang].telegram.densityAppeared.includes('{{volume}}'));
    assert.ok(!locales[lang].telegram.densityAppeared.includes('{{volume}}M'));
    assert.ok(!locales[lang].telegram.densityPersistent.includes('{{volume}}M'));
  }
  const worker = readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  assert.match(worker,/formatDensityLevelCompact\(d\.notionalUsd, this\.coin\.symbol\)/);
  assert.match(worker,/formatDensityLevelExact\(d\.notionalUsd, this\.coin\.symbol\)/);
  const ui = readFileSync(new URL('../src/components/SurveillancePage.tsx',import.meta.url),'utf8');
  assert.match(ui,/formatDensityLevelCompact\(state\.topDensityUsd, coin\.symbol, language\)/);
  assert.match(ui,/formatDensityLevelCompact\(d\.notionalUsd, detailedCoin\.symbol, language\)/);
});
);
  assert.equal(formatDensityLevelCompact(density.notionalUsd, 'GOOGLUSDT'), '12,33k USDT');
  book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [[price, 25]], asks: [] });
  assert.equal(book.getDensities().find(d => d.price === price)?.notionalUsd, price * 25,
    'WebSocket replaces a level quantity; it must not accumulate previous amounts');
  book.setStatus('STALE');
  assert.deepEqual(book.getDensities(), [], 'stale book cannot confirm real-time amounts');
});

test('four-language Telegram templates use the numeric density amount without extra million rounding', () => {
  const amount = 293.51 * 42;
  const source = readFileSync(new URL('../server/surveillance/stateMachineAndAlerts.ts',import.meta.url), 'utf8');
  assert.match(source, /volume: formatDensityLevelCompact\(density\.notionalUsd/);
  for (const lang of ['uk', 'en', 'ru', 'pl'] as const) {
    const variables = {
      symbol: 'GOOGLUSDT', exchange: 'BINANCE', side: 'ASK', price: '293.51',
      volume: formatDensityLevelCompact(amount, 'GOOGLUSDT', lang),
      distance: '0.3', quality: '72',
      classification: 'PERSISTENT_LIQUIDITY', duration: '1m 5s',
    };
    const appeared = telegramText(lang, 'densityAppeared', variables);
    const persistent = telegramText(lang, 'densityPersistent', variables);
    assert.ok(appeared.includes(formatDensityLevelCompact(amount, 'GOOGLUSDT', lang)), lang);
    assert.ok(persistent.includes(formatDensityLevelCompact(amount, 'GOOGLUSDT', lang)), lang);
    assert.doesNotMatch(appeared, /\$0\.01M/);
    assert.doesNotMatch(persistent, /\$0\.01M/);
    assert.ok(locales[lang].telegram.densityAppeared.includes('{{volume}}'));
    assert.ok(!locales[lang].telegram.densityAppeared.includes('{{volume}}M'));
    assert.ok(!locales[lang].telegram.densityPersistent.includes('{{volume}}M'));
  }
  const worker = readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  assert.match(worker,/formatDensityLevelCompact\(d\.notionalUsd, this\.coin\.symbol\)/);
  assert.match(worker,/formatDensityLevelExact\(d\.notionalUsd, this\.coin\.symbol\)/);
  const ui = readFileSync(new URL('../src/components/SurveillancePage.tsx',import.meta.url),'utf8');
  assert.match(ui,/formatDensityLevelCompact\(state\.topDensityUsd, coin\.symbol, language\)/);
  assert.match(ui,/formatDensityLevelCompact\(d\.notionalUsd, detailedCoin\.symbol, language\)/);
});
