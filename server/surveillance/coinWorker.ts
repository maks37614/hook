import { ExchangeId, MarketType, SurveillanceCoin, Timeframe } from '../../src/types';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { formatDensityLevelCompact, formatDensityLevelExact } from '../../src/utils/densityNotional';
import { sharedOiPoller } from './sharedOiPoller';
import { notificationRouter } from '../notificationRouter';
import { createSetupAlertsGroup, getUserLanguage } from '../alertService';
import type { RawDepthDelta } from './exchangeStream';
import { acquireExchangeStream, type SharedExchangeStreamHandle } from './sharedExchangeStream';
import { publishSurveillance, publishSurveillanceAlert } from '../surveillanceEvents';
import { sharedMarketAnalysis } from './sharedMarketAnalysis';
import { sharedWorkerAnalysisClock } from './sharedWorkerAnalysisClock';
import { AutoSetupGroupGate } from './autoSetupGroupGate';
import { acquireSharedCandleFeed, type SharedCandleFeedHandle } from './sharedCandleFeed';
import { LevelsAndFormationsEngine } from './levelsAndFormationsEngine';
import { MacroAndNewsEngine } from './macroAndNewsEngine';
import { MultiTimeframeEngine } from './multiTimeframeEngine';
import { OrderBookEngine } from './orderBookEngine';
import { SetupEngine } from './setupEngine';
import { StateMachineAndAlerts } from './stateMachineAndAlerts';
import { validateSetupAlertsMath } from './setupValidation';
import {
  DensityItem,
  DetectedPattern,
  EngineAlertEvent,
  LevelZone,
  OISnapshot,
  OrderBookState,
  SetupInstance,
  ThirdTouchTracker,
  TimeframeStructure,
  TradeFlowSnapshot,
} from './types';
import { VolumeAndOIEngine } from './volumeAndOIEngine';

export interface CoinWorkerSnapshot {
  id: string;
  userId: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  isActive: boolean;
  status: string;
  currentPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  orderBookState: OrderBookState;
  densities: DensityItem[];
  densityMode: string;
  densityThresholdUsd: number;
  densityBidThresholdUsd: number;
  densityAskThresholdUsd: number;
  structures: Record<Timeframe, TimeframeStructure>;
  levelZones: LevelZone[];
  thirdTouches: ThirdTouchTracker[];
  patterns: DetectedPattern[];
  tradeFlow: TradeFlowSnapshot;
  oiSnapshot: OISnapshot;
  setups: SetupInstance[];
  recentEvents: EngineAlertEvent[];
  lastAnalysisTimestamp: number;
  sampledAt: number;
}

export class CoinWorker {
  private streamClient: SharedExchangeStreamHandle;
  private orderBookEngine: OrderBookEngine;
  private mtfEngine: MultiTimeframeEngine;
  private candleFeed: SharedCandleFeedHandle;
  private levelsEngine: LevelsAndFormationsEngine;
  private volumeOIEngine: VolumeAndOIEngine;
  private setupEngine: SetupEngine;

  private isDestroyed = false;
  /** Immutable underlying market; user edits may mutate this.coin in place. */
  private readonly marketIdentity: string;
  private releaseAnalysisClock: (() => void) | null = null;
  private releaseOiSubscription: (() => void) | null = null;
  private lastWsOiAt = 0;

  private initialPrice = 0;
  // Public ticker data are shared at the exchange stream. A user-specific
  // worker keeps only private density/OI/rule/alert state.
  public get currentPrice() { return this.streamClient.marketTicker.price || this.initialPrice; }
  public set currentPrice(price: number) { this.initialPrice = price; }
  public get high24h() { return this.streamClient.marketTicker.high24h; }
  public get low24h() { return this.streamClient.marketTicker.low24h; }
  public get change24h() { return this.streamClient.marketTicker.change24h; }
  public get volume24hUsd() { return this.streamClient.marketTicker.volume24hUsd; }
  public lastAnalysisTimestamp = 0;
  private analysisInFlight = false;
  /** Skip repeated saved-group lookups for the same confirmed setup. */
  private readonly autoSetupGroups = new AutoSetupGroupGate();

  private structures: Record<Timeframe, TimeframeStructure> = {} as any;
  private levelZones: LevelZone[] = [];
  private thirdTouches: ThirdTouchTracker[] = [];
  private patterns: DetectedPattern[] = [];
  private setups: SetupInstance[] = [];
  // One persisted wall event per observed lifetime, even after the 25-card feed rolls over.
  private readonly persistentDensityLogged = new Set<string>();
  private recentEvents: EngineAlertEvent[] = [];

  constructor(
    public coin: SurveillanceCoin,
    private macroEngine: MacroAndNewsEngine,
    private alertManager: StateMachineAndAlerts
  ) {
    this.marketIdentity = CoinWorker.marketKey(coin);
    this.streamClient = acquireExchangeStream(coin.symbol, coin.exchange, coin.marketType);
    this.orderBookEngine = new OrderBookEngine(coin.symbol, coin.exchange, coin.marketType);
    this.candleFeed = acquireSharedCandleFeed(coin.symbol, coin.exchange, coin.marketType);
    this.mtfEngine = this.candleFeed.engine;
    this.levelsEngine = new LevelsAndFormationsEngine();
    this.volumeOIEngine = new VolumeAndOIEngine(this.candleFeed.tradeWindow);
    this.setupEngine = new SetupEngine();

    this.updateCoin(coin);
    this.init().catch((err) => console.error(`[CoinWorker ${coin.symbol}] Initialization failed:`, err));
  }

  public static marketKey(coin: SurveillanceCoin): string {
    return `${coin.exchange}:${coin.marketType}:${normalizeExchangeSymbol(coin.symbol)}:${String(coin.baseAsset || '').toUpperCase()}`;
  }

  public matchesInstrument(coin: SurveillanceCoin): boolean {
    return this.marketIdentity === CoinWorker.marketKey(coin);
  }

  public updateCoin(coin: SurveillanceCoin) {
    if (coin.id !== this.coin.id || coin.userId !== this.coin.userId)
      throw new Error('Cannot transfer a surveillance worker to another owner');
    if (!this.matchesInstrument(coin))
      throw new Error('Cannot reuse a surveillance worker for a different market');
    this.coin = coin;
    this.orderBookEngine.updateConfig({
      mode: coin.config.densityMode ?? 'AUTO',
      manualThresholdUsd: coin.config.manualDensityThresholdUsd ?? 1000000,
    });
  }

  public canDispatchTelegramAlert(alertCategory?: string): boolean {
    if (this.isDestroyed) return false;
    if (!this.coin.isActive) return false;

    // 1. Explicit telegramEnabled toggle check (#4)
    if (this.coin.config.telegramEnabled === false) return false;

    // 2. Realtime trigger mode check (#1 & #5):
    // Realtime Telegram alerts from CoinWorker are ONLY dispatched if 'realtime' is active in triggerModes
    const modes = this.coin.config.triggerModes ||
      (this.coin.config.triggerMode ? [this.coin.config.triggerMode] : ['bar_close']);
    if (!modes.includes('realtime')) return false;

    // 3. Category toggles check
    if (alertCategory === 'OI_ANOMALY' && this.coin.config.oiAlerts === false) return false;
    if (alertCategory === 'DENSITY' && this.coin.config.densityAlerts === false) return false;
    if (alertCategory === 'THIRD_TOUCH' && this.coin.config.thirdTouchAlerts === false) return false;
    if (alertCategory === 'SETUP' && this.coin.config.setupsEnabled === false) return false;
    if (alertCategory === 'STRUCTURE' && this.coin.config.structureEnabled === false) return false;

    return true;
  }

  private async init() {
    this.setupStreamListeners();
    await this.candleFeed.ready;
    if (this.isDestroyed) return;
    if (this.currentPrice === 0) {
      const history = this.mtfEngine.getCandles('15m');
      if (history.length) this.currentPrice = history[history.length - 1].close;
    }
    this.startPeriodicTasks();
    void this.runDeepAnalysis().catch((err) => console.error(`[CoinWorker ${this.coin.symbol}] Analysis failed:`, err));
  }

  private setupStreamListeners() {
    // Market-wide socket errors are logged once by SharedExchangeStream;
    // adding an error handler per owner multiplies logs under an outage.
    // Live ticker and trades are now maintained once in SharedExchangeStream.
    // Candle aggregation is independently shared by SharedCandleFeed.

    // Bybit sends volume24h without lastPrice; update each account's
    // AUTO baseline without falsely refreshing the quote timestamp.
    this.streamClient.on('turnover24h', () => {
      this.orderBookEngine.setVolume24hUsd(this.volume24hUsd);
    });

    // 3. Depth Updates for Local Order Book & Densities (Fast Path)
    this.streamClient.on('depth', (delta: RawDepthDelta) => {
      this.orderBookEngine.setVolume24hUsd(this.volume24hUsd);
      // Reuse publicly validated numeric levels for the exact same WS
      // emission. The personal book still checks freshness and sequencing.
      this.orderBookEngine.applyDepth(delta,
        this.streamClient.validatedDepth(delta), this.streamClient.sharedBook(delta));
      if (this.orderBookEngine.sequenceGap) this.streamClient.resyncOrderBook();
    });

    // 4. Stream status
    this.streamClient.on('status', (status) => {
      this.orderBookEngine.setStatus(status);
    });

    // Bybit includes current futures OI in its already-open ticker WS stream.
    // Record at the original 15s cadence; never invent a value from stale data.
    this.streamClient.on('open-interest', (data: { valueUsd: number; amountCoins: number; time: number }) => {
      if (process.env.H00K_BYBIT_OI_WS === '0' || this.coin.exchange !== 'bybit' || this.coin.marketType !== 'futures') return;
      const now = Date.now();
      if (!Number.isFinite(data.time) || data.time > now + 1_000 || now - data.time > 10_000 ||
          !Number.isFinite(data.valueUsd) || data.valueUsd <= 0 ||
          !Number.isFinite(data.amountCoins) || data.amountCoins <= 0 ||
          now - this.lastWsOiAt < 15_000) return;
      this.lastWsOiAt = now;
      this.volumeOIEngine.recordOI(data.valueUsd, data.amountCoins, this.currentPrice);
    });
  }

  private startPeriodicTasks() {
    // One 6-second clock for all watchers; grouped by exact instrument.
    // The shared market-only analysis is calculated once per matching candle
    // revision while personal threshold, OI baseline and Telegram state stay local.
    this.releaseAnalysisClock = sharedWorkerAnalysisClock.subscribe(
      `${this.coin.exchange}:${this.coin.marketType}:${normalizeExchangeSymbol(this.coin.symbol)}`,
      () => {
        if (this.isDestroyed || !this.coin.isActive) return;
        void this.runDeepAnalysis().catch(err =>
          console.error(`[CoinWorker ${this.coin.symbol}] Analysis failed:`, err));
      },
    );

    // 2. All owners of one instrument now share a single 60s REST fallback
    // schedule. Exchange OI observations and personal baselines remain separate.
    this.releaseOiSubscription = sharedOiPoller.subscribe({
      exchange: this.coin.exchange, marketType: this.coin.marketType,
      symbol: this.coin.symbol, baseAsset: this.coin.baseAsset,
    }, {
      needsRest: () => !this.isDestroyed && this.coin.isActive &&
        !(process.env.H00K_BYBIT_OI_WS !== '0' && this.coin.exchange === 'bybit'
          && Date.now() - this.lastWsOiAt < 30_000),
      currentPrice: () => this.currentPrice,
      onSample: (oi, startedAt) => {
        if (this.isDestroyed || !this.coin.isActive) return;
        // Do not overwrite fresh Bybit WS OI with a request begun before it.
        if (this.coin.exchange === 'bybit' && process.env.H00K_BYBIT_OI_WS !== '0'
            && this.lastWsOiAt >= startedAt) return;
        this.volumeOIEngine.recordOI(oi.valueUsd, oi.amountCoins, this.currentPrice);
      },
    });
  }

  /** Public DOM evaluation is cheap, owner-scoped and must not wait for
   * private candle/macro analysis. One existing 6s shared clock invokes this
   * even if the heavy analysis is still waiting on an asynchronous dependency.
   * Alert freshness is gated by the quote and OrderBookEngine's book status.
   */
  private processDensitySignals(): void {
    // DOM has its own validated time and mid-price. An old last-trade ticker
    // must not block a fresh wall, but an old or unsynchronized book must.
    if (this.streamClient.status !== 'LIVE' ||
        !this.orderBookEngine.hasFreshSynchronizedDepth()) return;
    // 6. Significant Densities (#14: DENSITY_APPEARED and DENSITY_PERSISTENT)
    // 6a. Newly appeared massive liquidity
    const newlyAppeared = this.orderBookEngine.pollNewlyAppearedDensities();
    for (const d of newlyAppeared) {
      const dKey = `${d.side}_${d.price}`;
      if (this.canDispatchTelegramAlert('DENSITY')) {
        const msg = this.alertManager.formatDensityAppearedMessage(
          d,
          this.coin.symbol,
          this.coin.exchange,
          getUserLanguage(this.coin.userId)
        );
  
        notificationRouter.dispatch({
          source: 'ORDERBOOK',
          userId: this.coin.userId,
          coinId: this.coin.id,
          symbol: this.coin.symbol,
          exchange: this.coin.exchange,
          marketType: this.coin.marketType,
          eventType: 'DENSITY_APPEARED',
          timeframe: '5m',
          eventIdentity: dKey,
          triggerMode: 'realtime',
          htmlMessage: msg,
          coin: this.coin,
        });
      }

      this.addEvent({
        eventId: `${this.coin.symbol}_DENSITY_APP_${dKey}_${d.firstSeenAt}`,
        symbol: this.coin.symbol,
        exchange: this.coin.exchange,
        marketType: this.coin.marketType,
        type: 'DENSITY_APPEARED',
        title: `⚡ Нова щільність ${d.side} ${formatDensityLevelCompact(d.notionalUsd, this.coin.symbol)}`,
        description: `Видима сукупна ліквідність рівня ${formatDensityLevelCompact(d.notionalUsd, this.coin.symbol)} (точно ${formatDensityLevelExact(d.notionalUsd, this.coin.symbol)}) за ціною ${d.price}. Дистанція: ${d.distancePct}%. Спостерігається: ${d.ageSeconds}с (від першого виявлення сервером).`,
        price: d.price,
        timeframe: '5m',
        severity: 'IMPORTANT',
        confluenceScore: d.qualityScore ?? 0,
        // The live DOM object mutates with every level update. Historical
        // amounts and server-observed ages must remain as they were at alert.
        evidence: structuredClone(d),
        timestamp: Date.now(),
      });
    }

    // 6b. Confirmed persistent liquidity (>= 60s without spoofing)
    const significantDensities = this.orderBookEngine.getSignificantDensities(
      this.orderBookEngine.calculateAdaptiveThreshold(this.volume24hUsd)
    );
    for (const d of significantDensities) {
      if (d.classification === 'PERSISTENT_LIQUIDITY' && d.ageSeconds >= 60) {
        // A persistent wall is a real event, not just a Telegram notification.
        // Use the lifetime identity to avoid repeating it on every depth update.
        const eventId = this.coin.symbol + '_DENSITY_PERSIST_' + d.side + '_' + d.price + '_' + d.firstSeenAt;
        if (!this.persistentDensityLogged.has(eventId)) {
          this.persistentDensityLogged.add(eventId);
          if (this.persistentDensityLogged.size > 512) {
            const oldest = this.persistentDensityLogged.values().next().value;
            if (oldest) this.persistentDensityLogged.delete(oldest);
          }
          this.addEvent({
            eventId,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            type: 'DENSITY_PERSISTENT',
            title: '✅ Підтверджена щільність ' + d.side + ' ' + formatDensityLevelCompact(d.notionalUsd, this.coin.symbol),
            description: 'Ліквідність ' + formatDensityLevelExact(d.notionalUsd, this.coin.symbol) + ' за ціною ' + d.price +
              ' утримується ' + d.ageSeconds + 'с від першого спостереження сервером. Дистанція: ' + d.distancePct + '%.',
            price: d.price,
            timeframe: '5m',
            severity: 'IMPORTANT',
            confluenceScore: d.qualityScore ?? 0,
            evidence: structuredClone(d),
            timestamp: Date.now(),
          });
        }
        const dKey = `${d.side}_${d.price}`;
        if (this.canDispatchTelegramAlert('DENSITY')) {
          const dMsg = this.alertManager.formatDensityMessage(
            d,
            this.coin.symbol,
            this.coin.exchange,
            getUserLanguage(this.coin.userId)
          );
  
          notificationRouter.dispatch({
            source: 'ORDERBOOK',
            userId: this.coin.userId,
            coinId: this.coin.id,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            eventType: 'DENSITY_PERSISTENT',
            eventIdentity: dKey,
            triggerMode: 'realtime',
            htmlMessage: dMsg,
            coin: this.coin,
          });
        }
      }
    }

  }

  public async runDeepAnalysis() {
    // Inactive 24/7 monitors still receive lightweight price state, but must
    // not run costly personal setup/rule evaluation or Telegram dispatches.
    // Never produce realtime setups or private notifications from an old
    // cached quote after a WebSocket disconnect, silent market ticker or
    // unconfirmed book resync. Historical candles remain available to UI.
    if (this.isDestroyed || !this.coin.isActive) return;
    // Public order-book events rely on depth freshness rather than the last
    // execution price, so a quiet thin market can still surface a real wall.
    this.processDensitySignals();
    // Price-dependent setup/structure analysis must continue to require a
    // fresh trade/ticker observation and cannot reuse depth as a fake quote.
    if (this.currentPrice <= 0 || !this.streamClient.hasFreshMarketQuote() ||
        this.analysisInFlight) return;
    this.analysisInFlight = true;
    this.lastAnalysisTimestamp = Date.now();
    try {

    const price = this.currentPrice;
    const candles1d = this.mtfEngine.getCandles('1d');
    const candles4h = this.mtfEngine.getCandles('4h');
    const candles1h = this.mtfEngine.getCandles('1h');
    const candles15m = this.mtfEngine.getCandles('15m');

    // Share public market-only calculations across every user following the
    // same exchange:market:symbol and identical OHLCV snapshot. Personal rules,
    // thresholds, third-touch state, DOM mode and notification history stay local.
    const shared = sharedMarketAnalysis.get(
      `${this.coin.exchange}:${this.coin.marketType}:${normalizeExchangeSymbol(this.coin.symbol)}`,
      this.candleFeed.fingerprint(),
      () => ({
        structures: this.mtfEngine.getMultiTimeframeStructures(price),
        zones: this.levelsEngine.findSupportResistanceZones(candles1d, candles4h, candles1h),
        patterns: this.levelsEngine.detectFormations(candles1h, price),
      }),
    );
    // 1. Multi-timeframe structure
    this.structures = structuredClone(shared.structures);
    this.levelsEngine.adoptSharedZones(shared.zones);

    // Check BOS / CHoCH structure change alerts
    for (const [tf, struct] of Object.entries(this.structures)) {
      if (struct.lastBreak && struct.lastBreak.confirmed) {
        const breakIdentity = `${tf}_${struct.lastBreak.type}_${struct.lastBreak.direction}_${struct.lastBreak.time}`;
        if (this.canDispatchTelegramAlert('STRUCTURE')) {
          const alertHtml = this.alertManager.formatStructureMessage(
            this.coin.symbol,
            tf,
            `${struct.lastBreak.type} ${struct.lastBreak.direction}`,
            price,
            getUserLanguage(this.coin.userId)
          );
  
          notificationRouter.dispatch({
            source: 'SURVEILLANCE',
            userId: this.coin.userId,
            coinId: this.coin.id,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            eventType: struct.lastBreak.type,
            timeframe: tf,
            eventIdentity: breakIdentity,
            triggerMode: 'realtime',
            htmlMessage: alertHtml,
            coin: this.coin,
          });
        }

        this.addEvent({
          eventId: `${this.coin.symbol}_${breakIdentity}`,
          symbol: this.coin.symbol,
          exchange: this.coin.exchange,
          marketType: this.coin.marketType,
          type: struct.lastBreak.type,
          title: `${struct.lastBreak.type} на ${tf.toUpperCase()}`,
          description: `Пробій структури ${struct.lastBreak.direction} на рівні $${struct.lastBreak.price}`,
          price,
          timeframe: tf as Timeframe,
          severity: 'IMPORTANT',
          confluenceScore: 75,
          evidence: struct,
          timestamp: Date.now(),
        });
      }
    }

    // 2. Strong S/R Zones
    this.levelZones = shared.zones.map(zone => ({ ...zone }));

    // 3. Third Touch Tracking
    this.thirdTouches = this.levelsEngine.trackThirdTouch(price, candles1h);
    for (const tt of this.thirdTouches) {
      if (tt.state === 'APPROACHING' || tt.state === 'ACTIVE') {
        const ttIdentity = `${tt.levelId}_${tt.touchCount}`;
        if (this.canDispatchTelegramAlert('THIRD_TOUCH')) {
          const msg = this.alertManager.formatThirdTouchMessage(
            tt,
            this.coin.symbol,
            this.coin.exchange,
            price,
            getUserLanguage(this.coin.userId)
          );
  
          notificationRouter.dispatch({
            source: 'SURVEILLANCE',
            userId: this.coin.userId,
            coinId: this.coin.id,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            eventType: 'THIRD_TOUCH_APPROACHING',
            timeframe: '1h',
            eventIdentity: ttIdentity,
            triggerMode: 'realtime',
            htmlMessage: msg,
            coin: this.coin,
          });
        }

        this.addEvent({
          eventId: `${this.coin.symbol}_TT_${ttIdentity}`,
          symbol: this.coin.symbol,
          exchange: this.coin.exchange,
          marketType: this.coin.marketType,
          type: 'THIRD_TOUCH_APPROACHING',
          title: `Третій тест рівня $${tt.price}`,
          description: `Наближення до рівня ${tt.levelType}. Дистанція: ${tt.distancePct}%. Компресія: ${tt.compression ? 'ТАК' : 'НІ'}`,
          price,
          timeframe: '1h',
          severity: 'IMPORTANT',
          confluenceScore: 80,
          evidence: tt,
          timestamp: Date.now(),
        });
      }
    }

    // 4. Formations
    this.patterns = structuredClone(shared.patterns)
      .filter(p => p.score >= (this.coin.config.formationThreshold ?? 0));

    // 5. Volume, RVOL, Trade Flow, OI
    const { rvol } = this.volumeOIEngine.calculateRVOL(candles15m);
    const tradeFlow = this.volumeOIEngine.getTradeFlowSnapshot();
    const oiSnapshot = this.volumeOIEngine.getOISnapshot(price);

    // Check OI Anomaly alert
    if (oiSnapshot.isAnomaly) {
      const oiIdentity = `${Math.floor(Date.now() / 600000)}`;
      if (this.canDispatchTelegramAlert('OI_ANOMALY')) {
        const oiMsg = this.alertManager.formatOIMessage(
          oiSnapshot,
          this.coin.symbol,
          price,
          getUserLanguage(this.coin.userId)
        );
  
        notificationRouter.dispatch({
          source: 'SURVEILLANCE',
          userId: this.coin.userId,
          coinId: this.coin.id,
          symbol: this.coin.symbol,
          exchange: this.coin.exchange,
          marketType: this.coin.marketType,
          eventType: 'OI_ANOMALY',
          timeframe: '15m',
          eventIdentity: oiIdentity,
          triggerMode: 'realtime',
          htmlMessage: oiMsg,
          coin: this.coin,
        });
      }
    }

    // 7. Macro & BTC Context
    const btcContext = await this.macroEngine.updateBTCContext();
    // A network/macro fetch can take longer than a quote's freshness
    // window. Never emit a setup based on the pre-await price if the
    // market disconnected or traded to a different current price meanwhile.
    if (this.isDestroyed || !this.coin.isActive ||
        !this.streamClient.hasFreshMarketQuote() || this.currentPrice !== price) return;

    // 8. Setup Detection & Confluence Engine. Fetch the CURRENT book after
    // the macro await; the earlier alert scan may have used a previous depth
    // revision and must never feed stale liquidity into setup scoring.
    const significantDensities = this.orderBookEngine.getSignificantDensities(
      this.orderBookEngine.calculateAdaptiveThreshold(this.volume24hUsd)
    );
    this.setups = this.setupEngine.evaluateSetups({
      symbol: this.coin.symbol,
      exchange: this.coin.exchange,
      marketType: this.coin.marketType,
      currentPrice: price,
      structures: this.structures,
      zones: this.levelZones,
      patterns: this.patterns,
      densities: significantDensities,
      tradeFlow,
      oiSnapshot,
      btcContext,
      thirdTouches: this.thirdTouches,
      rvol,
      orderBookImbalance: this.orderBookEngine.getOrderBookImbalance(20),
      candles1h, candles15m, candles5m: this.mtfEngine.getCandles('5m'),
    });

    // Check Setups Telegram Alerts (#83, #87)
    for (const setup of this.setups) {
      if (setup.stage === 'CONFIRMED' && this.coin.config.setupsEnabled !== false &&
        setup.confluenceScore >= (this.coin.config.confluenceThreshold ?? 0)) {
        // 1. Separate setup alert types strictly according to direction and setup structure
        let alertType: 'SUPPORT_RETEST_CONFIRMED' | 'RESISTANCE_RETEST_CONFIRMED' | 'BREAKOUT_CONFIRMED' | 'FORMATION_SETUP_CONFIRMED';

        if (setup.id.includes('FORMATION') || setup.type === 'STRUCTURE_SHIFT') {
          alertType = 'FORMATION_SETUP_CONFIRMED';
        } else if (setup.type === 'BREAKOUT_RETEST') {
          alertType = 'BREAKOUT_CONFIRMED';
        } else if (setup.direction === 'SHORT' || setup.type === 'RESISTANCE_REJECTION') {
          alertType = 'RESISTANCE_RETEST_CONFIRMED';
        } else {
          alertType = 'SUPPORT_RETEST_CONFIRMED';
        }

        // 2. Mathematical validation:
        // For LONG:  STOP < ENTRY < TARGET
        // For SHORT: TARGET < ENTRY < STOP
        const mathCheck = validateSetupAlertsMath(setup);
        if (!mathCheck.valid) {
          console.warn(`[CoinWorker ${this.coin.symbol}] ⚠️ Setup ${setup.id} failed mathematical validation: ${mathCheck.reason}. Skipping dispatch.`);
          continue;
        }

        const setupIdentity = `${setup.id}_${setup.stage}`;
        if (this.canDispatchTelegramAlert('SETUP')) {
          const setupMsg = this.alertManager.formatSetupAlertMessage(
            setup,
            price,
            alertType,
            getUserLanguage(this.coin.userId)
          );
  
          notificationRouter.dispatch({
            source: 'SURVEILLANCE',
            userId: this.coin.userId,
            coinId: this.coin.id,
            symbol: this.coin.symbol,
            exchange: this.coin.exchange,
            marketType: this.coin.marketType,
            eventType: alertType,
            timeframe: setup.timeframe,
            eventIdentity: setupIdentity,
            triggerMode: 'realtime',
            htmlMessage: setupMsg,
            coin: this.coin,
          });
        }

        // 3. Optional automatic 3-alert group creation if configured
        if (this.coin.config?.autoSetupsAlerts) {
          try {
            // createSetupAlertsGroup validates persisted ID/tombstones. Running
            // that O(saved-alerts) lookup every six seconds is unnecessary
            // once the setup was successfully checked for this worker.
            this.autoSetupGroups.ensure(setup.id, () =>
              createSetupAlertsGroup(this.coin.userId, setup, price, true));
          } catch (e) {
            // Do not cache failed disk writes; the next analysis can retry.
            console.error(`[CoinWorker ${this.coin.symbol}] Error creating auto setup alerts group:`, e);
          }
        }

        this.addEvent({
          eventId: setupIdentity,
          symbol: this.coin.symbol,
          exchange: this.coin.exchange,
          marketType: this.coin.marketType,
          type: alertType,
          title: `Сетап ${setup.type}: ${setup.stage} (${setup.direction})`,
          description: `Конфлюенс: ${setup.confluenceScore}/100. Зона: $${setup.entryZone.low} - $${setup.entryZone.high}`,
          price,
          timeframe: setup.timeframe,
          severity: 'CRITICAL',
          confluenceScore: setup.confluenceScore,
          evidence: setup.evidence,
          timestamp: Date.now(),
        });
      }
    }
    } finally {
      this.analysisInFlight = false;
      if (!this.isDestroyed) publishSurveillance(this.coin.userId);
    }
  }

  private addEvent(event: EngineAlertEvent) {
    if (this.recentEvents.some((existing) => existing.eventId === event.eventId)) return;
    this.recentEvents.unshift(event);
    // Users must see a newly confirmed exchange signal without waiting for
    // the 15s routine surveillance refresh or the next analysis cycle.
    // The event stream sends only an owner-scoped invalidation, never payloads.
    if (!this.isDestroyed) publishSurveillanceAlert(this.coin.userId);
    if (this.recentEvents.length > 25) {
      this.recentEvents.pop();
    }
  }

  public getSnapshot(): CoinWorkerSnapshot {
    const orderBookState = this.orderBookEngine.getState();
    return {
      id: this.coin.id,
      userId: this.coin.userId,
      symbol: this.coin.symbol,
      exchange: this.coin.exchange,
      marketType: this.coin.marketType,
      isActive: this.coin.isActive,
      status: this.streamClient.hasFreshMarketQuote() ? orderBookState.status : 'STALE',
      currentPrice: this.currentPrice,
      change24h: this.change24h,
      high24h: this.high24h,
      low24h: this.low24h,
      volume24hUsd: this.volume24hUsd,
      orderBookState,
      sampledAt: Date.now(),
      densities: this.orderBookEngine.getDensities(),
      densityMode: this.coin.config.densityMode || 'AUTO',
      densityThresholdUsd: this.orderBookEngine.calculateAdaptiveThreshold(),
      densityBidThresholdUsd: this.orderBookEngine.calculateDensityThresholds().bid,
      densityAskThresholdUsd: this.orderBookEngine.calculateDensityThresholds().ask,
      structures: this.structures,
      levelZones: this.levelZones,
      thirdTouches: this.thirdTouches,
      patterns: this.patterns,
      tradeFlow: this.volumeOIEngine.getTradeFlowSnapshot(),
      oiSnapshot: this.volumeOIEngine.getOISnapshot(this.currentPrice),
      setups: this.setups,
      recentEvents: this.recentEvents,
      lastAnalysisTimestamp: this.lastAnalysisTimestamp,
    };
  }

  public destroy() {
    this.isDestroyed = true;
    this.autoSetupGroups.clear();
    this.persistentDensityLogged.clear();
    this.releaseAnalysisClock?.();
    this.releaseAnalysisClock = null;
    this.releaseOiSubscription?.();
    this.releaseOiSubscription = null;
    this.streamClient.destroy();
    this.candleFeed.destroy();
    this.orderBookEngine.clear();
  }
}
