import 'dotenv/config';
import { configureExchangeGateway, exchangeGatewayStatus } from './server/exchangeGateway';
import { installMarketRoutes, installMarketStreams } from './server/marketRelay';
import { fetchDomTradeHistoryPage } from './server/domTradeHistory';
import { scanDensities, watchDensityWalls, type DensityScanOptions } from './server/densityService';
import express from 'express';
import { installPaperFeed } from './server/paperFeed';
import { timingSafeEqual } from 'node:crypto';
import { accessService, getAccessAdminKey } from './server/accessService';
import { requireUser, authenticateLocal, revokeLocalToken, verifyUserToken, localEmailForUid, confirmLocalPasswordReset } from './server/authService';
import { dispatchPasswordReset, passwordResetStatusMessage } from './server/passwordResetService';
import { createTelegramLink, unlinkTelegram, startTelegramPolling, stopTelegramPolling, getTelegramPollingStatus } from './server/telegramLinkService';
import { initializeDataDirectory, DATA_DIR, readJson, writeJson } from './server/storage';
import { notificationOutbox } from './server/notificationOutbox';
import path from 'path';
import { runScreenerScan, fetchKlines, fetchMarketCoins, fetchOrderBook, fetchRecentTrades, fetchDomTickSize, fetchDualExchangeOI } from './server/marketService';
import { getMarketSourceStatuses } from './server/marketTickerFeed';
import { fetchHookChartOIHistory } from './server/hookchartOI';
import { analyzeFormationWithAI } from './server/geminiService';
import { generateSmartAnalysis } from './server/smartAnalysisService';
import { calculateMarketSentiment } from './server/sentimentService';
import {
  getEffectiveTelegramConfig,
  getTelegramBotInfo,
  testTelegramConnection,
  sendTelegramMessage,
} from './server/telegramService';
import {
  getAllAlerts,
  createAlert,
  createAlertsBatch,
  deleteAlert,
  toggleAlert,
  clearTriggeredAlerts,
  syncUserAlerts,
  getAlertHistory,
  clearAlertHistory,
  deleteHistoryItem,
  saveUserTelegram,
  getUserTelegram,
  createSetupAlertsGroup,
} from './server/alertService';
import { loadSurveillanceList, saveSurveillanceList, getDefaultSurveillanceConfig, checkCoinSurveillance, checkAllUserCoins, findSurveillanceCoinById, setAllSurveillanceCoinsActive, commitSurveillanceCheck, validateSurveillanceConfig } from './server/surveillanceService';
import { ExchangeId, MarketType, Timeframe } from './src/types';
import { normalizeLanguage, telegramText } from './src/locales';
import { normalizeExchangeSymbol } from './src/utils/marketSymbols';
import { cronManager } from './server/cronService';
import { surveillanceManager } from './server/surveillance/surveillanceManager';
import { surveillanceReplayEngine } from './server/surveillance/replayEngine';

async function startServer() {
  initializeDataDirectory();
  const cooldownFile = path.join(DATA_DIR, 'exchange-cooldowns.json');
  configureExchangeGateway({ holds: readJson(cooldownFile, {}), saveHolds: holds => writeJson(cooldownFile, holds),
    disabled: (process.env.MARKET_DISABLED_EXCHANGES || '').split(',').map(value => value.trim()).filter((value): value is ExchangeId => ['binance', 'bybit'].includes(value)) });
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '1mb' }));
  const authAttempts = new Map<string, { count: number; resetAt: number }>();
  app.post('/api/auth/local/:action', async (req, res) => {
    const action = req.params.action;
    if (!['login', 'register'].includes(action)) return res.sendStatus(404);
    const key = `${req.ip || 'unknown'}:${typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : ''}`;
    const now = Date.now();
    for (const [id, value] of authAttempts) if (value.resetAt <= now) authAttempts.delete(id);
    const attempts = authAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    authAttempts.set(key, attempts);
    if (++attempts.count > 20) return res.status(429).json({ success: false, error: 'Забагато спроб входу. Спробуйте через 15 хвилин' });
    try {
      const result = await authenticateLocal(req.body.email, req.body.password, action === 'register', req.body.displayName);
      res.json({ success: true, ...result });
    } catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
  });
  app.post('/api/auth/logout', requireUser, (req, res) => {
    const token = req.headers.authorization!.slice(7);
    if (token.startsWith('local.')) revokeLocalToken(token);
    res.json({ success: true });
  });
  // Both sign-in recovery and profile password changes are email-confirmed.
  // These routes intentionally precede the global /api authentication guard.
  const resetRequestAttempts = new Map<string, { count: number; resetAt: number }>();
  app.post('/api/auth/password-reset/request', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const fromProfile = req.body?.fromProfile === true;
    if (fromProfile) {
      try {
        const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
        if (!token) throw new Error('Missing session');
        const uid = await verifyUserToken(token);
        const localEmail = localEmailForUid(uid);
        if (localEmail) email = localEmail;
        else if (token.startsWith('local.')) throw new Error('Account not found');
        else {
          const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
          if (typeof claims.email !== 'string' || !claims.email) throw new Error('Account email missing');
          email = claims.email.trim().toLowerCase();
        }
      } catch {
        return void res.status(401).json({ success: false, error: 'Для зміни пароля увійдіть повторно.' });
      }
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return void res.status(400).json({ success: false, error: 'Введіть коректну адресу електронної пошти.' });
    const now = Date.now();
    for (const [key, value] of resetRequestAttempts) if (value.resetAt < now) resetRequestAttempts.delete(key);
    // Per-address and per-client limits; avoids mail flooding and token churn.
    const identifiers = ['mail:' + email, 'client:' + (req.ip || 'unknown')];
    for (const [index, key] of identifiers.entries()) {
      const attempts = resetRequestAttempts.get(key);
      if (attempts && attempts.count >= (index === 0 ? 3 : 600))
        return void res.status(429).json({ success: false, error: 'Забагато запитів. Спробуйте через годину.' });
    }
    for (const key of identifiers) {
      const value = resetRequestAttempts.get(key) || { count: 0, resetAt: now + 60 * 60_000 };
      value.count++;
      resetRequestAttempts.set(key, value);
    }
    try {
      await dispatchPasswordReset(email);
      res.status(202).json({ success: true, message: passwordResetStatusMessage });
    } catch (error) {
      console.error('[Password reset] Delivery attempt failed:', error instanceof Error ? error.message : 'unknown');
      res.status(503).json({ success: false, error: 'Не вдалося надіслати лист. Перевірте поштовий сервіс і спробуйте пізніше.' });
    }
  });
  const resetConfirmAttempts = new Map<string, { count: number; resetAt: number }>();
  app.post('/api/auth/password-reset/confirm', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const key = req.ip || 'unknown';
    const now = Date.now();
    const attempt = resetConfirmAttempts.get(key) || { count: 0, resetAt: now + 15 * 60_000 };
    if (attempt.resetAt <= now) { attempt.count = 0; attempt.resetAt = now + 15 * 60_000; }
    if (++attempt.count > 25)
      return void res.status(429).json({ success: false, error: 'Забагато спроб. Спробуйте пізніше.' });
    resetConfirmAttempts.set(key, attempt);
    try {
      await confirmLocalPasswordReset(req.body?.token, req.body?.password);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Посилання недійсне.' });
    }
  });

  const adminKey = getAccessAdminKey();
  app.post('/api/internal/access-admin', (req, res) => {
    const remote = req.socket.remoteAddress;
    const key = req.headers['x-hook2-admin'];
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote || '') || typeof key !== 'string' ||
        !/^[a-f0-9]{64}$/.test(key) || !timingSafeEqual(Buffer.from(key), Buffer.from(adminKey))) return res.sendStatus(403);
    try {
      if (typeof req.body.enabled !== 'boolean') return res.sendStatus(400);
      accessService.setAdmin(req.body.userId, req.body.enabled);
      res.json({ success: true });
    } catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
  });

  installPaperFeed(app);

  // Operational metadata stays public; every application data API requires a session.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' && ['/health', '/dom/status'].includes(req.path)) return next();
    requireUser(req, res, next);
  });
  app.get('/api/access/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, access: accessService.status(res.locals.userId) });
  });
  // Retired access-code routes must not fall through to the SPA HTML handler.
  app.all(['/api/access/redeem', '/api/access/admin', '/api/access/admin/*'], (_req, res) => res.sendStatus(404));
  // All registered accounts have permanent access; no code redemption or paid API gates.

  installMarketRoutes(app);

  // Health check
  app.get('/api/health', (req, res) => {
    const release = /^[a-f0-9]{40}$/.test(process.env.APP_COMMIT || '') ? process.env.APP_COMMIT : 'manual';
    res.json({ status: 'ok', timestamp: Date.now(), release });
  });

  // Unified Cron Status & Diagnostics
  app.get('/api/cron/status', (req, res) => {
    try {
      const status = cronManager.getStatus(res.locals.userId);
      res.json({ success: true, ...status, delivery: notificationOutbox.stats(res.locals.userId), telegramPolling: getTelegramPollingStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get cron status' });
    }
  });

  // Manual Trigger for Cron Jobs (e.g. from external cron services or user test button)
  app.post('/api/cron/run', async (req, res) => {
    try {
      const jobId = (req.body?.job || 'all').toString();
      const result = await cronManager.triggerJob(jobId, res.locals.userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to trigger cron job' });
    }
  });

  // Test notification dispatch pipeline (Telegram + in-app)
  app.post('/api/cron/test-alert', async (req, res) => {
    try {
      const { userId, symbol, note, language } = req.body;
      const testSymbol = (symbol || 'BTCUSDT').toUpperCase();
      const userTg = getUserTelegram(userId);
      const selectedLanguage = normalizeLanguage(language || userTg?.language);
      const effectiveToken = userTg?.botToken;
      const effectiveChat = userTg?.chatId;

      if (!effectiveToken || !effectiveChat) {
        return res.status(400).json({
          success: false,
          error: 'Підключіть Telegram через «Сповіщення → Налаштування» та натисніть Start у боті.',
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

      const tgResult = await sendTelegramMessage(testMsg, {
        botToken: effectiveToken,
        chatId: effectiveChat,
      });

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

  // Screener Scan endpoint
  app.get('/api/screener/scan', async (req, res) => {
    try {
      const exchange = (req.query.exchange as 'all' | ExchangeId) || 'all';
      const marketType = (req.query.marketType as 'all' | MarketType) || 'all';
      const timeframe = (req.query.timeframe as Timeframe) || '1h';
      const minVolumeUsd = req.query.minVolume !== undefined ? parseFloat(req.query.minVolume as string) : 50_000;

      if (!['all', 'binance', 'bybit'].includes(exchange) ||
          !['all', 'spot', 'futures'].includes(marketType) ||
          !['1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe) ||
          !Number.isFinite(minVolumeUsd) || minVolumeUsd < 0) {
        return void res.status(400).json({ success: false, error: 'Некоректні параметри скринера' });
      }

      const results = await runScreenerScan({
        exchange,
        marketType,
        timeframe,
        minVolumeUsd,
      });

      res.json({
        success: true,
        count: results.length,
        coinsWithFormationsCount: results.filter((c) => c.formations.length > 0).length,
        data: results,
      });
    } catch (err: any) {
      console.error('Error during screener scan:', err);
      res.status(500).json({ success: false, error: err.message || 'Scan failed' });
    }
  });

  // Public market quotes; keep the screener URL for clients from older deployments.
  app.get(['/api/market/quotes', '/api/screener/coins'], async (req, res) => {
    try {
      const exchange = (req.query.exchange as 'all' | ExchangeId) || 'all';
      const marketType = (req.query.marketType as 'all' | MarketType) || 'all';
      const minVolumeUsd = req.query.minVolume !== undefined ? parseFloat(req.query.minVolume as string) : 50_000;
      const maxVolumeUsd = req.query.maxVolume !== undefined ? parseFloat(req.query.maxVolume as string) : 10_000_000_000;

      if (!['all', 'binance', 'bybit'].includes(exchange) || !['all', 'spot', 'futures'].includes(marketType)
        || !Number.isFinite(minVolumeUsd) || !Number.isFinite(maxVolumeUsd)
        || minVolumeUsd < 0 || maxVolumeUsd < minVolumeUsd) {
        res.status(400).json({ success: false, error: 'Некоректні параметри біржі, ринку або обсягу' });
        return;
      }

      const coins = await fetchMarketCoins({
        exchange,
        marketType,
        minVolumeUsd,
        maxVolumeUsd,
      });

      const sources = getMarketSourceStatuses({ exchange, marketType });
      const available = sources.filter(source => source.status !== 'unavailable');
      const success = available.length > 0;
      res.setHeader('Cache-Control', 'no-store');
      res.status(success ? 200 : 503).json({
        success,
        count: coins.length,
        data: coins,
        timestamp: success ? Math.min(...available.map(source => source.updatedAt!)) : null,
        sources,
        partial: sources.some(source => source.status !== 'live'),
        ...(!success ? { error: sources.map(source => `${source.exchange} ${source.marketType}: ${source.error || 'дані недоступні'}`).join('; ') } : {}),
      });
    } catch (err: any) {
      console.error('Error fetching screener coins:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch coins' });
    }
  });

  // Market Sentiment endpoint ("Настрій Ринку")
  app.get('/api/market/sentiment', async (req, res) => {
    try {
      const sentiment = await calculateMarketSentiment();
      res.json({ success: true, data: sentiment });
    } catch (err: any) {
      console.error('Error calculating market sentiment:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to calculate market sentiment' });
    }
  });

  // Smart Analysis endpoint ("Розумний Аналіз")
  app.get('/api/market/smart-analysis', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // Older open tabs expect the former fabricated-data schema; never send them an incompatible payload.
    if (req.query.schema !== '2') return void res.json({ success: false, error: 'Аналіз оновлено. Перезавантажте сторінку, щоб отримати перевірені біржові дані.' });
    try {
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const marketType = (req.query.marketType as MarketType) || 'futures';
      const timeframe = (req.query.timeframe as Timeframe) || '1h';
      const currentPrice = req.query.price ? parseFloat(req.query.price as string) : undefined;

      const analysis = await generateSmartAnalysis({
        symbol,
        exchange,
        marketType,
        timeframe,
        currentPrice,
      });

      res.json({ success: true, data: analysis });
    } catch (err: any) {
      console.error('Error generating smart analysis:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to generate smart analysis' });
    }
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

      const klines = await fetchKlines(exchange, market, symbol, timeframe, limit, startTime, endTime);
      if (!klines.length) return void res.status(503).json({ success: false, sourceUnavailable: true,
        error: 'Історія свічок тимчасово недоступна. Повторіть спробу.', symbol, exchange, timeframe, data: [] });
      res.json({ success: true, symbol, exchange, timeframe, data: klines });
    } catch (err: any) {
      console.error('Error fetching klines:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch klines' });
    }
  });

  // Exchange instrument price precision for accurate DOM compression.
  app.get('/api/dom/tick-size', async (req, res) => {
    try {
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const market = (req.query.marketType as MarketType) || 'futures';
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      if (!['binance', 'bybit'].includes(exchange) || !['spot', 'futures'].includes(market)) {
        res.status(400).json({ success: false, error: 'Invalid exchange/market' });
        return;
      }
      const tickSize = await fetchDomTickSize(exchange, market, symbol);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(tickSize ? 200 : 503).json({ success: !!tickSize, tickSize });
    } catch (err: any) {
      res.status(503).json({ success: false, error: err?.message || 'Instrument metadata unavailable' });
    }
  });

  // Read-only deployment revision for post-deploy exchange/DOM smoke checks.
  app.get('/api/dom/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const revision = /^[a-f0-9]{40}$/.test(process.env.APP_COMMIT || '') ? process.env.APP_COMMIT : null;
    res.json({ success: true, revision, marketSources: getMarketSourceStatuses({ exchange: 'all', marketType: 'all' }),
      marketGateway: exchangeGatewayStatus() });
  });

  // Cursor-paginated real execution history used by footprint candles.
  app.get('/api/dom/trade-history', async (req, res) => {
    try {
      const exchange = req.query.exchange as ExchangeId;
      const marketType = req.query.marketType as MarketType;
      const symbol = req.query.symbol;
      const startTime = Number(req.query.startTime);
      const endTime = Number(req.query.endTime);
      const cursor = req.query.fromId === undefined ? undefined : Number(req.query.fromId);
      if (!['binance', 'bybit'].includes(exchange) || !['spot', 'futures'].includes(marketType) ||
          typeof symbol !== 'string' || !symbol || symbol.length > 64 ||
          !/^[\p{L}\p{M}\p{N}_./-]+$/u.test(symbol) ||
          !Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) ||
          !Number.isFinite(startTime) || endTime <= startTime ||
          endTime - startTime > 3_540_000 ||
          (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 0))) {
        res.status(400).json({ success: false, error: 'Invalid DOM history request' });
        return;
      }
      const result = await fetchDomTradeHistoryPage({
        exchange, marketType, symbol, startTime, endTime, fromId: cursor,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(err instanceof RangeError ? 400 : 503).json({
        success: false, error: err?.message || 'Trade history unavailable',
      });
    }
  });

  // Bounded multi-market density scan. Uses live exchange orderbooks, not synthetic depth.
  app.get('/api/densities/scan', async (req, res) => {
    try {
      const params = req.query;
      const stringParam = (value: unknown) => typeof value === 'string' ? value : '';
      const num = (value: unknown, fallback: number) => value === undefined ? fallback : Number(value);
      const exchange = stringParam(params.exchange) || 'all';
      const marketType = stringParam(params.marketType) || 'futures';
      const category = stringParam(params.category) || 'all';
      const quoteAsset = stringParam(params.quoteAsset).toUpperCase() || 'all';
      const side = stringParam(params.side) || 'both';
      const rawSymbols = stringParam(params.symbols).toUpperCase();
      const symbols = rawSymbols.split(',').map(v => v.trim()).filter(Boolean);
      const search = stringParam(params.search).trim().toUpperCase();
      const options: DensityScanOptions = {
        exchange: exchange as DensityScanOptions['exchange'],
        marketType: marketType as DensityScanOptions['marketType'],
        category: category as DensityScanOptions['category'],
        quoteAsset: (quoteAsset === 'ALL' ? 'all' : quoteAsset) as DensityScanOptions['quoteAsset'],
        symbols,
        search,
        side: side as DensityScanOptions['side'],
        minNotionalUsd: num(params.minNotionalUsd, 100_000),
        minVolumeUsd: num(params.minVolumeUsd, 0),
        strengthMultiplier: num(params.strengthMultiplier, 1.8),
        maxDistancePct: num(params.maxDistancePct, 2),
        bucketPct: num(params.bucketPct, 0.1),
        limit: num(params.limit, 24),
        offset: num(params.offset, 0),
      };
      if (!['all', 'binance', 'bybit'].includes(exchange) ||
          !['all', 'spot', 'futures'].includes(marketType) ||
          !['all', 'crypto', 'stocks', 'custom'].includes(category) ||
          !['ALL', 'USDT', 'USDC'].includes(quoteAsset) ||
          !['both', 'bid', 'ask'].includes(side) ||
          rawSymbols.length > 600 || symbols.length > 40 ||
          symbols.some(v => !/^[A-Z0-9]{2,30}$/.test(v)) ||
          search.length > 40 || (search && !/^[A-Z0-9]+$/.test(search)) ||
          options.minNotionalUsd < 1_000 || options.minNotionalUsd > 1_000_000_000 ||
          options.minVolumeUsd < 0 || options.minVolumeUsd > 100_000_000_000 ||
          options.strengthMultiplier < 1 || options.strengthMultiplier > 20 ||
          options.maxDistancePct < 0.1 || options.maxDistancePct > 20 ||
          options.bucketPct < 0.01 || options.bucketPct > 2 ||
          !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 24 ||
          !Number.isSafeInteger(options.offset) || options.offset < 0 || options.offset > 20000 ||
          [options.minNotionalUsd, options.minVolumeUsd, options.strengthMultiplier, options.maxDistancePct, options.bucketPct].some(v => !Number.isFinite(v))) {
        res.status(400).json({ success: false, error: 'Некоректні налаштування пошуку щільностей' });
        return;
      }
      const watchParam = stringParam(params.watch).trim();
      if (watchParam) {
        const ids = watchParam.split(',').map(id => id.trim());
        if (watchParam.length > 400 || ids.length > 8 ||
            ids.some(id => !/^(binance|bybit):(spot|futures):[A-Z0-9]{2,30}$/.test(id))) {
          res.status(400).json({ success: false, error: 'Некоректний список щільностей для перевірки' });
          return;
        }
        const result = await watchDensityWalls(options, ids);
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
        return;
      }
      const result = await scanDensities(options);
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.success ? 200 : 503).json(result);
    } catch (err: any) {
      console.error('Density scan failed:', err);
      res.status(503).json({ success: false, error: 'Не вдалося отримати дані стаканів з бірж' });
    }
  });

  // Orderbook depth endpoint for Scalper DOM
  app.get('/api/orderbook', async (req, res) => {
    try {
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const market = (req.query.marketType as MarketType) || (req.query.market as MarketType) || 'futures';
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit as string, 10) || 500, 20), 1000) : 500;

      const orderbook = await fetchOrderBook(exchange, market, symbol, limit);
      if (!orderbook.bids.length || !orderbook.asks.length) {
        res.status(503).json({ success: false, error: 'Order book snapshot unavailable' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...orderbook });
    } catch (err: any) {
      console.error('Error fetching orderbook:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch orderbook' });
    }
  });

  // Recent trades endpoint for Scalper DOM tape
  app.get('/api/trades', async (req, res) => {
    try {
      const exchange = (req.query.exchange as ExchangeId) || 'binance';
      const market = (req.query.marketType as MarketType) || (req.query.market as MarketType) || 'futures';
      const symbol = (req.query.symbol as string) || 'BTCUSDT';
      const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit as string, 10) || 60, 10), 100) : 60;

      const trades = await fetchRecentTrades(exchange, market, symbol, limit);
      res.json({ success: true, trades });
    } catch (err: any) {
      console.error('Error fetching trades:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch trades' });
    }
  });

  // Dual Exchange Open Interest (Binance & Bybit)
  app.get('/api/derivatives/oi/history', async (req, res) => {
    try {
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : 'BTCUSDT';
      const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1h';
      if (symbol.length > 80 || !/^[\p{L}\p{M}\p{N}_/-]+$/u.test(symbol)) return res.status(400).json({ success: false, error: 'Invalid symbol' });
      const history = await fetchHookChartOIHistory(symbol, timeframe);
      res.json({ success: true, ...history });
    } catch {
      res.status(503).json({ success: false, error: 'Open interest history is temporarily unavailable' });
    }
  });

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

  // AI Formation analysis endpoint
  app.post('/api/ai/analyze-formation', async (req, res) => {
    try {
      const { symbol, exchange, timeframe, formation, currentPrice, recentCandles } = req.body;
      if (!symbol || !formation) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const analysis = await analyzeFormationWithAI(
        symbol,
        exchange || 'binance',
        timeframe || '1h',
        formation,
        currentPrice || formation.levels?.entryPrice || 0,
        recentCandles || []
      );

      res.json({ success: true, analysis });
    } catch (err: any) {
      console.error('Error analyzing formation with AI:', err);
      res.status(500).json({ success: false, error: err.message || 'AI analysis failed' });
    }
  });

  // Telegram config and status endpoints
  app.get('/api/telegram/status', async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId || userId === 'guest') {
        return res.json({
          success: true,
          isConfigured: false,
          botUsername: undefined,
          chatId: undefined,
          hasBotToken: false,
          hasEnvToken: false,
          hasEnvChatId: false,
        });
      }

      const userTg = getUserTelegram(userId);
      const activeToken = userTg?.botToken || getEffectiveTelegramConfig().botToken;
      const activeChatId = userTg?.chatId;

      let botUsername: string | undefined;
      if (activeToken) {
        const info = await getTelegramBotInfo(activeToken);
        if (info.ok) botUsername = info.username;
      }
      res.json({
        success: true,
        isConfigured: Boolean(userTg?.botToken && activeChatId),
        sharedBotAvailable: Boolean(getEffectiveTelegramConfig().botToken),
        mode: userTg?.mode,
        delivery: notificationOutbox.stats(res.locals.userId),
        botUsername,
        chatId: activeChatId || undefined,
        hasBotToken: Boolean(activeToken),
        hasEnvToken: false,
        hasEnvChatId: false,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/connect', async (req, res) => {
    try { res.json({ success: true, ...await createTelegramLink(res.locals.userId, req.body.language) }); }
    catch (error: any) { res.status(503).json({ success: false, error: error.message }); }
  });
  app.post('/api/telegram/disconnect', (req, res) => {
    try { unlinkTelegram(res.locals.userId); res.json({ success: true }); }
    catch { res.status(500).json({ success: false, error: 'Не вдалося зберегти відключення Telegram' }); }
  });
  // Keep explicit legacy personal-bot setup compatible, without touching the server bot.
  app.post('/api/telegram/config', async (req, res) => {
    try {
      const { botToken, chatId, language } = req.body;
      if (typeof botToken !== 'string' || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken.trim()) ||
          typeof chatId !== 'string' || !/^-?\d+$/.test(chatId.trim())) return res.status(400).json({ success: false, error: 'Некоректні налаштування особистого бота' });
      if (botToken.trim() === getEffectiveTelegramConfig().botToken) return res.status(400).json({ success: false, error: 'Підключіть Telegram через кнопку підключення' });
      const info = await getTelegramBotInfo(botToken.trim());
      if (!info.ok) return res.status(400).json({ success: false, error: info.error });
      saveUserTelegram(res.locals.userId, { mode: 'custom', botToken: botToken.trim(), chatId: chatId.trim(), language: normalizeLanguage(language) }, true);
      res.json({ success: true, isConfigured: true, botUsername: info.username, chatId: chatId.trim() });
    } catch { res.status(500).json({ success: false, error: 'Не вдалося зберегти Telegram' }); }
  });
  app.post('/api/telegram/test', async (req, res) => {
    try {
      const saved = getUserTelegram(res.locals.userId);
      if (!saved?.botToken || !saved.chatId) return res.status(400).json({ success: false, error: 'Спочатку підключіть Telegram' });
      const result = await testTelegramConnection(saved.botToken, saved.chatId, normalizeLanguage(req.body.language || saved.language));
      res.json(result);
    } catch { res.status(500).json({ success: false, error: 'Помилка тестового надсилання' }); }
  });
  app.post('/api/telegram/detect-chat-id', (_req, res) => {
    res.status(410).json({ success: false, error: 'Підключіть Telegram через персональне одноразове посилання' });
  });

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
        isTelegramConfigured: Boolean(userTg?.botToken && userTg?.chatId),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // User alerts sync endpoint (connects client-side user alerts to backend background price monitor)
  app.post('/api/alerts/sync', (req, res) => {
    try {
      const { userId, alerts, language } = req.body;
      const telegramBotToken = undefined, telegramChatId = undefined;
      if (!userId || userId === 'guest' || !Array.isArray(alerts) || alerts.length > 1000 || alerts.some(a => !a || typeof a.id !== 'string' || !a.id || typeof a.symbol !== 'string' || !a.symbol.trim() || !Number.isFinite(Number(a.targetPrice)) || Number(a.targetPrice) <= 0 || !['gte', 'lte'].includes(a.condition) || !['binance', 'bybit'].includes(a.exchange) || !['spot', 'futures'].includes(a.marketType))) {
        return res.status(400).json({ success: false, error: 'Valid userId and alerts array required' });
      }
      const merged = syncUserAlerts(
        userId,
        alerts.map((a: any) => ({ ...a, userId, telegramBotToken: undefined, telegramChatId: undefined })),
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
        telegramBotToken: undefined,
        telegramChatId: undefined,
        language: language ? normalizeLanguage(language) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });

      const cfg = getUserTelegram(res.locals.userId) || {};
      res.json({
        success: true,
        alert,
        isTelegramConfigured: Boolean(cfg.botToken && cfg.chatId),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch create alerts (e.g., all 3 levels: Entry, Take-Profit, Stop-Loss simultaneously)
  app.post('/api/alerts/batch', (req, res) => {
    try {
      const { userId, alerts, language } = req.body;
      const telegramBotToken = undefined, telegramChatId = undefined;

      if (!userId || userId === 'guest') {
        return res.status(401).json({
          success: false,
          error: 'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть.',
        });
      }

      if (!Array.isArray(alerts) || alerts.length === 0 || alerts.length > 1000) {
        return res.status(400).json({ success: false, error: 'Масив сповіщень порожній або відсутній' });
      }

      if (alerts.some(a => !a || typeof a.symbol !== 'string' || !a.symbol.trim() ||
        !Number.isFinite(Number(a.targetPrice)) || Number(a.targetPrice) <= 0 || !['gte', 'lte'].includes(a.condition) || !['binance', 'bybit'].includes(a.exchange) || !['spot', 'futures'].includes(a.marketType))) {
        return res.status(400).json({ success: false, error: 'Некоректні рівні сповіщень' });
      }
      const created = createAlertsBatch(
        String(userId),
        alerts.map((a: any) => ({ ...a, userId, telegramBotToken: undefined, telegramChatId: undefined })),
        telegramBotToken,
        telegramChatId,
        language ? normalizeLanguage(language) : undefined
      );
      const cfg = getUserTelegram(res.locals.userId) || {};
      res.json({
        success: true,
        count: created.length,
        alerts: created,
        isTelegramConfigured: Boolean(cfg.botToken && cfg.chatId),
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

  app.post('/api/surveillance', async (req, res) => {
    try {
      const { symbol, baseAsset, quoteAsset, exchange, marketType, userId, config } = req.body;
      const uid = (userId && String(userId).trim()) || 'guest';
      const configError = config === undefined ? null : validateSurveillanceConfig(config);
      if (configError) return res.status(400).json({ success: false, error: configError });
      if (typeof symbol !== 'string' || !symbol.trim()) {
        return res.status(400).json({ success: false, error: 'Тікер монети не вказано' });
      }
      const cleanSymbol = symbol.toUpperCase().replace('/', '').trim();
      if (!/^[\p{L}\p{M}\p{N}]{1,64}$/u.test(cleanSymbol) ||
          (exchange && !['binance', 'bybit'].includes(exchange)) ||
          (marketType && !['spot', 'futures'].includes(marketType))) {
        return res.status(400).json({ success: false, error: 'Невірний символ, біржа або ринок' });
      }
      const list = loadSurveillanceList(uid);

      const existing = list.find((c) => c.symbol === cleanSymbol && c.exchange === (exchange || 'binance') && c.marketType === (marketType || 'futures'));
      if (existing) {
        // Coin already on surveillance: ensure it is active and update config/analysis
        existing.isActive = true; // Always active upon user add/resume
        existing.updatedAt = new Date().toISOString();
        if (config) {
          existing.config = { ...existing.config, ...config };
        }
        saveSurveillanceList(uid, list);
        surveillanceManager.startWorkerForCoin(existing);
        const { coin: checked } = await checkCoinSurveillance(existing, true);
        const committed = commitSurveillanceCheck(checked);
        if (!committed) return res.status(404).json({ success: false, error: 'Монету видалено під час перевірки' });
        return res.json({ success: true, coin: committed, message: 'Монету активовано для системного нагляду' });
      }

      const defaultCfg = getDefaultSurveillanceConfig();
      const newCoin = {
        id: `surv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: uid,
        symbol: cleanSymbol,
        baseAsset: baseAsset || cleanSymbol.replace('USDT', ''),
        quoteAsset: quoteAsset || 'USDT',
        exchange: exchange || 'binance',
        marketType: marketType || 'futures',
        isActive: true, // Always active upon addition until user explicitly pauses or removes
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config: { ...defaultCfg, ...(config || {}) },
      };

      list.unshift(newCoin);
      saveSurveillanceList(uid, list);
      surveillanceManager.startWorkerForCoin(newCoin);
      const { coin: checkedCoin } = await checkCoinSurveillance(newCoin, true);
      const committed = commitSurveillanceCheck(checkedCoin);
      if (!committed) return res.status(404).json({ success: false, error: 'Монету видалено під час перевірки' });

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
      const updatedCoin = {
        ...coin,
        isActive: nextActive,
        config: config ? { ...coin.config, ...config } : coin.config,
        updatedAt: new Date().toISOString(),
      };

      found.list[found.index] = updatedCoin;
      saveSurveillanceList(found.userId, found.list);

      // Keep 24/7 worker synced with updated coin config & active state (#4)
      if (updatedCoin.isActive) {
        surveillanceManager.startWorkerForCoin(updatedCoin);
      } else {
        surveillanceManager.stopWorkerForCoin(updatedCoin.id);
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
      saveSurveillanceList(found.userId, filtered);
      surveillanceManager.stopWorkerForCoin(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/surveillance/check-all', async (req, res) => {
    try {
      const { userId } = req.body;
      const uid = userId || 'guest';
      const updatedList = await checkAllUserCoins(uid);
      res.json({ success: true, data: updatedList });
    } catch (err: any) {
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

      // #6: Single coin manual check explicitly supports forceNotify if requested by user
      const { coin: updated } = await checkCoinSurveillance(found.coin, {
        forceCheck: true,
        forceNotify: Boolean(forceNotify),
      });
      const committed = commitSurveillanceCheck(updated);
      if (!committed) return res.status(404).json({ success: false, error: 'Монету видалено під час перевірки' });

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
      const snapshot = surveillanceManager.getWorkerSnapshot(id);
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
      if (typeof symbol !== 'string' || !symbol.trim()) {
        return res.status(400).json({ success: false, error: 'Оберіть монету для бектесту' });
      }
      const sym = symbol.toUpperCase().trim();
      const ex = exchange || 'binance';
      const mkt = marketType || 'futures';
      const tf = timeframe || '15m';
      if (!/^[\p{L}\p{M}\p{N}]{1,64}$/u.test(sym) || !['binance', 'bybit'].includes(ex) ||
          !['spot', 'futures'].includes(mkt) || !['1m', '5m', '15m', '1h', '4h'].includes(tf)) {
        return res.status(400).json({ success: false, error: 'Невірні параметри бектесту' });
      }

      const klines = await fetchKlines(ex, mkt, sym, tf, tf === '1m' ? 500 : 200).catch(() => []);
      if (klines.length < 50) {
        return res.status(503).json({ success: false, error: 'Недостатньо історичних даних з обраної біржі' });
      }
      const result = surveillanceReplayEngine.runCausalBacktest(sym, klines, tf);
      res.json({ success: true, data: result });
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Crypto Pattern Screener server running on http://0.0.0.0:${PORT}`);
    // Start unified background CRON for all notifications (Price Alerts 5s, Surveillance 15s, Screener 60s)
    cronManager.init();
    notificationOutbox.start();
    startTelegramPolling();
  });
  const stopMarketStreams = installMarketStreams(httpServer);
  const shutdown = () => {
    stopMarketStreams();
    notificationOutbox.stop(); stopTelegramPolling(); cronManager.stop();
    surveillanceManager.stop();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}

startServer();

