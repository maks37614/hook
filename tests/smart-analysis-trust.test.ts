import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const service = source('../server/smartAnalysisService.ts');
const btc = source('../server/verifiedBtcContext.ts');
const poc = source('../server/estimatedPoc.ts');
const ui = source('../src/components/SmartAnalysisBlock.tsx');
const details = source('../src/components/FormationDetailsModal.tsx');

test('AI score icon is gone, but detected setup and full Quant panel work', () => {
  assert.doesNotMatch(details, /<Sparkles/);
  assert.doesNotMatch(details, /Оцінка AI/);
  assert.doesNotMatch(details, /\/api\/ai\/setup-score/);
  assert.match(details, /<SmartAnalysisBlock coin=\{coin\}/);
  assert.match(details, /tradeSetup=\{tradeSetupPanel\}/);
  assert.match(details, /aria-expanded=\{!isReferencePreview && qualityExpanded\}/);
  assert.match(ui, /fetch\(`\/api\/market\/smart-analysis\?\$\{queryParams\.toString\(\)\}`/);
});

test('exchange / market type are respected for live depth and missing depth cannot invent walls', () => {
  assert.match(service, /marketType === 'spot' \? 'spot' : 'linear'/);
  assert.match(service, /data-api\.binance\.vision\/api\/v3\/depth/);
  assert.match(service, /fapi\.binance\.com\/fapi\/v1\/depth/);
  assert.match(service, /api\.bybit\.com\/v5\/market\/orderbook/);
  assert.match(service, /fetchOrderbookAnalysis\(symbol, exchange, marketType\)/);
  assert.match(service, /available: false, source, bidAskRatio: null/);
  assert.match(service, /spread: \{ spreadUsd: null, spreadPct: null, quality: 'unavailable' \}/);
  assert.doesNotMatch(service, /amountUsd: 145000|amountUsd: 92000|amountUsd: 120000|amountUsd: 180000/);
  assert.doesNotMatch(service, /bidWallUsd: Math\.round\(currentPrice \* 25000\)/);
  assert.match(ui, /priceOrNA\(data\.orderbook\.bidWallPrice\)/);
  assert.match(ui, /formatVolume\(data\.orderbook\.askWallUsd!\)/);
});

test('no invented BTC quotes, structural signals, dates or pseudo-24h from arbitrary TF candles', () => {
  assert.doesNotMatch(service, /btcPrice: 85200|btcPrice = .*85000|change24h = .*1\.2/);
  assert.match(btc, /structure: 'unknown', label: 'Немає підтверджених свічок Binance Futures'/);
  assert.match(btc, /upcomingNews: \[\]/);
  assert.match(btc, /fetchKlines\('binance', 'futures', BTC, tf, 25,/);
  assert.match(btc, /\{ chart: true \}/);
  assert.match(btc, /getVerifiedClosedBtcCandles/);
  assert.match(service, /fetchKlines\(exchange, marketType, symbol, tf, 220,/);
  assert.match(service, /undefined, undefined, \{ chart: true \}/);
  assert.match(service, /klines\.length < MIN_TECHNICAL_BARS/);
  assert.match(service, /const ema200 = klines\.length >= 200 \? calculateEMA/);
  assert.match(service, /ema200: ema200 === null \? null/);
  assert.doesNotMatch(service, /currentPrice \* 1\.03|currentPrice \* 0\.97/);
  assert.match(service, /fetchKlines\(exchange, marketType, symbol, '1h', 26,/);
  assert.match(service, /closedHours\.length === 24/);
  assert.match(service, /quoteIsUsdLike/);
  assert.match(service, /const currentPrice = klines\[klines\.length - 1\]\.close/);
  assert.doesNotMatch(ui, /Календар новин не підключено/);
  assert.match(ui, /visible\.btcChange/);
  assert.match(ui, /visible\.volume24h/);
  assert.match(service, /calculatePOC\(has24h \? closedHours : \[\]\)/);
  assert.match(service, /valid24hWindow/);
  assert.match(ui, /visible\.ema200/);
  assert.match(ui, /Funding Rate · Binance \/ Bybit/);
  assert.match(ui, /Частка токенів у топ-10% адрес/);
});

test('holder wallets, iceberg trades, HFT algorithms and manipulation are not fabricated', () => {
  assert.match(service, /const top10ConcentrationPct: number \| null = null/);
  assert.match(service, /const activeWalletsGrowthPct: number \| null = null/);
  assert.match(service, /const retailVsWhaleRatio: string \| null = null/);
  assert.match(service, /const algorithmType: SmartAnalysisData\['participants'\]\['marketMaker'\]\['algorithmType'\] = null/);
  assert.match(service, /const isManipulativeCoin: boolean \| null = null/);
  assert.match(service, /type: 'limit_order'/);
  assert.doesNotMatch(service, /185000|140000|45000|top10ConcentrationPct = total24hVolUsd/);
  assert.doesNotMatch(service, /TWAP-набір|Айсберг у стакані|активних адрес за добу/);
  assert.doesNotMatch(ui, /54\}%|62% Whales & Insiders|HFT_GRID|95% Conf|320000/);
  assert.doesNotMatch(ui, /CoinGecko Holders недоступні/);
  assert.match(ui, /getSmartAnalysisVisibility\(data, holderSnapshot\)/);
  assert.doesNotMatch(ui, /Одного зрізу стакана недостатньо/);
  assert.match(ui, /Евристика, не доказ маніпуляцій/);
  assert.match(ui, /visible\.marketMaker/);
});

test('POC and trade-level claims are explicitly approximate, not executed-volume evidence', () => {
  assert.match(poc, /function calculatePOC\(klines: Kline\[\]\)/);
  assert.match(poc, /pocVolumePct: null/);
  assert.doesNotMatch(service, /Math\.max\(pocVolumePct, 15\)|pocVolumePct: 22/);
  assert.match(ui, /Оціночний POC за свічками/);
  assert.match(ui, /Розрахункові цінові орієнтири/);
  assert.match(ui, /не виконані угоди/);
});
