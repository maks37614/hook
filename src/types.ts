import type { TpSlConstructorSettings, TpSlTouchState } from './utils/tpSlConstructor';
import type { WickTouchBar } from './utils/wickTouchEvidence';
import type { TerminalLinkSettings } from './utils/terminalLinkService';
import type { VisualChartProfile } from './components/hookchart/visualProfiles';
export type ExchangeId = 'binance' | 'bybit';
export type MarketType = 'futures' | 'spot';
export type ChartProvider = 'tradingview' | 'hookchart';
/** 30s is a Terminal-only display option; exchange candle APIs still start at 1m. */
export type Timeframe = '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type ActivePageType = 'patterns' | 'screener' | 'terminal' | 'surveillance' | 'replay' | 'pc';

export interface TerminalChartBlock {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  formationId?: string;
  /** Terminal-only per-chart TP / Entry / SL overlays; absent means hidden. */
  showTradeLevels?: boolean;
  colSpan?: 1 | 2 | 3 | 4 | 'full';
  heightPx?: number;
}

export interface TerminalWorkspaceConfig {
  layoutPreset: '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | '3x3' | '4x4' | '5x5' | '6x6' | 'custom';
  columns: 1 | 2 | 3 | 4 | 5 | 6;
  /** Free grid adapts automatically; false preserves an explicit column choice. */
  freeLayoutAutoColumns?: boolean;
  /** Touch-screen gap between Terminal chart tiles in CSS pixels. */
  touchGapPx?: number;
  autoFitScreen: boolean;
  /** Hide the Terminal header clock and its trading sessions popover. Defaults to visible. */
  showClock?: boolean;
  blocks: TerminalChartBlock[];
  showFormations: boolean;
  blockHeight: 'compact' | 'medium' | 'large';
  globalTimeframe?: Timeframe;
  coinPresetExchange?: 'all' | ExchangeId;
  coinPresetMarketType?: 'all' | MarketType;
  coinPresetLimit?: number;
  /** Optional terminal-only startup viewport, never applied to Screener/Patterns. */
  initialChartView?: VisualChartProfile;
  /** Fit each Terminal chart to its loaded history when opened. Independent of Replay and other pages. */
  initialChartFitAll?: boolean;
  /** User-specific chart auto-scale toggle (separate from initial price-scale mode). */
  autoScaleCharts?: boolean;
  /** UI-only rendering cadence, independent of exchange sockets. */
  terminalRefreshMs?: 0 | 250 | 500 | 1000 | 2000 | 5000;
  /** Automatically update member coins for a selected market preset. */
  presetAutoUpdate?: boolean;
  /** Terminal-only reduced chart repaint mode. */
  terminalEcoMode?: boolean;
  /** Opt-in per-profile alerts for live markets currently present in the Terminal. */
  terminalMarketAlerts?: boolean;
}

export type PatternCategory = 'reversal' | 'continuation' | 'breakout' | 'compression' | 'candlestick';
export type PatternBias = 'bullish' | 'bearish' | 'neutral';
export type PatternStatus = 'forming' | 'breakout' | 'ready_to_break' | 'retest' | 'target_reached';

export interface Kline {
  buyVolume?: number;
  /** Binance taker-buy/total quote turnover; missing for Bybit OHLCV. */
  buyQuoteVolume?: number;
  quoteVolume?: number;
  tradeCount?: number;
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternLevel {
  label: string;
  price: number;
  type: 'support' | 'resistance' | 'neckline' | 'target' | 'stop_loss' | 'trigger';
}

export type ExtremeRole = 'UPPER_EXTREME' | 'LOWER_EXTREME' | 'MID_RANGE';
export type ExtremeApproach = 'APPROACHING' | 'TESTING' | 'REJECTING' | 'BREAKING' | 'MOVING_AWAY' | 'NEUTRAL';

export interface ExtremeContext {
  role: ExtremeRole;
  referencePrice: number;
  distancePct: number;
  rangePositionPct: number;
  approach: ExtremeApproach;
  approachStrength: number; // 0-100
  barsToExtreme: number;
  velocityPct: number;
  rejectionStrength: number; // 0-100
  sweepDetected: boolean;
  testsCount: number;
  aligned: boolean;
  reason: string;
}

export interface ConfluenceComponent {
  score: number;
  max: number;
  status: 'CONFIRMED' | 'PARTIAL' | 'MISSING' | 'CONFLICT';
  evidence: string;
  /** false means unavailable, not a measured failure (0 points). */
  available?: boolean;
  availability?: 'pending' | 'notApplicable' | 'unavailable';
}

export interface ConfluenceBreakdown {
  total: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  components: {
    formation: ConfluenceComponent;
    extremeLocation: ConfluenceComponent;
    trigger: ConfluenceComponent;
    retest: ConfluenceComponent;
    volume: ConfluenceComponent;
    volatility: ConfluenceComponent;
    level: ConfluenceComponent;
    riskReward: ConfluenceComponent;
    dataQuality: ConfluenceComponent;
    /** Only populated by the STANDARD formation scanner after indicator enrichment. */
    openInterest?: ConfluenceComponent;
    delta?: ConfluenceComponent;
    cvd20?: ConfluenceComponent;
    /** Standard-mode round price level, not a liquidity confirmation. */
    roundNumber?: ConfluenceComponent;
    /** Actual matching BID/ASK depth wall when the order book was checked. */
    density?: ConfluenceComponent;
    /** Standard-mode RSI14 momentum relative to the pattern direction. */
    rsi?: ConfluenceComponent;
    /** ATR14-based structural SL/TP suitability (separate from volatility band). */
    atr?: ConfluenceComponent;
    /** Legacy breakout RVOL bonus, retained in archived version 1 scores. */
    rvol?: ConfluenceComponent;
  };
  /** Unnormalized earned points and actually available maximum for transparent /100 scaling. */
  rawTotal?: number;
  availableMax?: number;
  scoreVersion?: 2;
  basePoints?: number;
  supplementaryPoints?: number;
  supplementaryAvailable?: number;
  flow?: import('./utils/regularFlowQuality').RegularFlowSummary;
  independentConfirmations: number;
  conflicts: string[];
  missing: string[];
  notes: string[];
}

export interface FormationValidation {
  passed: boolean;
  confirmed: boolean;
  closedCandleOnly: boolean;
  lookAheadSafe: boolean;
  enoughData: boolean;
  finiteData: boolean;
  swingQuality: number;
  equalExtremaTolerancePct: number;
  atrPct: number;
  breakoutConfirmed: boolean;
  breakoutPrice?: number;
  breakoutIndex?: number;
  retestIndex?: number;
  volumeAvailable?: boolean;
  entryMode: 'BREAKOUT' | 'RETEST' | 'WAIT_RETEST' | 'WAIT_BREAKOUT';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  riskReward: number;
  minRiskReward: number;
  volumeRatio: number;
  volatilityPct: number;
  nearbyLevelDistancePct: number;
  filters: { volume: boolean; volatility: boolean; nearbyLevel: boolean; structure: boolean };
  rejectionReasons: string[];
  confluence?: ConfluenceBreakdown;
  regularPlan?: import('./utils/regularFormationQuality').RegularPlanContext;
}

export interface RoundNumberContext {
  detected: boolean;
  level?: number;
  distancePct: number;
  step: number;
  strength: number;
  tolerancePct?: number;
  densityConfirmed: boolean;
  densityUsd?: number;
  side?: 'BID' | 'ASK';
}

export interface DetectedFormation {
  id: string;
  patternKey: string;
  name: string;
  nameEn: string;
  category: PatternCategory;
  bias: PatternBias;
  confidence: number; // 0 - 100
  /** Client-only 24h reference range; NOT a scanner-detected formation. */
  source?: 'screener_24h_preview';
  extremeContext?: ExtremeContext;
  validation?: FormationValidation;
  roundNumberContext?: RoundNumberContext;
  /** Conservative standard-mode TP/SL refinement; absent in early W/M. */
  regularSetupAdjustment?: import('./utils/regularFormationSetup').RegularSetupAdjustment;
  status: PatternStatus;
  statusLabel: string;
  description: string;
  levels: {
    entryPrice: number;
    targetPrice: number;
    stopLossPrice: number;
    supportPrice?: number;
    resistancePrice?: number;
    necklinePrice?: number;
  };
  riskRewardRatio: number;
  potentialProfitPct: number;
  potentialRiskPct: number;
  detectedAt: number;
  candleStartIndex?: number;
  candleEndIndex?: number;
  structureEndIndex?: number;
  /** First closed candle on which the standard detector knew this structure. */
  structureKnownIndex?: number;
  geometryQuality?: number;
  /** Bounded closed-candle samples close to the relevant wick extreme; not user-specific. */
  wickTouchBars?: WickTouchBar[];
  /** Client-only user-scoped projection; never used by shared scanner validation. */
  tpSlBuilder?: { source: 'custom'; touches?: TpSlTouchState; levelStatus?: 'applied' | 'invalid';
    automaticLevels?: DetectedFormation['levels'] };
}

export interface RoundNumberDensity {
  level: number;
  side: 'BID' | 'ASK';
  notionalUsd: number;
  distancePct: number;
  quality: number;
}

/** Indicators based only on the completed candles of a standard screener scan. */
export interface RegularIndicatorValues {
  atrPct: number | null;
  atr?: number;
  rsi14: number | null;
  /** Exact interval used by the scan, shared with OI enrichment. */
  candleContext?: { closedAt: number; previousClose: number; close: number };
  /** Signed taker-buy minus taker-sell quote turnover of the last closed candle. */
  deltaPct?: number;
  deltaUsd?: number;
  /** Fixed-window CVD over 20 consecutive closed candles. */
  cvd20Pct?: number;
  cvd20Usd?: number;
  tradeFlowSource?: 'binance-klines' | 'bybit-trades';
  /** Real futures OI change in native units across consecutive exchange snapshots. */
  oiChangePct?: number;
  oiUpdatedAt?: number;
  /** Why standard-mode OI was (not) available; not used by early W/M. */
  oiAvailability?: import('./utils/regularOIHistory').RegularOIReason;
  /** Which real market-data route produced the verified snapshot. */
  oiSource?: 'server' | 'browser';
}

export interface ScannedCoin {
  /** Populated by the normal screener; ignored by the early W/M mode. */
  regularIndicators?: RegularIndicatorValues;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  currentPrice: number;
  priceChange24h: number;
  highPrice24h: number;
  lowPrice24h: number;
  volume24hUsd: number;
  volumeUsd?: number;
  formations: DetectedFormation[];
  /** Preliminary W/M structures displayed only when early detection is enabled. */
  earlyFormations?: import('./utils/earlyFormations').EarlyFormationCandidate[];
  roundNumberDensity?: RoundNumberDensity;
  timeframe: Timeframe;
  lastUpdated: number;
  /** Provenance of the closed candles used for this formation scan (milliseconds). */
  formationData?: { collectedAt: number; lastClosedAt: number; contiguous: true };
  exchangeUrl: string;
  high24h?: number;
  low24h?: number;
  hasFormations?: boolean;
  bestFormation?: DetectedFormation;
}

/** Progress of the explicit full-universe USDT W/M scan (separate from the 75-pair standard screener). */
export interface FullEarlyScanSnapshot {
  id: string;
  status: 'loading' | 'running' | 'stopping' | 'stopped' | 'completed' | 'partial' | 'failed';
  total: number;
  processed: number;
  checked: number;
  skipped: number;
  failed: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  message?: string;
  missingSources: string[];
  data: ScannedCoin[];
}

export interface ScreenerFilterState {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
  category: 'all' | PatternCategory;
  bias: 'all' | PatternBias;
  status: 'all' | PatternStatus;
  minVolumeUsd: number; // in USD
  densityConfirmedOnly: boolean; // require confirmed order-book liquidity at the formation level
  roundNumberOnly: boolean; // show formations near a round-price level (same ROUND badge as cards)
  searchQuery: string;
  sortBy: 'confidence' | 'volume' | 'priceChange' | 'profitPotential';
  sortOrder: 'asc' | 'desc';
}

export interface FormationAIAnalysis {
  summary: string;
  patternConfirmation: string;
  targetAnalysis: string;
  invalidationCriteria: string;
  volumeRecommendation: string;
  tradeScenario: {
    recommendedEntry: string;
    tp1: string;
    tp2: string;
    stopLoss: string;
    rrRatio: string;
  };
  keyRisks: string[];
}

export type AlertCondition = 'gte' | 'lte';
export type AlertLevelType = 'entry' | 'target' | 'stop_loss' | 'custom';

export interface PriceAlert {
  id: string;
  userId?: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  targetPrice: number;
  condition: AlertCondition; // 'gte' (>=) or 'lte' (<=)
  note?: string;
  formationName?: string;
  levelType?: AlertLevelType;
  setupId?: string; // Grouping ID: setupId ├── ENTRY, ├── TARGET, └── STOP
  setupRole?: 'ENTRY' | 'TARGET' | 'STOP';
  createdAt: number;
  isActive: boolean;
  triggered: boolean;
  triggeredAt?: number;
  triggeredPrice?: number;
  /** Incremented only by an explicit user restart. A completed cycle cannot fire twice. */
  deliveryEpoch?: number;
  /** Durable dispatched cycle checkpoint. Old fired alerts without this marker
   * cannot replay merely because their history has been cleared. */
  deliveryPending?: boolean;
  // Per-user telegram credentials
  telegramBotToken?: string;
  telegramChatId?: string;
  language?: 'uk' | 'en' | 'ru' | 'pl';
}

export interface AlertHistoryItem {
  id: string;
  userId: string;
  alertId?: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  condition: AlertCondition;
  targetPrice: number;
  triggeredPrice: number;
  formationName?: string;
  levelType?: AlertLevelType;
  note?: string;
  triggeredAt: number;
  telegramSent: boolean;
  telegramError?: string;
  telegramPending?: boolean;
  telegramDeliveryId?: string;
  /** Restart generation matching the fired alert's delivery cycle. */
  deliveryEpoch?: number;
  telegramMessageIds?: number[];
  telegramStatus?: 'sent' | 'failed' | 'not_configured';
  createdAt?: string;
}

export interface MetaScalpSettings {
  enabled: boolean;
  port: number;
  binding: string; // '001' - '500'
  autoSwitchOnClick: boolean;
  soundFeedback?: boolean;
}

export interface ChartTradeMarkerSettings {
  showEntry: boolean;
  showTarget: boolean;
  showStop: boolean;
  entryColor?: string;
  targetColor?: string;
  stopColor?: string;
  customLevels?: Record<string, { entry?: number; target?: number; stop?: number; note?: string }>;
}

export interface TerminalWorkspaceSettings {
  /** Server-issued optimistic concurrency version; missing for legacy profiles. */
  version?: string;
  columns: number;
  blockHeight: 'compact' | 'medium' | 'large' | 'tall';
  blocks: any[];
  config?: Omit<TerminalWorkspaceConfig, 'blocks'>;
  customPresets?: TerminalSavedPreset[];
}

export interface TerminalSavedPreset {
  id: string;
  name: string;
  blocks: TerminalChartBlock[];
  columns: TerminalWorkspaceConfig['columns'];
  blockHeight: TerminalWorkspaceConfig['blockHeight'];
  createdAt: number;
}

/** Filters and sorting used only by the coin list on the Screener page. */
export interface ScreenerSearchConfig {
  searchQuery: string;
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  /** Threshold in USD. 0 means all volumes in both modes. */
  maxVolumeUsd: number;
  /** Interpret maxVolumeUsd as a ceiling ('to') or a floor ('from'). */
  volumeMode: 'to' | 'from';
  /** 0 means disabled; real or estimated 5m volatility from the existing quote feed. */
  minVolatility5mPct: number;
  /** 0 disables a price boundary (USD/USDT quote price). */
  minPriceUsd: number;
  maxPriceUsd: number;
  /** Null disables a 24h high/low proximity check; 0 is an exact level touch. */
  maxDistanceToHighPct: number | null;
  maxDistanceToLowPct: number | null;
  /** Only formations already present in the standard-scanner results are considered. */
  onlyWithFormations: boolean;
  /** 0 disables the USD open interest threshold. Missing OI never passes an active filter. */
  minOpenInterestUsd: number;
  fundingRateDirection: 'any' | 'positive' | 'negative';
  /** 0 disables the absolute funding rate threshold, in percent. */
  minFundingRateAbsPct: number;
  /** Closed breakout candle volume / previous 20 candles, from cached confirmed formations. 0 disables. */
  minBreakoutRvol: number;
  presetFilter: ScreenerPresetFilter;
  sortBy: ScreenerSortBy;
  sortOrder: 'asc' | 'desc';
  secondarySortBy: ScreenerSortBy | 'none';
  secondarySortOrder: 'asc' | 'desc';
}

export interface ScreenerSearchPreset {
  id: string;
  name: string;
  config: ScreenerSearchConfig;
}

export interface SearchUserSettings {
  /** Legacy fields are retained to read profiles saved by older versions. */
  minVolumeUsd?: number;
  presetFilter?: ScreenerPresetFilter;
  sortBy?: ScreenerSortBy;
  sortDirection?: 'asc' | 'desc';
  defaultConfig?: ScreenerSearchConfig;
  defaultPresetId?: string | null;
  presets?: ScreenerSearchPreset[];
}

export interface UserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramBotUsername?: string;
  defaultExchange?: 'all' | ExchangeId;
  defaultMarketType?: 'all' | MarketType;
  defaultTimeframe?: Timeframe;
  defaultChartProvider?: ChartProvider;
  hookChartPreferences?: HookChartPreferences;
  /** Global site palette, synchronized through the user profile. */
  siteAppearance?: import('./utils/siteAppearance').SiteAppearance;
  timeZone?: string;
  soundAlertsEnabled?: boolean;
  /** Per-user in-app notification categories, selected tone and price-impulse watch. */
  siteNotificationSettings?: import('./utils/siteNotifications').SiteNotificationSettings;
  /** Shared across all coin detail pages; true only hides the custom Telegram alert form. */
  telegramPriceAlertCollapsed?: boolean;
  /** Shared across all coin pages; only affects the Smart Analysis UI. */
  smartAnalysisCollapsed?: boolean;
  /** The Screener market-sentiment details are expanded unless explicitly disabled. */
  marketSentimentExpanded?: boolean;
  watchlist?: string[];
  watchlistFolders?: Record<string, string[]>;
  metaScalpSettings?: MetaScalpSettings;
  /** User-specific external desktop terminal and permitted linking sources. */
  terminalLinkSettings?: TerminalLinkSettings;
  chartTradeMarkers?: ChartTradeMarkerSettings;
  terminalSettings?: TerminalWorkspaceSettings;
  searchSettings?: SearchUserSettings;
  /** One-time install tip after account registration. Missing on older accounts = already handled. */
  installGuideTipShown?: boolean;
  createdAt?: string;
  updatedAt?: string;
  chartLabelSettings?: { entry: boolean; target: boolean; stop: boolean };
  tpSlConstructorSettings?: TpSlConstructorSettings;
}

export interface HookChartDrawing {
  id: string;
  type: string;
  pts: Array<{ t: number; p: number }>;
  text?: string;
}

export interface HookChartAlert {
  id: string;
  p: number;
  kind: 'level' | 'ray';
  created: number;
  fired?: boolean;
}

/** Normalized, account-wide live HookChart viewport preset (never an absolute coin price). */
export interface HookChartVisualProfile {
  visibleBars: number;
  verticalZoom: number;
  autoPriceScale: boolean;
  rightGapBars: number;
}

/** User-scoped display, indicator, alert, drawing, and language settings for HookChart. */
export interface HookChartPreferences {
  /** Per-context and per-device display presets. Replay intentionally ignores these. */
  visualProfiles?: Partial<Record<string, HookChartVisualProfile>>;
  drawingToolbarOpen?: boolean;
  terminalExtraToolsOpen?: boolean;
  indicators?: string[];
  overlays?: string[];
  drawings?: Record<string, HookChartDrawing[]>;
  alerts?: Record<string, HookChartAlert[]>;

  language?: 'uk' | 'pl' | 'ru' | 'en';
  siteLanguageAtSelection?: 'uk' | 'pl' | 'ru' | 'en';
  timezone?: string;
  tooltips?: boolean;
  notificationOpenNew?: boolean;

  maxChartCandles?: number;
  /** Backing-store DPR cap for HookChart, excluding Replay; default 4 preserves existing fidelity. */
  maxCanvasDpr?: number;
  rightPadding?: number;
  rightPaddingEnabled?: boolean;
  rightPaddingVersion?: number;
  chartToolbar?: boolean;
  showTopToolbarIcons?: boolean;
  notificationDialog?: boolean;
  singleWindowSize?: number;
  pagingButtons?: boolean;
  sharedDrawings?: boolean;
  duplicateCrosshair?: boolean;
  crosshairLineWidth?: number;
  /** CSS-pixel stroke width of manually drawn horizontal lines (not auto S/R). */
  horizontalDrawingLineWidth?: number;
  /** Width in CSS pixels of manually drawn trend lines (not auto trend detection). */
  trendDrawingLineWidth?: number;
  /** CSS-pixel stroke width shared by all automatically detected Scalper Mode lines. */
  scalperLineWidth?: number;
  /** @deprecated Legacy trend-only preference, normalized into scalperLineWidth then removed. */
  scalperTrendLineWidth?: number;
  showMarketPrintSums?: boolean;
  /** Draw connector arrows for executed market-trade amounts without hiding the amounts. */
  showMarketPrintArrows?: boolean;
  marketPrintArrowSize?: number;
  marketPrintFontSize?: number;
  /** Minimum combined BUY + SELL large-trade volume per candle in USD. 0 = show all qualifying candles. */
  marketPrintMinUsd?: number;
  showVolumes?: boolean;
  showMarketStatsBar?: boolean;
  showLiquidations?: boolean;
  /** Show numerical liquidation totals beneath candles independently of Liq markers. */
  showLiquidationCandleSums?: boolean;
  /** The combined liquidation amount can remain visible when L/S details are hidden. */
  showLiquidationDetailSums?: boolean;
  showLiquidationArrows?: boolean;
  liquidationArrowSize?: number;
  liquidationSumFontSize?: number;
  liquidationDetailFontSize?: number;
  /** Optional historical recurrence heuristic, never confirmed future positions. */
  showModeledLiquidationZones?: boolean;
  showLiqRiskBlock?: boolean;
  /** Hide only Long/Short marks; never affect the session's collected volume. */
  showLiquidationLong?: boolean;
  showLiquidationShort?: boolean;
  /** Null/undefined = automatic, 0 = show all, positive = manual USD threshold. */
  liquidationLongMinUsd?: number | null;
  liquidationShortMinUsd?: number | null;

  gridHorizontal?: boolean;
  gridVertical?: boolean;
  candleLongColor?: string;
  candleShortColor?: string;
  densityLineColor?: string;
  densityLabelColor?: string;
  densityLineWidth?: number;
  densityLineStyle?: 'solid' | 'dash' | 'dot';
  densityLabelSize?: number;

  sortEnabled?: string[];
  sortDisabled?: string[];
  analyzedIntervals?: string[];
  scoring?: boolean;

  roundDistance?: boolean;
  roundness?: number;
  roundGrid?: boolean;

  levelIntervals?: string[];
  showNearestLevels?: boolean;
  levelCandleCount?: number;
  levelHistory?: number;
  levelCount?: number;
  levelDiff?: number;
  levelBreak?: number;
  levelLabelMode?: 'always' | 'hover' | 'off';
  levelLabelColor?: string;
  levelLabelSize?: number;
  /** Automatic price-level line width, in CSS pixels. */
  levelLineWidth?: number;
  levelLabelStyle?: 'text' | 'filled' | 'outline';
  levelLineStyle?: 'solid' | 'dash' | 'dot';
  showBrokenLevels?: boolean;
  allowWick?: boolean;

  trendIntervals?: string[];
  trendHistory?: number;

  densityAnalysis?: boolean;
  densityTop?: boolean;
  densityBaseVolume?: boolean;
  densityImbalance?: boolean;
  showDensityLines?: boolean;
  showDensityLabels?: boolean;
  showDensityAmounts?: boolean;
  densityTimeoutMin?: number;
  densityDiffPct?: number;
  densityAutoMultiplier?: number;
  /** AUTO chart display: all unusual walls, or only walls with observed reaction evidence. */
  densityAutoDisplay?: 'all' | 'potential';
  densityNearLevelsOnly?: boolean;
  densityMode?: 'auto' | 'manual';
  densityThreshold?: number;

  oiColumn?: boolean;
  oiDisplay?: 'value' | 'change';
  oiBaseChange?: boolean;
  oiPeriod?: '1h' | '12h' | '24h';
  fundingColumn?: boolean;
  change24?: boolean;
  volume24?: boolean;

  natrTf?: string;
  natrPeriod?: number;
  vrTf?: string;
  vrCandles?: number;
  pDeltaTf?: string;
  pAvgTf?: string;
  pAvgCandles?: number;
  rBtcTf?: string;
  rBtcCandles?: number;
  tradesWindow?: string;
  tradesTA?: boolean;
  tradesTR?: boolean;
  tradesCandles?: number;

  autoSR?: boolean;
  showSRLabels?: boolean;
  autoPrevDay?: boolean;
  autoDayOpen?: boolean;
  autoVWAP?: boolean;
  autoLocalHL?: boolean;
  autoRoundLevels?: boolean;
  autoChannel?: boolean;
  autoPOC?: boolean;
  autoStops?: boolean;

  strategyId?: string;
  /** Opt-in, client-only scalp patterns on the live chart. Never creates alerts/orders. */
  scalperMode?: boolean;
  /** Separately opt in to 3–5 wick-tested cascading High/Low levels; client-only. */
  scalperCascadeLevels?: boolean;
  /** Independent opt-out for scalp pattern/status text; lines and wick dots stay visible. */
  showScalperLabels?: boolean;
  /** Optional legacy least-squares fit instead of exact wick-tip anchored scalp lines. */
  scalperRegressionMode?: boolean;
  /** Appearance only; auto preserves the existing status-based solid/dashed strokes. */
  scalperLineStyle?: 'auto' | 'solid' | 'dash' | 'dot';
  /** One visual toggle for all Scalper circles: wick contacts and breakout rings. */
  showScalperTouchPoints?: boolean;
  hotkeys?: Record<string, string>;
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export interface TelegramStatus {
  serverConfigured: boolean;
  isConfigured: boolean;
  needsConfirmation?: boolean;
  botUsername?: string;
  username?: string;
  linkPending?: boolean;
  linkExpiresAt?: number;
  linkError?: string;
  pollingError?: string;
}

export type ScreenerPresetFilter =
  | 'all'
  | 'active'
  | 'top_gainers'
  | 'top_losers'
  | 'near_highs'
  | 'near_lows';

export type ScreenerSortBy =
  | 'volume'
  | 'priceChange'
  | 'price'
  | 'volatility'
  | 'distanceToHigh'
  | 'distanceToLow';

export interface MarketCoin {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  price: number;
  change24h: number;
  volumeUsd: number;
  /** Exact USDT turnover of the latest completed one-minute candle, not 24h/1440. */
  volume1mUsd?: number;
  high24h: number;
  low24h: number;
  distanceToHighPct: number;
  distanceToLowPct: number;
  volatility24hPct: number;
  volatility5mPct?: number;
  /** Observed Bybit linear ticker openInterestValue; not inferred from volume. */
  openInterestUsd?: number;
  /** Observed Bybit linear fundingRate × 100, in percent. */
  fundingRatePct?: number;
  location?: import('./utils/marketLocation').MarketLocation;
  isNearHigh: boolean;
  isNearLow: boolean;
  isActiveCoin: boolean;
  exchangeUrl: string;
  hasFormations?: boolean;
  formationsCount?: number;
}

export interface ChartMarkerInfo {
  id: string;
  type: 'entry' | 'target' | 'stop_loss' | 'neckline' | 'resistance' | 'support' | 'custom' | 'pattern_point';
  label: string;
  price: number;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  timeframe?: Timeframe;
  time?: number; // Candle timestamp in seconds
  position?: 'aboveBar' | 'belowBar' | 'inBar';
  shape?: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  notes?: string;
}

export interface ChartRestoreParams {
  timeframe: Timeframe;
  historyLimit: number;
  lastClosePrice: number;
  visibleRange?: { from: number; to: number };
  savedAtCandleTime?: number;
}

/** Immutable, on-demand visual capture. The JPEG is omitted from archive lists
 * and retrieved only when the owner opens the saved formation.
 * Drawings and enabled overlays are saved for inspection, never re-subscribed. */
/** Only BID/ASK density markers actually visible in the archived chart's
 * price viewport. This is a frozen historical observation, not a live DOM feed. */
export interface ArchivedDensityScene {
  lines: boolean;
  labels: boolean;
  amounts: boolean;
  markers: {
    id: string;
    side: 'BID' | 'ASK';
    price: number;
    usd: number;
    firstSeenAt: number;
    lastSeenAt: number;
    active: boolean;
    touches: number;
    reactionTier?: 'strong' | 'potential';
    reactionScore?: number;
  }[];
}

/** Exact, already-visible automatic geometry captured only on an explicit
 * Save click. These observations are never recomputed from future market data. */
export interface ArchivedAutoOverlayScene {
  sr?: { kind:'R'|'S'; p:number; t:number }[];
  prevDay?: { h:number; l:number; t:number };
  dayOpen?: { p:number; t:number };
  vwap?: { p:number; t:number }[];
  localHL?: { kind:'R'|'S'; p:number; t:number }[];
  roundLevels?: number[];
  poc?: { pLo:number; pHi:number; pMid:number };
  channel?: { t0:number; t1:number; up0:number; up1:number; dn0:number; dn1:number; c0:number; c1:number };
  stops?: { side:'LONG'|'SHORT'; p:number; t:number }[];
}

export interface ArchivedChartSnapshot {
  version: 1;
  capturedAt: number;
  marketKey: string;
  timeframe: Timeframe;
  image?: string; // bounded data:image/jpeg;base64; server strips this from list responses
  drawings: { id: string; type: string; pts: { t: number; p: number }[]; text?: string }[];
  overlays: ('sr'|'prevDay'|'dayOpen'|'vwap'|'localHL'|'roundLevels'|'poc'|'channel'|'stops')[];
  /** Exact historical overlay geometry, optional for older archive records. */
  overlayScene?: ArchivedAutoOverlayScene;
  /** Formation S/R markers actually painted while auto S/R was enabled. */
  srMarkersVisible?: boolean;
  scalperEnabled: boolean;
  scalperRegression: boolean;
  scalperLabels: boolean;
  scalperLines: { from: { t: number; p: number }; to: { t: number; p: number }; role: 'upper'|'lower'|'neckline'|'cascade-step' }[];
  liquidationMap: { enabled: boolean; period: '24h'|'7d' };
  density?: ArchivedDensityScene;
  tradeLevels: { entry: boolean; target: boolean; stop: boolean };
}

export interface ArchivedFormation {
  id: string;
  userId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  formationName: string;
  bias: PatternBias;
  confidence?: number;
  status?: PatternStatus;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  necklinePrice?: number;
  resistancePrice?: number;
  supportPrice?: number;
  savedPrice: number;
  formation: DetectedFormation;
  markers: ChartMarkerInfo[];
  chartSnapshot?: ArchivedChartSnapshot;
  chartParams: ChartRestoreParams;
  /** User-authored trade thesis, private to the archive owner. Older records may omit it. */
  entryReason?: string;
  notes?: string;
  createdAt: string;
  savedAtTimestamp: number;
}

/** CoinGecko Demo free Token Info: address-resolved holder data only.
 * The provider does not expose top-holder addresses or historical changes on Demo.
 */
export interface CoinGeckoHolderSnapshot {
  source: 'CoinGecko Demo';
  symbol: string;
  status: 'available' | 'not_configured' | 'native_unsupported' |
    'unmapped' | 'ambiguous' | 'unavailable' | 'rate_limited' | 'upstream_error';
  count: number | null;
  /** Raw provider buckets (top_10, 11_20/11_30 etc.), never guessed. */
  distribution: Record<string, number> | null;
  lastUpdated: string | null;
  network: string | null;
  contractAddress: string | null;
  detail: string;
}

export interface SmartAnalysisData {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  currentPrice: number;
  lastUpdated: number;

  // 1. Overall Score & Verdict
  score: number; // 1 to 10
  verdict: 'STRONG_BUY' | 'BUY' | 'NEUTRAL_WAIT' | 'SELL' | 'AVOID';
  verdictLabel: string;
  summary: string;
  positionSizingRecommendation: string;
  tradeScenario: {
    entryZoneMin: number;
    entryZoneMax: number;
    optimalEntry: number;
    stopLoss: number;
    stopLossPct: number;
    tp1: number;
    tp1Pct: number;
    tp2: number;
    tp2Pct: number;
    tp3: number;
    tp3Pct: number;
    riskRewardRatio: number;
  };

  // 2. Trend, RSI & Moving Averages
  trend: {
    rsi14: number;
    rsiStatus: 'oversold' | 'neutral' | 'overbought';
    rsiLabel: string;
    ema20: number;
    ema50: number;
    /** Unavailable if the exchange has fewer than 200 confirmed valid candles. */
    ema200: number | null;
    priceVsEma: string;
    crossSignal: 'golden_cross' | 'death_cross' | 'bullish_alignment' | 'bearish_alignment' | 'compression';
    crossSignalLabel: string;
    strengthPct: number;
  };

  // 3. BTC Multi-Timeframe Context
  btcContext: {
    /** No invented quotes. Null means BTC quote unavailable. */
    btcPrice: number | null;
    change24h: number | null;
    /** A candle close is historical, and must not be represented as a live ticker. */
    priceSource: 'binance_ticker' | 'closed_1m_candle' | null;
    available: boolean;
    timeframes: {
      '15m': { direction: 'up' | 'down' | 'sideways'; structure: 'HH_HL' | 'LH_LL' | 'range' | 'unknown'; label: string };
      '5m': { direction: 'up' | 'down' | 'sideways'; structure: 'HH_HL' | 'LH_LL' | 'range' | 'unknown'; label: string };
      '1m': { direction: 'up' | 'down' | 'sideways'; structure: 'HH_HL' | 'LH_LL' | 'range' | 'unknown'; label: string };
    };
    overallStructure: 'HH_HL' | 'LH_LL' | 'range' | 'unknown';
    overallStructureLabel: string;
    hasSharpImpulse: boolean;
    impulseType: 'pump' | 'dump' | 'none';
    impulseDescription: string;
    upcomingNews: Array<{
      title: string;
      timeUntil: string;
      impact: 'high' | 'medium' | 'low';
    }>;
  };

  // 4. Volumes, Spread & Volatility
  volumeMetrics: {
    volume24hUsd: number | null;
    volume1hUsd: number | null;
    volume1hSpikeRatio: number | null;
    hasVolumeSpike: boolean;
  };
  spread: {
    spreadUsd: number | null;
    spreadPct: number | null;
    quality: 'ultra_tight' | 'normal' | 'wide' | 'unavailable';
  };
  volatility: {
    dailyRangePct: number | null;
    atr: number;
    atrPct: number;
    positionInDayRangePct: number | null; // 0% = Low, 100% = High
    high24h: number | null;
    low24h: number | null;
  };

  // 5. Orderbook & Walls
  orderbook: {
    /** Depth of the selected exchange+market only. */
    available: boolean;
    source: string;
    bidAskRatio: number | null;
    dominantSide: 'bids' | 'asks' | 'balanced' | 'unavailable';
    bidWallUsd: number | null;
    bidWallPrice: number | null;
    askWallUsd: number | null;
    askWallPrice: number | null;
    largeOrders: Array<{
      side: 'bid' | 'ask';
      price: number;
      amountUsd: number;
      distancePct: number;
      significance: 'whale' | 'large' | 'medium';
    }>;
  };

  // 6. Derivatives & Open Interest
  derivatives: {
    hasPerpFutures: boolean;
    fundingRate: number | null; // null = not published / unavailable
    predictedFundingRate: number | null;
    fundingBias: 'bullish' | 'bearish' | 'neutral';
    binanceOI: {
      currentUsd: number | null;
      change1hPct: number | null;
      history: number[]; // actual exchange history only
    };
    bybitOI: {
      currentUsd: number | null;
      change1hPct: number | null;
      history: number[]; // actual exchange history only
    };
    totalOIUsd: number | null; // partial total explicitly labeled by oiCoverage
    oiCoverage: 'complete' | 'partial' | 'none' | 'spot';
    oiTrend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
  };

  // 7. POC, Liquidity Levels & S/R
  levels: {
    /** Approximate candle-based POC, not a true tick-volume profile. */
    pocPrice: number | null;
    pocVolumePct: number | null;
    liquidityLevels: Array<{
      label: string;
      price: number;
      type: 'buy_side' | 'sell_side';
      distancePct: number;
    }>;
    strongSupport: number;
    strongResistance: number;
  };

  // 8. Institutional & Manipulation Analysis
  participants: {
    // 1. Аналіз Holders
    holders: {
      status: 'accumulation' | 'distribution' | 'neutral' | 'unavailable';
      statusLabel: string;
      top10ConcentrationPct: number | null;
      activeWalletsGrowthPct: number | null;
      retailVsWhaleRatio: string | null;
      phaseDescription: string;
    };
    // 2. Авто-виявлення Великого Учасника (Whale / Smart Money)
    largePlayer: {
      detected: boolean | null;
      confidencePct: number | null;
      actionType: 'accumulation' | 'absorption' | 'twap_buying' | 'distribution' | 'none';
      actionLabel: string;
      clusterVolumeUsd: number | null;
      details: string;
      trackedClusters: Array<{
        type: 'iceberg' | 'block_trade' | 'absorption' | 'twap' | 'limit_order';
        side: 'buy' | 'sell';
        price: number;
        volumeUsd: number;
        timestampDesc: string;
      }>;
    };
    // 3. Авто-виявлення Маркет-Мейкерів
    marketMaker: {
      detected: boolean | null;
      activityLevel: 'high' | 'moderate' | 'low' | 'unknown';
      activityLabel: string;
      algorithmType: 'hft_grid' | 'spread_arbitrage' | 'synthetic_liquidity' | 'passive_quoting' | null;
      spreadSupportScore: number | null;
      orderbookReplenishmentSpeed: 'ultra_fast' | 'normal' | 'slow' | 'unknown';
      antiSqueezeProtection: boolean | null;
      details: string;
    };
    // 4. Авто-виявлення Маніпулятивних Монет
    manipulativeCoin: {
      isManipulative: boolean | null;
      riskScore: number | null;
      riskLevel: 'low' | 'medium' | 'high' | 'extreme' | 'unknown';
      riskLabel: string;
      signals: Array<{
        name: string;
        detected: boolean | null;
        severity: 'low' | 'medium' | 'high';
        description: string;
      }>;
      warningSummary: string;
    };
    // Backwards compatibility legacy fields
    holdersStatus?: 'accumulation' | 'distribution' | 'neutral' | 'unavailable';
    holdersConcentrationPct?: number | null;
    largePlayerDetected?: boolean | null;
    largePlayerNote?: string;
    marketMakerDetected?: boolean | null;
    marketMakerNote?: string;
    isManipulativeCoin?: boolean | null;
    manipulativeRiskLevel?: 'low' | 'medium' | 'high' | 'extreme' | 'unknown';
    manipulativeReasons?: string[];
  };
}

export interface MarketSentimentData {
  compositeScore: number; // 0 to 100
  sentimentState: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  sentimentLabel: string;
  summary: string;

  priceTrendDynamics: {
    advancingCount: number;
    decliningCount: number;
    /** Instruments with absolute 24h change <= 0.1%. */
    unchangedCount?: number;
    advancingPct: number;
    trendBias: 'bullish' | 'bearish' | 'neutral';
    avgChange24h: number;
  };

  tradingVolume: {
    total24hUsd: number;
    volumeVelocity: 'high' | 'normal' | 'low' | null;
    volumeChangePct: number | null;
  };

  marketVolatility: {
    index: number; // 0 - 100
    label: string;
    avgDailyRangePct: number;
  };

  marketBreadth: {
    aboveEma20Pct: number | null;
    nearHighsPct: number | null;
    nearLowsPct: number | null;
    breadthScore: number;
    verdict: string;
  };

  capitalFlow: {
    netInflow24hUsd: number | null;
    direction: 'inflow' | 'outflow' | 'neutral' | null;
    label: string;
    /** Signed taker-buy minus taker-sell volume, Binance futures UTC day, sample only. */
    takerDeltaUsd?: number | null;
    sampledPairs?: number;
    sampleCoverage?: string;
    sampledAt?: number | null;
  };

  derivativesOverview: {
    aggregatedOIUsd: number | null;
    oiChange24hPct: number | null;
    avgFundingRate: number | null;
    fundingBias: 'long_heavy' | 'short_heavy' | 'balanced' | null;
    /** Number of observed Bybit linear instruments included in this sample. */
    instrumentCount?: number;
    fundingInstrumentCount?: number;
    sourceLabel?: string;
  };

  /** Actual snapshot quality, no extra exchange requests. */
  dataQuality?: {
    analyzedPairs: number;
    locationCoveragePct: number;
    locationPairs?: number;
    locationReliable?: boolean;
    freshSources: number;
    availableSources: number;
    totalSources: number;
  };
  lastUpdated: number;
}

export type SurveillanceEventType = 'structure' | 'level' | 'momentum' | 'risk';

export type TriggerModeType = 'bar_close' | 'realtime' | 'bar_close_15m' | 'bar_close_1h';

export interface SurveillanceConfig {
  timeframe: Timeframe;
  triggerModes: TriggerModeType[];
  triggerMode?: TriggerModeType; // Backward compatibility
  levelsEnabled: boolean; // Senior 4H/1D & 15m/1H levels
  structureEnabled: boolean; // Market structure BOS/CHoCH
  momentumEnabled: boolean; // Moving Up/Down % in N bars
  momentumPct: number; // e.g. 2.5%
  momentumBars: number; // e.g. 3 bars
  momentumTf: '15m' | '1h' | '4h';
  channelEnabled: boolean; // Donchian/Bollinger breakout
  fibonacciEnabled: boolean; // 0.618 Golden Pocket zones
  cooldownMinutes: number; // Minutes between alerts for same event
  densityMode?: 'AUTO' | 'MANUAL' | 'HYBRID';
  manualDensityThresholdUsd?: number;
  formationThreshold?: number;
  confluenceThreshold?: number;
  thirdTouchAlerts?: boolean;
  densityAlerts?: boolean;
  oiAlerts?: boolean;
  newsAlerts?: boolean;
  setupsEnabled?: boolean;
  autoSetupsAlerts?: boolean;
  telegramEnabled?: boolean;
}

export interface SurveillanceEvent {
  id: string;
  type: SurveillanceEventType;
  title: string;
  description: string;
  price: number;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  details?: Record<string, any>;
}

export interface SurveillanceState {
  currentPrice: number;
  change24h: number;
  high1d: number;
  low1d: number;
  swingHigh4h: number;
  swingLow4h: number;
  localHigh1h: number;
  localLow1h: number;
  localHigh15m: number;
  localLow15m: number;
  rangePositionPct: number; // 0 - 100% position in 4H range
  resistance4h: number;
  support4h: number;
  nextZoneUp: number;
  nextZoneDown: number;
  fib618: number;
  fib786: number;
  structureTrend: 'bullish' | 'bearish' | 'consolidation';
  channelUpper: number;
  channelLower: number;
  momentumRecentPct?: number;
  momentumPct?: number;
  structureStatus?: string;
  lastEvent?: SurveillanceEvent;
  recentEvents?: SurveillanceEvent[];
  lastCalculated?: number;
  // 24/7 Engine Live Properties
  engineStatus?: 'LIVE' | 'SYNCING' | 'CONNECTING' | 'STALE' | 'ERROR';
  spreadPct?: number;
  bestBid?: number;
  bestAsk?: number;
  densitiesCount?: number;
  topDensityUsd?: number;
  topDensityPrice?: number;
  topDensitySide?: 'BID' | 'ASK';
  thirdTouchState?: string;
  thirdTouchDistancePct?: number;
  activeSetupType?: string;
  activeSetupStage?: string;
  activeSetupConfluence?: number;
  oiRegime?: string;
  oiChange15mPct?: number;
  oiAnomaly?: boolean;
  tradeFlowBuyUsd?: number;
  tradeFlowSellUsd?: number;
  tradeFlowImbalance?: number;
  btcTrend4h?: string;
  formationName?: string;
  formationScore?: number;
  lastProcessedCandleTimes?: {
    '15m'?: number;
    '1h'?: number;
    '4h'?: number;
  };
}

export interface SurveillanceCoin {
  id: string;
  userId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastNotifiedAt?: string;
  config: SurveillanceConfig;
  state?: SurveillanceState;
}

// ==========================================
// Market Replay & Trading Simulator Types
// ==========================================

export type ReplayOrderType = 'market' | 'limit' | 'stop';
export type ReplayOrderSide = 'buy' | 'sell';
export type ReplayPositionSide = 'long' | 'short';

export interface ReplayPosition {
  id: string;
  symbol: string;
  side: ReplayPositionSide;
  entryPrice: number;
  currentPrice: number;
  sizeUsd: number;
  marginUsd: number;
  quantity: number;
  leverage: number;
  slPrice?: number;
  tpPrice?: number;
  entryTime: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  liquidationPrice: number;
  tag?: string;
  notes?: string;
  entryScreenshot?: string;
}

export interface ReplayPendingOrder {
  id: string;
  symbol: string;
  side: ReplayOrderSide;
  orderType: 'limit' | 'stop';
  price: number;
  sizeUsd: number;
  leverage: number;
  slPrice?: number;
  tpPrice?: number;
  tag?: string;
  notes?: string;
  createdAtTime: number;
}

export interface ReplayTradeJournalItem {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  side: ReplayPositionSide;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  sizeUsd: number;
  marginUsd: number;
  leverage: number;
  slPrice?: number;
  tpPrice?: number;
  pnlUsd: number;
  pnlPct: number;
  commissionUsd: number;
  tag: string;
  notes?: string;
  screenshotUrl?: string;
  exitReason: 'tp' | 'sl' | 'manual' | 'liquidation' | 'limit';
}

export interface ReplaySimulationSettings {
  balance: number;
  leverage: number;
  positionSizeUsd: number;
  commissionPct: number; // e.g. 0.05
  spreadPct: number;     // e.g. 0.02
  slippagePct: number;   // e.g. 0.02
  autoSlPct?: number;
  autoTpPct?: number;
}

