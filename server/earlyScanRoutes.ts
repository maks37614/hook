import type { Express } from 'express';
import { alignEarlyFormationToTick, detectEarlyReversalFormations } from '../src/utils/earlyFormations';
import { fetchExchangeTickSize } from '../src/utils/exchangeTickSize';
import { detectFormations } from '../src/utils/patternRecognition';
import type { ExchangeId, MarketType, ScannedCoin, Timeframe } from '../src/types';
import { fetchKlines, formationCandleData, loadScreenerTickers } from './marketService';
import { getMarketSourceStatuses, type RawTicker } from './marketTickerFeed';
import {
  FullEarlyScanBusyError, FullEarlyScanManager, type FullEarlyScanParams, type EarlyScanCheck,
} from './fullEarlyScan';

const SECONDS: Record<Timeframe, number> = { '5s': 5, '30s': 30,
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

async function scanOne(ticker: RawTicker, timeframe: Timeframe): Promise<EarlyScanCheck> {
  // A full scan must never silently reuse stale or malformed exchange candles.
  const klines = await fetchKlines(ticker.exchange, ticker.marketType, ticker.symbol, timeframe,
    70, undefined, undefined, { requireFresh: true });
  if (klines.length < 35) return klines.length === 0 ? null : 'skipped';
  const collectedAt = Date.now();
  const formationData = formationCandleData(klines, timeframe, collectedAt);
  if (!formationData) return null;
  const closed = klines.filter(c => (c.time + SECONDS[timeframe]) * 1000 <= formationData.lastClosedAt);
  const regular = detectFormations(closed, ticker.symbol)
    .filter(f => f.validation?.enoughData && f.validation.finiteData);
  const early = detectEarlyReversalFormations(closed, ticker.symbol, regular, collectedAt);
  if (!early.length) return 'checked';

  const tick = await fetchExchangeTickSize(ticker.exchange, ticker.marketType, ticker.symbol);
  const aligned = early.flatMap(candidate => {
    const result = alignEarlyFormationToTick(candidate, tick);
    return result ? [result] : [];
  });
  if (!aligned.length) return 'checked';
  const coin: ScannedCoin = {
    symbol: ticker.symbol, baseAsset: ticker.baseAsset, quoteAsset: ticker.quoteAsset,
    exchange: ticker.exchange, marketType: ticker.marketType, timeframe,
    currentPrice: ticker.price, priceChange24h: ticker.change24h,
    highPrice24h: ticker.high24h, lowPrice24h: ticker.low24h,
    volume24hUsd: ticker.volumeUsd, formations: regular, earlyFormations: aligned,
    lastUpdated: collectedAt, formationData,
    exchangeUrl: ticker.exchange === 'binance'
      ? ticker.marketType === 'futures'
        ? `https://www.binance.com/en/futures/${ticker.symbol}`
        : `https://www.binance.com/en/trade/${ticker.symbol}`
      : ticker.marketType === 'futures'
        ? `https://www.bybit.com/trade/usdt/${ticker.symbol}`
        : `https://www.bybit.com/en/trade/spot/${ticker.baseAsset}/USDT`,
  };
  return coin;
}

const manager = new FullEarlyScanManager({
  async loadTickers(params) {
    const tickers = await loadScreenerTickers(params);
    const sources = getMarketSourceStatuses(params);
    return {
      tickers,
      missingSources: sources.filter(row => row.status !== 'live').map(row =>
        `${row.exchange} ${row.marketType}: ${row.error || row.status}`),
    };
  },
  checkTicker: scanOne,
}, { concurrency: 3, batchPauseMs: 650, maxActiveJobs: 2, cacheMs: 4 * 60_000, maxRunMs: 25 * 60_000 });

function validParams(raw: unknown): FullEarlyScanParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const exchange = p.exchange, marketType = p.marketType, timeframe = p.timeframe;
  const minVolumeUsd = p.minVolumeUsd;
  if (!['all', 'binance', 'bybit'].includes(String(exchange))
    || !['all', 'futures', 'spot'].includes(String(marketType))
    || typeof timeframe !== 'string' || !Object.prototype.hasOwnProperty.call(SECONDS, timeframe)
    || typeof minVolumeUsd !== 'number' || !Number.isFinite(minVolumeUsd)
    || minVolumeUsd < 0 || minVolumeUsd > 1e15) return null;
  return {
    exchange: exchange as 'all' | ExchangeId,
    marketType: marketType as 'all' | MarketType,
    timeframe: timeframe as Timeframe,
    minVolumeUsd,
  };
}

export function installFullEarlyScanRoutes(app: Express): void {
  app.post('/api/screener/early/start', (req, res) => {
    const params = validParams(req.body);
    if (!params) return void res.status(400).json({ success: false, error: 'Некоректні параметри повного пошуку.' });
    try {
      const scan = manager.start(params, req.body?.force === true);
      res.json({ success: true, scan });
    } catch (error) {
      if (error instanceof FullEarlyScanBusyError) {
        res.setHeader('Retry-After', '5');
        return void res.status(429).json({ success: false, busy: true, error: error.message });
      }
      res.status(500).json({ success: false, error: 'Не вдалося запустити повний пошук.' });
    }
  });

  // Explicit stop of a known full-scan session. This session can be shared
  // by clients requesting the same instrument universe.
  app.post('/api/screener/early/stop', (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (!/^[a-f0-9-]{36}$/i.test(id)) {
      return void res.status(400).json({ success: false, error: 'Неправильний ID сканування.' });
    }
    const scan = manager.stop(id);
    if (!scan) return void res.status(404).json({ success: false, error: 'Сканування не знайдено.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, scan });
  });

  app.get('/api/screener/early/status', (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!/^[a-f0-9-]{36}$/i.test(id)) return void res.status(400).json({ success: false, error: 'Неправильний ID сканування.' });
    const scan = manager.snapshot(id);
    if (!scan) return void res.status(404).json({ success: false, error: 'Сканування не знайдено.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, scan });
  });
}
