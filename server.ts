import { initializeIdentity } from './server/pgIdentity';
import { installPostgresIdentityRoutes } from './server/pgIdentityRoutes';
import { installReplayProfileRoutes } from './server/replayProfileRoutes';
import { installDesktopLinkRelay } from './server/desktopLinkRelay';
import { startAuthMailWorker } from './server/authMailWorker';
import express from 'express';
import path from 'path';
import { installProductionAssets } from './server/productionAssets';
// Vite is a development-only middleware and must never load in the VPS runtime.
import { runScreenerScan, fetchKlines, fetchDualExchangeOI } from './server/marketService';
import { parseScreenerScanQuery } from './server/screenerScanQuery';
import { replayHistoryCache } from './server/replayHistoryCache';
import { getReplayHistoryStart, ReplayHistoryBoundsBusyError } from './server/replayHistoryBounds';
import { installMarketQuoteRoutes, publicQuoteResponseCache } from './server/marketQuoteResponse';
import { installFavoriteQuoteRoutes } from './server/favoriteQuotes';
import { installFullEarlyScanRoutes } from './server/earlyScanRoutes';
import { fetch24hTradeCount } from './server/chartMarketStats';
import { SmartAnalysisGate } from './server/smartAnalysisGate';
import { generateSmartAnalysis, SmartAnalysisDataUnavailableError } from './server/smartAnalysisService';
import { coingeckoHolders } from './server/coingeckoHolders';
import { calculateMarketSentiment, SentimentDataUnavailableError } from './server/sentimentService';
import { installTelegramRoutes } from './server/telegramRoutes';
import { startSharedTelegramBot } from './server/telegramLinkService';
import {
  getAllAlerts,
  checkAlertsOnce,
  createAlert,
  createAlertsBatch,
  deleteAlert,
  toggleAlert,
  AlertDispatchPendingError,
  clearTriggeredAlerts,
  syncUserAlerts,
  getAlertHistory,
  clearAlertHistory,
  deleteHistoryItem,
  getUserTelegram,
  createSetupAlertsGroup,
} from './server/alertService';
import { AlertManualQueueBusyError } from './server/alertCheckScheduler';
import {
  loadSurveillanceList,
  saveSurveillanceList,
  getDefaultSurveillanceConfig,
  checkCoinSurveillance,
  checkAllUserCoins,
  findSurveillanceCoinById,
  setAllSurveillanceCoinsActive,
  commitSurveillanceCheck,
  validateSurveillanceConfig,
} from './server/surveillanceService';
import { ExchangeId, MarketType, Timeframe, type Kline } from './src/types';
import { normalizeLanguage, telegramText } from './src/locales';
import { isValidExchangeSymbol, normalizeExchangeSymbol, resolveSurveillanceSymbol, searchSurveillanceSymbols } from './src/utils/marketSymbols';
import { marketTickerFeed } from './server/marketTickerFeed';
import { cronManager } from './server/cronService';
import { surveillanceManager } from './server/surveillance/surveillanceManager';
import { surveillanceReplayEngine } from './server/surveillance/replayEngine';
import { hasFreshSurveillanceCheck, wasSurveillanceCheckCommitted, SurveillanceCheckIncompleteError } from './server/surveillance/checkResult';
import { fetchHookChartOIHistory } from './server/hookchartOI';
import { requireUserAuth } from './server/userAuth';
import { sendUserTelegramMessage, startTelegramDeliveryWorker } from './server/telegramDelivery';
import { installHookChartDepthStream } from './server/hookChartDepth';
import { installHookChartKlineRelay } from './server/hookChartKlineRelay';
import { installLiquidationStream } from './server/liquidationFeed';
import { installLiquidationArchiveRoutes } from './server/liquidationArchiveRoutes';
import { installOpsMetrics } from './server/opsMetrics';
import { subscribeSurveillance } from './server/surveillanceEvents';
import { SharedScanBusyError } from './server/sharedScanJobs';
import { MAX_SURVEILLANCE_ACTIVE, MAX_SURVEILLANCE_SAVED,
  canActivateSurveillance, canSaveSurveillance, userWorkThrottle, userWorkQuota } from './server/surveillanceLimits';
import { binanceTickerStream } from './server/binanceTickerStream';
import { installScreenerLiveQuotes } from './server/screenerLiveQuotes';
import { installMarketSentimentStream } from './server/marketSentimentStream';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.set('trust proxy', process.env.AUTH_TRUST_PROXY === '1' ? 1 : 'loopback');
  app.use(express.json({ limit: '384kb' }));
  // The public screener and market WebSockets must remain available if PostgreSQL is down.
  // Account routes retry initialization independently; never block Node startup here.
  void initializeIdentity().catch(error => {
    console.error('[Account DB] Initialization unavailable (market routes remain online):', error instanceof Error ? error.message : String(error));
  });
  installPostgresIdentityRoutes(app);
  installReplayProfileRoutes(app);
  // Opt-in Desktop channel: user-scoped and idle when no Desktop is connected.
  installDesktopLinkRelay(app);

  // Read-only operator endpoint is disabled unless H00K_OPS_TOKEN is configured.
  let chartDepthMetrics: (() => ReturnType<ReturnType<typeof installHookChartDepthStream>['stats']>) | null = null;
  let chartKlineMetrics: (() => ReturnType<ReturnType<typeof installHookChartKlineRelay>['stats']>) | null = null;
  // Disabled unless LIQ_ARCHIVE_ENABLED=1; no extra work for normal charts.
  installLiquidationArchiveRoutes(app);

  installOpsMetrics(app, () => chartDepthMetrics?.() ?? null,
    () => chartKlineMetrics?.() ?? null);

  // The profile notification center is browser-only, so it has no API
  // for synchronizing its category switches or modifying Telegram delivery.
  // Existing price alerts, surveillance and Telegram retain separate routes.
  app.use(['/api/alerts', '/api/telegram', '/api/surveillance', '/api/cron'], requireUserAuth);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Unified Cron Status & Diagnostics
  app.get('/api/cron/status', (req, res) => {
    try {
      const status = cronManager.getStatus(res.locals.userId);
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get cron status' });
    }
  });

  // Manual Trigger for Cron Jobs (e.g. from external cron services or user test button)
  app.post('/api/cron/run', async (req, res) => {
    try {
      const jobId = (req.body?.job || 'all').toString();
      if (!['all', 'price_alerts', 'surveillance'].includes(jobId)) return res.status(400).json({ success: false, error: 'Невідоме завдання' });
      // The legacy manual CRON route must share the same per-user budget as
      // /api/surveillance/check-all; otherwise it bypasses the 60s throttle
      // and allows repeated four-timeframe REST bursts against the VPS.
      const checksSurveillance = jobId !== 'price_alerts';
      const windowMs = checksSurveillance ? 60_000 : 15_000;
      const throttleKey = checksSurveillance ? 'check-all' : 'manual-price-alerts';
      if (!userWorkThrottle.allow(res.locals.userId, throttleKey, windowMs))
        return res.status(429).setHeader('Retry-After', String(windowMs / 1000)).json({
          success: false, error: 'Повторна ручна перевірка буде доступна пізніше.',
        });
      // Run the user's independent pipelines even when one fails. A partial
      // result is never advertised as success, and no other user is scanned.
      const checks: Promise<unknown>[] = [];
      if (jobId !== 'surveillance') checks.push(checkAlertsOnce(res.locals.userId));
      if (jobId !== 'price_alerts') checks.push(checkAllUserCoins(res.locals.userId));
      const results = await Promise.allSettled(checks);
      const failures = results.filter((item): item is PromiseRejectedResult =>
        item.status === 'rejected');
      if (failures.length) {
        const reasons = failures.map(item => item.reason);
        const retryable = reasons.some(error =>
          error instanceof SurveillanceCheckIncompleteError ||
          error instanceof AlertManualQueueBusyError);
        return res.status(retryable ? 503 : 500).setHeader('Retry-After', '10').json({
          success: false,
          error: 'Частина ручних перевірок завершилася помилкою. Повторіть спробу пізніше.',
          failedTasks: failures.length,
        });
      }
      res.json({ success: true, message: 'Ваші сповіщення перевірено' });
    } catch (err: any) {
      if (err instanceof SurveillanceCheckIncompleteError)
        return res.status(503).setHeader('Retry-After', '10').json({
          success: false, error: err.message,
        });
      if (err instanceof AlertManualQueueBusyError)
        return res.status(503).setHeader('Retry-After', '5').json({
          success: false, error: err.message,
        });
      res.status(500).json({ success: false, error: err?.message || 'Failed to trigger cron job' });
    }
  });

  // Test notification dispatch pipeline (Telegram + in-app)
  app.post('/api/cron/test-alert', async (req, res) => {
    try {
      const { userId, symbol, note, language } = req.body;
      const testSymbol = (symbol || 'BTCUSDT').toUpperCase();
      const userTg = getUserTelegram(res.locals.userId);
      const selectedLanguage = normalizeLanguage(language || userTg?.language);
      const effectiveToken = userTg?.botToken;
      const effectiveChat = userTg?.chatId;

      if (!effectiveToken || !effectiveChat || !userTg?.confirmedAt) {
        return res.status(400).json({
          success: false,
          error: 'Спочатку підключіть і підтвердьте Telegram у відповідному розділі.',
        });
      }

      const localeTag = selectedLanguage === 'en' ? 'en-US' : selectedLanguage === 'ru' ? 'ru-RU' : selectedLanguage === 'pl' ? 'pl-PL' : 'uk-UA';
      const timeStr = new Date().toLocaleTimeString(localeTag, { timeZone: 'Europe/Kyiv' });
      const noteLine = note ? telegramText(selectedLanguage, 'noteLine', { note: String(note) }) : '';
      const testMsg = telegramText(selectedLanguage, 'cronTest', {
        symbol: testSymbol,
        noteLine,
        time: timeStr,
      });

      const tgResult = await sendUserTelegramMessage(res.locals.userId, testMsg);

      res.json({
        success: tgResult.success,
        telegramSent: tgResult.success,
        error: tgResult.error,
        message: tgResult.success
          ? 'Тестове сповіщення успішно надіслано у ваш Telegram!'
          : `Помилка доставки в Telegram: ${tgResult.error}`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Помилка надсилання тесту' });
    }
  });

  // Dedicated full-universe early W/M scan: progressive, throttled and shared across clients.
  installFullEarlyScanRoutes(app);

  // Screener Scan endpoint
  app.get('/api/screener/scan', async (req, res) => {
    try {
      const query = parseScreenerScanQuery(req.query);
      if (!query) {
        return res.status(400).json({ success: false, error: 'Invalid screener scan filters' });
      }

      const results = await runScreenerScan(query);

      res.json({
        success: true,
        count: results.length,
        coinsWithFormationsCount: results.filter((c) => c.formations.length > 0).length,
        data: results,
      });
    } catch (err: any) {
      if (err instanceof SharedScanBusyError) {
        return res.status(503).setHeader('Retry-After', '10')
          .json({ success:false, error:err.message });
      }
      console.error('Error during screener scan:', err);
      res.status(500).json({ success: false, error: err.message || 'Scan failed' });
    }
  });

  // Reuse identical public snapshots across many browser requests.
  // The endpoint schema and query validation remain unchanged.
  installMarketQuoteRoutes(app, publicQuoteResponseCache);
  // Small on-demand quotes for saved favorites, independent of formation scans.
  installFavoriteQuoteRoutes(app);

  // Market Sentiment endpoint ("Настрій Ринку")
  app.get('/api/market/sentiment', async (req, res) => {
    try {
      const sentiment = await calculateMarketSentiment();
      res.json({ success: true, data: sentiment });
    } catch (err: any) {
      if (err instanceof SentimentDataUnavailableError) {
        res.status(503).json({ success: false, error: err.message, code: 'SENTIMENT_DATA_UNAVAILABLE' });
        return;
      }
      console.error('Error calculating market sentiment:', err);
      res.status(500).json({ success: false, error: 'Не вдалося обчислити індекс настрою' });
    }
  });

  // Free CoinGecko Demo Holders. Never expose the API key in a browser and
  // never accept a user-supplied URL, blockchain path or arbitrary contract.
  // Exact symbol resolution lives in coingeckoHolders, not the browser.
  const holderCallerWindow = new Map<string, { since: number; count: number }>();
  app.get('/api/market/holders', async (req, res) => {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
    if (!/^[a-zA-Z0-9]{2,36}$/.test(symbol)) {
      res.status(400).json({ success: false, error: 'Некоректний символ монети' });
      return;
    }
    const now = Date.now();
    const caller = req.ip || 'unknown';
    let rate = holderCallerWindow.get(caller);
    if (!rate || now - rate.since >= 60_000) rate = { since: now, count: 0 };
    rate.count += 1;
    holderCallerWindow.set(caller, rate);
    if (holderCallerWindow.size > 2000) {
      for (const [ip, value] of holderCallerWindow) {
        if (now - value.since >= 60_000) holderCallerWindow.delete(ip);
      }
    }
    if (rate.count > 30) {
      res.status(429).json({ success: false, error: 'Забагато запитів до Holders' });
      return;
    }
    try {
      res.set('Cache-Control', 'private, max-age=60');
      res.json({ success: true, data: await coingeckoHolders.get(symbol) });
    } catch {
      res.status(503).json({ success: false, error: 'Дані Holders зараз недоступні' });
    }
  });

  // Public Quant analysis: validate inputs and cap both abuse and concurrent work.
  // Existing cached results and identical in-flight calculations are shared.
  // A single app replica runs behind one trusted reverse proxy on the VPS.
  const smartAnalysisGate = new SmartAnalysisGate();
  app.get('/api/market/smart-analysis', async (req, res) => {
    const rawSymbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim() : 'BTCUSDT';
    const symbol = normalizeExchangeSymbol(rawSymbol);
    const exchange = req.query.exchange ?? 'binance';
    const marketType = req.query.marketType ?? 'futures';
    const timeframe = req.query.timeframe ?? '1h';
    const rawPrice = req.query.price;
    const currentPrice = typeof rawPrice === 'string' && rawPrice.trim() !== '' ? Number(rawPrice) : undefined;
    if (!isValidExchangeSymbol(symbol) ||
        (exchange !== 'binance' && exchange !== 'bybit') ||
        (marketType !== 'spot' && marketType !== 'futures') ||
        !['1m', '5m', '15m', '1h', '4h', '1d'].includes(String(timeframe)) ||
        (rawPrice !== undefined && (currentPrice === undefined ||
          !Number.isFinite(currentPrice) || currentPrice <= 0))) {
      return res.status(400).json({ success: false, code: 'INVALID_ANALYSIS_INPUT',
        error: 'Некоректні параметри розумного аналізу' });
    }
    const admission = smartAnalysisGate.enter(req.ip || 'unknown');
    if (admission.status !== 'ok') {
      return res.status(admission.status === 'rate_limited' ? 429 : 503)
        .setHeader('Retry-After', String(admission.retryAfterSeconds))
        .json({ success: false, code: admission.status === 'rate_limited'
          ? 'SMART_ANALYSIS_RATE_LIMIT' : 'SMART_ANALYSIS_BUSY',
          error: 'Розумний аналіз тимчасово зайнятий. Спробуйте пізніше.' });
    }
    try {
      const analysis = await generateSmartAnalysis({
        symbol, exchange, marketType, timeframe: timeframe as Timeframe, currentPrice,
      });
      res.json({ success: true, data: analysis });
    } catch (err: any) {
      if (err instanceof SmartAnalysisDataUnavailableError) {
        res.status(503).json({ success: false, code: err.code, error: err.message });
        return;
      }
      console.error('Error generating smart analysis:', err);
      res.status(500).json({ success: false, code: 'SMART_ANALYSIS_ERROR',
        error: 'Внутрішня помилка розумного аналізу. Спробуйте пізніше.' });
    } finally {
      admission.release();
    }
  });

  // One small shared listing-boundary lookup per exchange/market/symbol.
  // Avoid requesting candles from before a contract existed during Replay.
  app.get('/api/replay/history-bounds', async (req, res) => {
    const exchange = req.query.exchange;
    const market = req.query.market;
    const symbol = typeof req.query.symbol === 'string'
      ? normalizeExchangeSymbol(req.query.symbol).toUpperCase() : '';
    if ((exchange !== 'binance' && exchange !== 'bybit') ||
        (market !== 'spot' && market !== 'futures') ||
        !/^[A-Z0-9]{3,30}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'Invalid replay instrument' });
    }
    try {
      const firstCandleMs = await getReplayHistoryStart(exchange, market, symbol);
      res.setHeader('Cache-Control', `public, max-age=${firstCandleMs ? 300 : 30}`);
      return res.json({ success: true, firstCandleMs });
    } catch (error) {
      const busy = error instanceof ReplayHistoryBoundsBusyError;
      return res.status(busy ? 503 : 500).setHeader('Retry-After', '10')
        .json({ success: false, error: 'Replay listing data temporarily unavailable' });
    }
  });

  // Replay can read existing shared historical candles without fetching from exchanges.
  // This endpoint has NO fetch, REST fallback, worker, timer, or background warmup.
  app.get('/api/replay/cached-history', (req, res) => {
    const exchange = req.query.exchange;
    const market = req.query.market;
    const timeframe = req.query.timeframe;
    const rawSymbol = req.query.symbol;
    const rawBefore = req.query.beforeTime;
    if (typeof exchange !== 'string' || !['binance', 'bybit'].includes(exchange)
      || typeof market !== 'string' || !['spot', 'futures'].includes(market)
      || typeof timeframe !== 'string' || !['1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe)
      || typeof rawSymbol !== 'string' || !/^[A-Za-z0-9]{3,30}$/.test(rawSymbol)
      || typeof rawBefore !== 'string' || !/^[0-9]{9,11}$/.test(rawBefore)) {
      return res.status(400).json({ success: false, error: 'Invalid replay history parameters' });
    }
    const beforeTime = Number(rawBefore);
    if (!Number.isSafeInteger(beforeTime) || beforeTime <= 0 || beforeTime > Math.ceil(Date.now() / 1000)) {
      return res.status(400).json({ success: false, error: 'Invalid replay time' });
    }
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 1800;
    const limit = Number.isSafeInteger(rawLimit) ? Math.max(1, Math.min(1800, rawLimit)) : 1800;
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ success: true, cacheOnly: true, data: replayHistoryCache.olderThan({
      exchange: exchange as ExchangeId,
      market: market as MarketType,
      symbol: normalizeExchangeSymbol(rawSymbol),
      timeframe: timeframe as Timeframe,
    }, beforeTime, limit) });
  });

  // Klines endpoint for interactive chart
  app.get('/api/klines', async (req, res) => {
    try {
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const market = (req.query.market as MarketType) || 'futures';
      const rawSymbol = (req.query.symbol as string) || 'BTCUSDT';
      const symbol = normalizeExchangeSymbol(rawSymbol);
      const timeframe = (req.query.timeframe as Timeframe) || '1h';
      const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit as string, 10) || 500, 10), 1000) : 500;
      const startTime = req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined;
      const endTime = req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined;

      const klines = await fetchKlines(exchange, market, symbol, timeframe, limit, startTime, endTime,
        { chart: true });
      res.json({ success: true, symbol, exchange, timeframe, data: klines });
    } catch (err: any) {
      console.error('Error fetching klines:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch klines' });
    }
  });

  // Exact rolling trade count from Binance's 24h ticker (null if unsupported).
  app.get('/api/chart/trades24h', async (req, res) => {
    const exchange = String(req.query.exchange || '').toLowerCase();
    const market = String(req.query.market || '').toLowerCase();
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!['binance', 'bybit'].includes(exchange) || !['spot', 'futures'].includes(market) ||
        !/^[A-Z0-9]{3,30}$/.test(symbol)) {
      return res.status(400).json({ success: false, trades24h: null, error: 'Invalid market or symbol' });
    }
    res.setHeader('Cache-Control', 'public, max-age=30');
    try {
      const trades24h = await fetch24hTradeCount(exchange, market as MarketType, symbol);
      const volume24hUsd = marketTickerFeed.getCached24hVolumeUsd(exchange as ExchangeId, market as MarketType, symbol);
      res.json({ success: true, trades24h, volume24hUsd, source: exchange === 'binance' ? 'binance_24h_ticker' : 'not_available' });
    } catch {
      res.json({ success: true, trades24h: null, volume24hUsd: marketTickerFeed.getCached24hVolumeUsd(exchange as ExchangeId, market as MarketType, symbol), source: 'unavailable' });
    }
  });

  // Dual Exchange Open Interest (Binance & Bybit)
  app.get('/api/derivatives/oi', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      const baseAsset = (req.query.baseAsset as string) || undefined;
      const price = req.query.price ? parseFloat(req.query.price as string) : undefined;

      const oi = await fetchDualExchangeOI(symbol, baseAsset, price);
      res.json({ success: true, ...oi });
    } catch (err: any) {
      console.error('Error in /api/derivatives/oi:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch OI' });
    }
  });

  // Historical open-interest candles used by HookChart indicators.
  app.get('/api/derivatives/oi/history', async (req, res) => {
    try {
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : 'BTCUSDT';
      const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1h';
      if (symbol.length > 80 || !/^[\p{L}\p{M}\p{N}_/-]+$/u.test(symbol)) {
        return res.status(400).json({ success: false, error: 'Invalid symbol' });
      }
      const history = await fetchHookChartOIHistory(symbol, timeframe);
      res.json({ success: true, ...history });
    } catch {
      res.status(503).json({ success: false, error: 'Open interest history is temporarily unavailable' });
    }
  });

  installTelegramRoutes(app);

  // Price Alerts CRUD endpoints (with per-user scoping)
  app.get('/api/alerts', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId || userId === 'guest') {
        return res.json({
          success: true,
          alerts: [],
          isTelegramConfigured: false,
        });
      }
      const alerts = getAllAlerts(userId);
      const userTg = getUserTelegram(userId);
      res.json({
        success: true,
        alerts,
        isTelegramConfigured: Boolean(userTg?.botToken && userTg?.chatId && userTg?.confirmedAt),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // User alerts sync endpoint (connects client-side user alerts to backend background price monitor)
  app.post('/api/alerts/sync', (req, res) => {
    try {
      const { userId, alerts, telegramBotToken, telegramChatId, language } = req.body;
      if (!userId || userId === 'guest' || !Array.isArray(alerts)) {
        return res.status(400).json({ success: false, error: 'Valid userId and alerts array required' });
      }
      const merged = syncUserAlerts(
        userId,
        alerts,
        telegramBotToken,
        telegramChatId,
        language ? normalizeLanguage(language) : undefined
      );
      res.json({ success: true, count: merged.length, alerts: merged });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get alert notification history
  app.get('/api/alerts/history', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId || userId === 'guest') {
        return res.json({ success: true, history: [] });
      }
      const history = getAlertHistory(userId);
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear alert history
  app.post('/api/alerts/history/clear', (req, res) => {
    try {
      const userId = (req.body?.userId || req.query.userId) as string | undefined;
      const cleared = clearAlertHistory(userId);
      res.json({ success: true, cleared });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete single history item
  app.delete('/api/alerts/history/:id', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const success = deleteHistoryItem(req.params.id, userId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/alerts', (req, res) => {
    try {
      const {
        id,
        symbol,
        exchange,
        marketType,
        targetPrice,
        condition,
        note,
        formationName,
        levelType,
        userId,
        telegramBotToken,
        telegramChatId,
        language,
        isActive,
      } = req.body;

      if (!symbol || targetPrice === undefined || !condition) {
        return res.status(400).json({ success: false, error: 'Вкажіть символ, цільову ціну та умову (gte або lte)' });
      }

      const numPrice = parseFloat(targetPrice);
      if (!Number.isFinite(numPrice) || numPrice <= 0 || !['gte', 'lte'].includes(condition)) {
        return res.status(400).json({ success: false, error: 'Цільова ціна повинна бути додатнім числом' });
      }

      if (!userId || userId === 'guest') {
        return res.status(401).json({
          success: false,
          error: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть або зареєструйтесь.',
        });
      }

      const alert = createAlert({
        id: id ? String(id).trim() : undefined,
        userId: String(userId),
        symbol: symbol.toUpperCase().replace('/', '').trim(),
        exchange: exchange || 'binance',
        marketType: marketType || 'futures',
        targetPrice: numPrice,
        condition,
        note: note ? String(note).trim() : undefined,
        formationName: formationName ? String(formationName).trim() : undefined,
        levelType: levelType || 'custom',
        telegramBotToken: telegramBotToken ? String(telegramBotToken).trim() : undefined,
        telegramChatId: telegramChatId ? String(telegramChatId).trim() : undefined,
        language: language ? normalizeLanguage(language) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });

      const cfg = getUserTelegram(userId);
      res.json({
        success: true,
        alert,
        isTelegramConfigured: Boolean(cfg?.botToken && cfg?.chatId && cfg?.confirmedAt),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch create alerts (e.g., all 3 levels: Entry, Take-Profit, Stop-Loss simultaneously)
  app.post('/api/alerts/batch', (req, res) => {
    try {
      const { userId, alerts, telegramBotToken, telegramChatId, language } = req.body;

      if (!userId || userId === 'guest') {
        return res.status(401).json({
          success: false,
          error: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть.',
        });
      }

      if (!Array.isArray(alerts) || alerts.length === 0) {
        return res.status(400).json({ success: false, error: 'Масив сповіщень порожній або відсутній' });
      }

      if (alerts.some(a => !a || typeof a.symbol !== 'string' || !a.symbol.trim() ||
        !Number.isFinite(Number(a.targetPrice)) || Number(a.targetPrice) <= 0 || !['gte', 'lte'].includes(a.condition))) {
        return res.status(400).json({ success: false, error: 'Некоректні рівні сповіщень' });
      }
      const created = createAlertsBatch(
        String(userId),
        alerts,
        telegramBotToken,
        telegramChatId,
        language ? normalizeLanguage(language) : undefined
      );
      const cfg = getUserTelegram(userId);
      res.json({
        success: true,
        count: created.length,
        alerts: created,
        isTelegramConfigured: Boolean(cfg?.botToken && cfg?.chatId && cfg?.confirmedAt),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Atomic 3 Price Alerts group creation (ENTRY, TARGET, STOP) for a setup
  app.post('/api/alerts/setup-group', (req, res) => {
    try {
      const { userId, setup, currentPrice, autoActivate } = req.body;
      if (!userId || userId === 'guest') {
        return res.status(401).json({
          success: false,
          error: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів.',
        });
      }
      if (!setup) {
        return res.status(400).json({ success: false, error: 'Дані сетапу відсутні' });
      }

      const result = createSetupAlertsGroup(
        String(userId),
        setup,
        currentPrice ? Number(currentPrice) : undefined,
        autoActivate !== undefined ? Boolean(autoActivate) : true
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, count: result.alerts?.length || 0, alerts: result.alerts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/alerts/:id', (req, res) => {
    try {
      const userId = (req.query.userId || req.body?.userId) as string | undefined;
      const success = deleteAlert(req.params.id, userId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/alerts/:id/toggle', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const alert = toggleAlert(req.params.id, userId, typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined);
      if (!alert) {
        return res.status(404).json({ success: false, error: 'Алерт не знайдено' });
      }
      res.json({ success: true, alert });
    } catch (err: any) {
      if (err instanceof AlertDispatchPendingError)
        return res.status(409).setHeader('Retry-After', '5').json({ success: false, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/alerts/clear-triggered', (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const count = clearTriggeredAlerts(userId);
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Authenticated SSE via fetch() Authorization header (never a token in the URL).
  // The payload is an invalidation number, never another user's coin list.
  app.get('/api/surveillance/stream', (_req, res) => {
    const userId = String(res.locals.userId || '');
    if (!userId || userId === 'guest') { res.status(401).end(); return; }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const unsubscribe = subscribeSurveillance(userId, (version, urgent) => {
      // One authenticated invalidation only; never stream private signals or
      // exchange data across accounts. Critical alerts bypass routine polling.
      const event = urgent ? 'alert' : 'changed';
      if (!res.writableEnded && !res.write(`event: ${event}\ndata: ${version}\n\n`)) {
        res.end(); // disconnect slow clients rather than buffer indefinitely
      }
    });
    if (!unsubscribe) { res.status(503).setHeader('Retry-After', '10').end(); return; }
    res.flushHeaders();
    res.write('retry: 10000\n\n');
    const keepalive = setInterval(() => {
      if (!res.writableEnded && !res.write(': keepalive\n\n')) res.end();
    }, 25000);
    res.on('close', () => { clearInterval(keepalive); unsubscribe(); });
  });

  // Surveillance endpoints
  app.get('/api/surveillance', (req, res) => {
    try {
      const requestedId = (req.query.userId as string | undefined)?.trim();
      const userId = requestedId && requestedId !== '' ? requestedId : 'guest';
      const list = loadSurveillanceList(userId);
      res.json({ success: true, data: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Compact authenticated symbol autocomplete: only the selected exchange
  // and market, using the existing shared screener/WebSocket ticker catalog.
  // No additional per-letter exchange request or full-market payload to client.
  app.get('/api/surveillance/symbols', async (req, res) => {
    const exchange = req.query.exchange;
    const marketType = req.query.marketType;
    const query = req.query.q;
    if ((exchange !== 'binance' && exchange !== 'bybit') ||
        (marketType !== 'futures' && marketType !== 'spot') ||
        typeof query !== 'string' || query.length > 40) {
      return res.status(400).json({ success: false, error: 'Невірні параметри пошуку монет' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    if (!query.trim() || !/^[\p{L}\p{M}\p{N}\s/_-]+$/u.test(query))
      return res.json({ success: true, data: [] });
    try {
      const catalog = await marketTickerFeed.get(exchange, marketType);
      const status = marketTickerFeed.status(exchange, marketType).status;
      if (!catalog.length || status === 'unavailable')
        return res.status(503).json({ success: false, code: 'MARKET_UNAVAILABLE', data: [] });
      const data = searchSurveillanceSymbols(query, catalog, 8)
        .map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset }));
      return res.json({ success: true, data });
    } catch {
      return res.status(503).json({ success: false, code: 'MARKET_UNAVAILABLE', data: [] });
    }
  });

  app.post('/api/surveillance', async (req, res) => {
    try {
      const { symbol, exchange, marketType, userId, config } = req.body;
      const uid = (userId && String(userId).trim()) || 'guest';
      const configError = config === undefined ? null : validateSurveillanceConfig(config);
      if (configError) return res.status(400).json({ success: false, error: configError });
      if (typeof symbol !== 'string' || !symbol.trim()) {
        return res.status(400).json({ success: false, error: 'Тікер монети не вказано' });
      }
      if ((exchange && !['binance', 'bybit'].includes(exchange)) ||
          (marketType && !['spot', 'futures'].includes(marketType))) {
        return res.status(400).json({ success: false, error: 'Невірна біржа або ринок' });
      }
      const selectedExchange: ExchangeId = exchange || 'binance';
      const selectedMarket: MarketType = marketType || 'futures';
      const messages = {
        INVALID_SYMBOL: 'Невірний тикер монети',
        UNSUPPORTED_QUOTE: '24/7-нагляд підтримує пари USDT. Оберіть пару з USDT.',
        UNKNOWN_PAIR: 'Такої пари USDT немає на вибраній біржі та ринку',
        MARKET_UNAVAILABLE: 'Не вдалося перевірити скорочену назву монети. Повторіть, коли біржа буде доступна.',
      } as const;
      // Reject malformed requests before touching even the shared quote feed.
      const preliminary = resolveSurveillanceSymbol(symbol, []);
      if ('code' in preliminary && preliminary.code !== 'MARKET_UNAVAILABLE')
        return res.status(400).json({ success: false, code: preliminary.code, error: messages[preliminary.code] });

      // Uses the shared Screener/WS catalog; no extra per-symbol market poll.
      const tickerCatalog = await marketTickerFeed.get(selectedExchange, selectedMarket);
      const resolved = resolveSurveillanceSymbol(symbol, tickerCatalog);
      if ('code' in resolved)
        return res.status(resolved.code === 'MARKET_UNAVAILABLE' ? 503 : 400)
          .json({ success: false, code: resolved.code, error: messages[resolved.code] });
      const { symbol: cleanSymbol, baseAsset, quoteAsset } = resolved;
      const list = loadSurveillanceList(uid);

      // Re-adding either BTC or BTCUSDT upgrades an existing legacy "BTC"
      // subscription in place, preserving its ID and custom alert settings.
      const legacyBaseSymbol = cleanSymbol.slice(0, -4);
      const existing = list.find(c => c.symbol === cleanSymbol && c.exchange === selectedExchange && c.marketType === selectedMarket)
        || (resolved.verified
          ? list.find(c => c.symbol === legacyBaseSymbol && c.quoteAsset === 'USDT'
            && c.exchange === selectedExchange && c.marketType === selectedMarket) : undefined);
      if (existing) {
        if (!canActivateSurveillance(list, existing.id))
          return res.status(429).json({ success:false,
            error: `Ліміт: ${MAX_SURVEILLANCE_ACTIVE} активних монет у нагляді на користувача.` });
        // Do not mutate the authoritative cache before a durable save.
        // Old instrument-specific state must not be reused after repair.
        const instrumentChanged = existing.symbol !== cleanSymbol;
        const activeCoin = {
          ...existing, symbol: cleanSymbol, baseAsset, quoteAsset, isActive: true,
          updatedAt: new Date().toISOString(),
          ...(instrumentChanged ? { state: undefined, lastCheckedAt: undefined, lastNotifiedAt: undefined } : {}),
          ...(config && !instrumentChanged ? { config: { ...existing.config, ...config } } : {}),
        };
        if (!saveSurveillanceList(uid, list.map(c => c.id === existing.id ? activeCoin : c)))
          return res.status(503).json({ success: false, error: 'Не вдалося зберегти нагляд. Спробуйте пізніше.' });
        surveillanceManager.startWorkerForCoin(activeCoin);
        const { coin: checked } = await checkCoinSurveillance(activeCoin, true);
        // The subscription is already saved. If exchange candles are down,
        // report a pending first analysis rather than inventing a fresh one.
        if (!hasFreshSurveillanceCheck(activeCoin, checked))
          return res.json({ success: true, pending: true, coin: activeCoin,
            message: 'Нагляд активовано. Очікуємо актуальні свічки біржі.' });
        const committed = commitSurveillanceCheck(checked);
        if (!committed) return res.status(404).json({ success: false, error: 'Монету видалено під час перевірки' });
        if (!wasSurveillanceCheckCommitted(checked, committed))
          return res.status(409).json({ success: false, error: 'Налаштування монети змінилися під час перевірки' });
        return res.json({ success: true, coin: committed, message: 'Монету активовано для системного нагляду' });
      }

      if (!canSaveSurveillance(list))
        return res.status(429).json({ success:false,
          error: `Ліміт: ${MAX_SURVEILLANCE_SAVED} збережених монет на користувача.` });
      if (!canActivateSurveillance(list))
        return res.status(429).json({ success:false,
          error: `Ліміт: ${MAX_SURVEILLANCE_ACTIVE} активних монет у нагляді на користувача.` });
      const defaultCfg = getDefaultSurveillanceConfig();
      const newCoin = {
        id: `surv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: uid,
        symbol: cleanSymbol,
        baseAsset,
        quoteAsset,
        exchange: selectedExchange,
        marketType: selectedMarket,
        isActive: true, // Always active upon addition until user explicitly pauses or removes
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config: { ...defaultCfg, ...(config || {}) },
      };

      list.unshift(newCoin);
      if (!saveSurveillanceList(uid, list))
        return res.status(503).json({ success: false, error: 'Не вдалося зберегти монету. Спробуйте пізніше.' });
      surveillanceManager.startWorkerForCoin(newCoin);
      const { coin: checkedCoin } = await checkCoinSurveillance(newCoin, true);
      if (!hasFreshSurveillanceCheck({ lastCheckedAt: undefined }, checkedCoin))
        return res.json({ success: true, pending: true, coin: newCoin,
          message: 'Монету збережено в нагляді. Очікуємо актуальні свічки біржі.' });
      const committed = commitSurveillanceCheck(checkedCoin);
      if (!committed) return res.status(404).json({ success: false, error: 'Монету видалено під час перевірки' });
      if (!wasSurveillanceCheckCommitted(checkedCoin, committed))
        return res.status(409).json({ success: false, error: 'Налаштування монети змінилися під час перевірки' });

      res.json({ success: true, coin: committed, message: 'Монету успішно додано на 24/7 системний нагляд!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/surveillance/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, config, isActive } = req.body;
      const configError = config === undefined ? null : validateSurveillanceConfig(config);
      if (configError) return res.status(400).json({ success: false, error: configError });
      const found = findSurveillanceCoinById(id, userId);

      if (!found) {
        return res.status(404).json({ success: false, error: 'Монету не знайдено в нагляді' });
      }

      const coin = found.coin;
      const nextActive = isActive !== undefined ? Boolean(isActive) : coin.isActive;
      if (nextActive && !canActivateSurveillance(found.list, coin.id))
        return res.status(429).json({ success:false,
          error: `Ліміт: ${MAX_SURVEILLANCE_ACTIVE} активних монет у нагляді на користувача.` });
      const updatedCoin = {
        ...coin,
        isActive: nextActive,
        config: config ? { ...coin.config, ...config } : coin.config,
        updatedAt: new Date().toISOString(),
      };

      const nextList = found.list.slice();
      nextList[found.index] = updatedCoin;
      if (!saveSurveillanceList(found.userId, nextList))
        return res.status(503).json({ success: false, error: 'Зміни не збережено. Спробуйте пізніше.' });

      // Keep 24/7 worker synced with updated coin config & active state (#4)
      if (updatedCoin.isActive) {
        surveillanceManager.startWorkerForCoin(updatedCoin);
      } else {
        surveillanceManager.stopWorkerForCoin(updatedCoin.id, updatedCoin.userId);
      }

      res.json({ success: true, coin: updatedCoin });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch toggle all coins active/paused for user
  app.post('/api/surveillance/toggle-all', (req, res) => {
    try {
      const { userId, isActive } = req.body;
      const uid = (userId && String(userId).trim()) || 'guest';
      if (Boolean(isActive) && loadSurveillanceList(uid).length > MAX_SURVEILLANCE_ACTIVE)
        return res.status(429).json({ success:false,
          error: `Можна активувати одночасно не більше ${MAX_SURVEILLANCE_ACTIVE} монет.` });
      const updatedList = setAllSurveillanceCoinsActive(uid, Boolean(isActive));
      res.json({ success: true, data: updatedList });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/surveillance/:id', (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.query.userId as string) || req.body?.userId;
      const found = findSurveillanceCoinById(id, userId);

      if (!found) {
        return res.status(404).json({ success: false, error: 'Монету не знайдено в нагляді' });
      }

      const filtered = found.list.filter((c) => c.id !== id);
      if (!saveSurveillanceList(found.userId, filtered))
        return res.status(503).json({ success: false, error: 'Не вдалося видалити монету. Спробуйте пізніше.' });
      surveillanceManager.stopWorkerForCoin(id, found.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/surveillance/check-all', async (req, res) => {
    try {
      const { userId } = req.body;
      const uid = userId || 'guest';
      if (!userWorkThrottle.allow(uid, 'check-all', 60000))
        return res.status(429).setHeader('Retry-After', '60').json({ success:false,
          error: 'Повторна повна перевірка доступна раз на хвилину.' });
      const updatedList = await checkAllUserCoins(uid);
      res.json({ success: true, data: updatedList });
    } catch (err: any) {
      if (err instanceof SurveillanceCheckIncompleteError)
        return res.status(503).setHeader('Retry-After', '10').json({
          success: false, error: err.message,
        });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/surveillance/:id/check', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, forceNotify } = req.body;
      const found = findSurveillanceCoinById(id, userId);

      if (!found) {
        return res.status(404).json({ success: false, error: 'Монету не знайдено' });
      }

      if (!userWorkThrottle.allow(found.userId, 'check:' + id, 20000))
        return res.status(429).setHeader('Retry-After', '20').json({ success:false,
          error: 'Повторна перевірка монети доступна через 20 секунд.' });
      // Manual checks never bypass the server's notification cooldown by default.
      const { coin: updated } = await checkCoinSurveillance(found.coin, {
        forceCheck: true,
        forceNotify: Boolean(forceNotify),
      });
      if (!hasFreshSurveillanceCheck(found.coin, updated))
        return res.status(503).setHeader('Retry-After', '10').json({
          success: false, error: 'Біржа не надала актуальних свічок для перевірки. Спробуйте пізніше.',
        });
      const committed = commitSurveillanceCheck(updated);
      if (!committed) return res.status(404).json({ success: false, error: 'Монету видалено під час перевірки' });
      if (!wasSurveillanceCheckCommitted(updated, committed))
        return res.status(409).json({ success: false, error: 'Налаштування монети змінилися під час перевірки' });

      res.json({ success: true, coin: committed });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Granular live worker snapshot (orderbook, trade flow, densities, setups, OI)
  app.get('/api/surveillance/worker/:id', (req, res) => {
    try {
      const { id } = req.params;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : 'guest';
      const snapshot = surveillanceManager.getWorkerSnapshot(id, userId);
      if (snapshot && snapshot.userId !== userId) {
        return res.status(404).json({ success: false, error: 'Worker not found' });
      }
      if (!snapshot) {
        return res.status(404).json({ success: false, error: 'Worker not found or not active' });
      }
      res.json({ success: true, data: snapshot });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Causal historical replay / backtest without look-ahead bias
  app.post('/api/surveillance/backtest', async (req, res) => {
    try {
      const { symbol, exchange, marketType, timeframe } = req.body;
      const owner = String(res.locals.userId || '');
      if (typeof symbol !== 'string' || !symbol.trim()) {
        return res.status(400).json({ success: false, error: 'Оберіть монету для бектесту' });
      }
      const sym = symbol.toUpperCase().trim();
      const ex = exchange || 'binance';
      const mkt = marketType || 'futures';
      const tf = timeframe || '15m';
      if (!/^[\p{L}\p{M}\p{N}]+$/u.test(sym) || !['binance', 'bybit'].includes(ex) ||
          !['spot', 'futures'].includes(mkt) || !['1m', '5m', '15m', '1h', '4h'].includes(tf)) {
        return res.status(400).json({ success: false, error: 'Невірні параметри бектесту' });
      }

      // Deduplicate repeated backtests for one instrument and cap even attempts
      // on many different symbols to five per account per minute.
      if (!userWorkThrottle.allow(owner, 'backtest:' + ex + ':' + mkt + ':' + sym + ':' + tf, 30000)
          || !userWorkQuota.allow(owner, 'backtest', 5, 60000))
        return res.status(429).setHeader('Retry-After', '30').json({ success:false,
          error: 'Занадто часті бектести. Повторіть пізніше.' });
      const asOf = Date.now();
      const klines = await fetchKlines(ex, mkt, sym, tf, tf === '1m' ? 500 : 200,
        undefined, undefined, { requireFresh: true }).catch(() => []);
      if (klines.length < 50) {
        return res.status(503).json({ success: false, error: 'Недостатньо історичних даних з обраної біржі' });
      }
      const result = surveillanceReplayEngine.runCausalBacktest(sym, klines, tf, asOf);
      if (result.closedCandles < 50) {
        return res.status(503).json({ success: false, error: 'Недостатньо коректних закритих свічок з обраної біржі' });
      }
      res.json({ success: true, data: { ...result, exchange: ex, marketType: mkt, symbol: sym } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get aggregated surveillance events across all tracked coins for user
  app.get('/api/surveillance/events', (req, res) => {
    try {
      const { userId } = req.query;
      const uid = typeof userId === 'string' && userId.trim() ? userId.trim() : 'guest';
      const coins = loadSurveillanceList(uid);
      const allEvents: any[] = [];

      for (const coin of coins) {
        if (coin.state?.recentEvents && Array.isArray(coin.state.recentEvents)) {
          for (const ev of coin.state.recentEvents) {
            allEvents.push({
              ...ev,
              coinId: coin.id,
              symbol: coin.symbol,
              baseAsset: coin.baseAsset,
              quoteAsset: coin.quoteAsset,
              exchange: coin.exchange,
              marketType: coin.marketType,
            });
          }
        }
      }

      allEvents.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      res.json({ success: true, data: allEvents });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    // A dynamic import prevents the bundler/dev server (and its glob parser)
    // from initializing in the production process. The production branch
    // continues to serve prebuilt static assets exactly as before.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/server/data/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    installProductionAssets(app, distPath);
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Crypto Pattern Screener server running on http://0.0.0.0:${PORT}`);
    // Start unified background CRON for all notifications (Price Alerts 5s, Surveillance 15s, Screener 60s)
    startAuthMailWorker();
    startTelegramDeliveryWorker();
    startSharedTelegramBot();
    cronManager.init();
    binanceTickerStream.start();
  });
  const depthFeed = installHookChartDepthStream(httpServer);
  const klineRelay = installHookChartKlineRelay(httpServer);
  installScreenerLiveQuotes(httpServer);
  installMarketSentimentStream(httpServer);
  installLiquidationStream(httpServer);
  if (process.env.NODE_ENV === 'production') {
    // Both site WebSocket handlers use noServer routing. Do not leave unknown
    // upgrade paths hanging with an open socket on a public VPS.
    httpServer.on('upgrade', (request, socket) => {
      const pathname = (request.url || '').split('?')[0];
      if (pathname !== '/api/hookchart/depth' && pathname !== '/api/hookchart/liquidations' &&
          pathname !== '/api/hookchart/klines' && pathname !== '/api/screener/live-quotes' &&
          pathname !== '/api/market/sentiment/live') {
        socket.destroy();
      }
    });
  }
  chartDepthMetrics = () => depthFeed.stats();
  chartKlineMetrics = () => klineRelay.stats();
}

startServer();

