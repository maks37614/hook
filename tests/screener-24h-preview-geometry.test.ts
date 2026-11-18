import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { screenerPreviewTradeLevels } from '../src/utils/screenerPreviewTradeLevels';
import { formatPercent } from '../src/utils/formatters';

const file = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const preview = { price: 64302.03, high24h: 65534.94, low24h: 63336, change24h: -1.6098447030049954 };

test('negative 24h change makes directional SHORT with target below and stop above Entry', () => {
  const plan = screenerPreviewTradeLevels(preview);
  assert.ok(plan);
  assert.equal(plan.bias, 'bearish');
  assert.equal(plan.entryPrice, 64302.03);
  assert.equal(plan.targetPrice, 63336);
  assert.equal(plan.stopLossPrice, 65534.94);
  assert.ok(plan.targetPrice < plan.entryPrice && plan.entryPrice < plan.stopLossPrice);
  assert.equal(plan.potentialProfitPct, 1.50);
  assert.equal(plan.potentialRiskPct, 1.92);
  assert.equal(plan.riskRewardRatio, 0.78);
});

test('positive 24h change makes directional LONG with target above and stop below Entry', () => {
  const plan = screenerPreviewTradeLevels({ ...preview, change24h: 1.6098447030049954 });
  assert.ok(plan);
  assert.equal(plan.bias, 'bullish');
  assert.equal(plan.targetPrice, 65534.94);
  assert.equal(plan.stopLossPrice, 63336);
  assert.ok(plan.stopLossPrice < plan.entryPrice && plan.entryPrice < plan.targetPrice);
  assert.equal(plan.potentialProfitPct, 1.92);
  assert.equal(plan.potentialRiskPct, 1.50);
  assert.equal(plan.riskRewardRatio, 1.28);
});

test('stale, inverted or incomplete 24h data never manufactures 3% TP/SL', () => {
  for (const p of [0.0032, 65000, 100000]) {
    for (const change24h of [-7, 0, 7]) {
      assert.equal(screenerPreviewTradeLevels({
        price: p, high24h: p * 0.9, low24h: p * 1.1, change24h,
      }), null);
      assert.equal(screenerPreviewTradeLevels({
        price: p, high24h: p * 1.04, low24h: 0, change24h,
      }), null);
      assert.equal(screenerPreviewTradeLevels({
        price: p, high24h: p * 1.04, low24h: p * 1.01, change24h,
      }), null);
    }
  }
});

test('valid directional 24h preview is available with confirmed range and nonflat daily change', () => {
  for (const p of [0.0032, 65000, 100000]) {
    for (const change24h of [-7, 7]) {
      const plan = screenerPreviewTradeLevels({
        price: p, high24h: p * 1.04, low24h: p * 0.98, change24h,
      });
      assert.ok(plan);
      assert.equal(plan.entryPrice, p);
      assert.equal(plan.targetPrice, change24h > 0 ? p * 1.04 : p * 0.98);
      assert.equal(plan.stopLossPrice, change24h > 0 ? p * 0.98 : p * 1.04);
      assert.equal(plan.potentialProfitPct, change24h > 0 ? 4 : 2);
      assert.equal(plan.potentialRiskPct, change24h > 0 ? 2 : 4);
    }
    assert.equal(screenerPreviewTradeLevels({
      price: p, high24h: p * 1.04, low24h: p * 0.98, change24h: 0,
    }), null);
  }
});

test('no fabricated directional setup when quote price or 24h change is invalid', () => {
  for (const price of [0, -1, NaN, Infinity]) {
    assert.equal(screenerPreviewTradeLevels({ ...preview, price }), null);
  }
  for (const change24h of [NaN, Infinity, -Infinity]) {
    assert.equal(screenerPreviewTradeLevels({ ...preview, change24h }), null);
  }
});

test('Screener uses the same preview direction, TP, SL, and calculated percentages', () => {
  const source = file('src/components/CoinScreenerPage.tsx');
  assert.match(source, /const preview = screenerPreviewTradeLevels\(coin\)/);
  assert.match(source, /if \(!preview\) \{\s*onSelectCoin\(scanned\)/);
  assert.match(source, /bias: preview\.bias/);
  assert.match(source, /source: 'screener_24h_preview'/);
  assert.match(source, /confidence: 0/);
  assert.match(source, /id: `screener_preview_\$\{coin\.exchange\}_\$\{coin\.marketType\}_\$\{coin\.symbol\}`/);
  assert.doesNotMatch(source, /confidence: 85/);
  assert.match(source, /entryPrice: preview\.entryPrice/);
  assert.match(source, /targetPrice: preview\.targetPrice/);
  assert.match(source, /stopLossPrice: preview\.stopLossPrice/);
  assert.match(source, /riskRewardRatio: preview\.riskRewardRatio/);
  assert.match(source, /potentialProfitPct: preview\.potentialProfitPct/);
  assert.match(source, /potentialRiskPct: preview\.potentialRiskPct/);
  assert.doesNotMatch(source, /riskRewardRatio: 2\.2,\s*potentialProfitPct: Math\.abs\(coin\.change24h\)/);
});

test('Formation cards, detail and Telegram notes do not expose long floating-point tails', () => {
  const details = file('src/components/FormationDetailsModal.tsx');
  const card = file('src/components/FormationCard.tsx');
  assert.equal(formatPercent(1.6098447030049954), '+1.61%');
  assert.equal(formatPercent(-1.6098447030049954), '-1.61%');
  assert.match(details, /formatPercent\(Math\.abs\(formation\.potentialProfitPct\)\)/);
  assert.match(details, /formatPercent\(-Math\.abs\(formation\.potentialRiskPct\)\)/);
  assert.match(details, /Math\.abs\(formation\.potentialProfitPct\)\.toFixed\(2\)/);
  assert.match(card, /formatPercent\(Math\.abs\(formation\.potentialProfitPct\)\)/);
  assert.match(card, /formatPercent\(-Math\.abs\(formation\.potentialRiskPct\)\)/);
});
