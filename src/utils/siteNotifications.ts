/** Explicit opt-in v2. Existing implicit/legacy toggles are never interpreted as consent. */
export type SiteNotificationKind =
  | 'price' | 'formation' | 'impulse' | 'volatility' | 'surveillance'
  | 'levels' | 'breakouts' | 'density' | 'round' | 'openInterest'
  | 'flow' | 'liquidations' | 'volume' | 'early' | 'quality'
  | 'favorites' | 'system' | 'composite';
export type SiteNotificationSound = 'alert35' | 'chime' | 'soft' | 'pulse' | 'custom';
export type ImpulseExchange = 'binance' | 'bybit';
export type ImpulseMarket = 'futures' | 'spot';
export type NotificationCategoryKey = Exclude<SiteNotificationKind, 'volatility'>;
/** Identical routing for browser surveillance events and server Telegram delivery.
 * Only explicit event codes are interpreted; generic labels are not evidence. */
export function classifySurveillanceEventType(value: unknown): SiteNotificationKind {
  const type = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (type.startsWith('DENSITY_') || type.includes('ORDERBOOK')) return 'density';
  if (type.startsWith('OI_')) return 'openInterest';
  if (type.startsWith('VOLUME_') || type.startsWith('RVOL_')) return 'volume';
  if (type.startsWith('FIBONACCI') || type.startsWith('THIRD_TOUCH')
    || type === 'LEVEL_DETECTED') return 'levels';
  if (type.includes('BREAKOUT') || type.startsWith('CHANNEL_BREAK')
    || type.startsWith('LEVEL_CROSS') || type.includes('RETEST')
    || type === 'STRUCTURE_SHIFT' || type === 'BOS' || type === 'CHOCH'
    || type === 'SUPPORT_RESISTANCE_FLIP') return 'breakouts';
  if (type === 'MOMENTUM' || type === 'IMPULSE') return 'impulse';
  if (type.startsWith('FORMATION_') || type.includes('SETUP')) return 'formation';
  return 'surveillance';
}


export const NOTIFICATION_CATEGORIES: ReadonlyArray<{
  key: NotificationCategoryKey; group: string; label: string; explanation: string; source: string;
}> = [
  { key: 'price', group: 'Ціна та рівні', label: 'Цінові алерти', explanation: 'Досягнення рівня, який ви окремо створили на графіку. Серверна доставка Telegram для створених вручну алертів налаштовується окремо.', source: 'Існуючі цінові алерти' },
  { key: 'levels', group: 'Ціна та рівні', label: 'Наближення до Entry / SL / TP / S/R', explanation: 'Відстань від поточної ціни до ключових рівнів в уже знайдених формаціях. Це наближення, а не гарантована точка входу.', source: 'Сканер формацій' },
  { key: 'breakouts', group: 'Ціна та рівні', label: 'Пробої, ретести та структура', explanation: 'Підтверджений пробій на закритій свічці формації, а також події рівнів, каналів, Fibonacci та структури із системного нагляду. Хибний пробій можливий лише якщо окрема подія так позначена.', source: 'Сканер і системний нагляд' },
  { key: 'round', group: 'Ціна та рівні', label: 'Круглі числа · ROUND', explanation: 'Формації з позначкою ROUND біля круглого цінового рівня. Для підтвердження щільності є окремий фільтр.', source: 'ROUND у картці формації' },
  { key: 'density', group: 'Стакан та потік', label: 'Щільності BID / ASK', explanation: 'Тільки підтверджена реальним стаканом щільність біля формації або спеціальні події моніторингу. Близькість до ROUND не означає щільність.', source: 'Перевірений стакан / нагляд' },
  { key: 'openInterest', group: 'Стакан та потік', label: 'Аномалії Open Interest', explanation: 'OI змінюється понад заданий поріг; тільки реальні доступні біржові дані ф’ючерсів. Н/д не є сигналом.', source: 'Перевірений OI' },
  { key: 'flow', group: 'Стакан та потік', label: 'Delta / CVD20', explanation: 'Великий дисбаланс агресивних покупців чи продавців за закритими свічками. Показники недоступні на частині ринків.', source: 'Binance Delta / CVD20' },
  { key: 'volume', group: 'Стакан та потік', label: 'Аномальний обсяг · RVOL', explanation: 'Обсяг свічки підтвердженого пробою щодо середнього обсягу. Не плутати з денним оборотом.', source: 'Валідація формації' },
  { key: 'liquidations', group: 'Стакан та потік', label: 'Ліквідації Long / Short', explanation: 'Велика ліквідація вибраної монети за повідомленнями потоку HookChart. Вимагає конкретної монети та відкритої вкладки.', source: 'Потік ліквідацій HookChart' },
  { key: 'impulse', group: 'Стакан та потік', label: 'Імпульс і волатильність', explanation: 'Зміна ціни або діапазон коливань за 1, 5 чи 15 хвилин. Працює через WebSocket лише з відкритим сайтом.', source: 'Угоди WebSocket' },
  { key: 'formation', group: 'Формації та Quant', label: 'Нові сильні формації', explanation: 'Свіжа формація з оцінкою вище вибраного порога. Повторні сканування того самого патерну не надсилають дубль.', source: 'Сканер формацій' },
  { key: 'early', group: 'Формації та Quant', label: 'Ранні W / M', explanation: 'Можлива W/M-структура на закритих свічках. Це передбачення, а не підтверджена формація.', source: 'Ранній пошук W/M' },
  { key: 'quality', group: 'Формації та Quant', label: 'Зміна оцінки сигналу', explanation: 'Формація вперше перейшла заданий бал або її рейтинг істотно покращився. Наявність сигналу не гарантує результату.', source: 'Оцінка 0–100' },
  { key: 'composite', group: 'Формації та Quant', label: 'Комплексне підтвердження', explanation: 'Одночасно достатньо НЕЗАЛЕЖНИХ доступних підтверджень: структура, обсяг, OI, Delta/CVD, ROUND, стакан. Це прозорі Quant-правила, а не рекомендація ШІ до торгівлі.', source: 'Quant-перевірка' },
  { key: 'favorites', group: 'Особисте та система', label: 'Події обраних монет', explanation: 'Сильні формації лише на монетах із ваших обраних папок (з урахуванням біржі та типу ринку).', source: 'Обрані монети' },
  { key: 'surveillance', group: 'Особисте та система', label: 'Стеження за монетою', explanation: 'Інші нові події персонального системного нагляду, які не потрапили до спеціальних категорій.', source: 'Наявний системний нагляд' },
  { key: 'system', group: 'Особисте та система', label: 'Технічні попередження', explanation: 'Втрачений інтернет, збій сканування або застарілі дані. Технічні повідомлення не є торговими сигналами.', source: 'Стан підключення сайту' },
] as const;

export interface SiteNotificationSettings {
  /** Explicit user opt-in marker. v1 values cannot enable notifications. */
  optedIn: boolean;
  enabled: boolean;
  /** Timestamp of last explicit enable, used to avoid backfilling earlier alerts. */
  enabledAt: number;
  price: boolean;
  formations: boolean;
  impulses: boolean;
  surveillance: boolean;
  levels: boolean;
  breakouts: boolean;
  density: boolean;
  round: boolean;
  openInterest: boolean;
  flow: boolean;
  liquidations: boolean;
  volume: boolean;
  early: boolean;
  quality: boolean;
  favorites: boolean;
  system: boolean;
  composite: boolean;
  sound: SiteNotificationSound;
  /** Set only after a user explicitly changes the selected melody. */
  soundChosen: boolean;
  browserPush: boolean;
  telegramEnabled: boolean;
  impulseSymbol: string;
  impulseThresholdPct: number;
  impulseWindowMinutes: 1 | 5 | 15;
  impulseExchange: ImpulseExchange;
  impulseMarket: ImpulseMarket;
  /** Global filters for scanner and surveillance events. */
  scopeExchange: 'all' | ImpulseExchange;
  scopeMarket: 'all' | ImpulseMarket;
  scopeTimeframe: 'all' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  scopeSymbols: string;
  onlyFavorites: boolean;
  /** Canonical exchange:market:symbol keys also enforced by the server. */
  favoriteIds: string[];
  levelDistancePct: number;
  roundDistancePct: number;
  oiThresholdPct: number;
  flowThresholdPct: number;
  minBreakoutRvol: number;
  liquidationMinUsd: number;
  minQualityScore: number;
  qualityImprovement: number;
  minConfirmations: number;
  cooldownMinutes: number;
}

export interface SiteNotificationItem {
  id: string;
  kind: SiteNotificationKind;
  title: string;
  description: string;
  timestamp: number;
  symbol?: string;
  exchange?: string;
  marketType?: string;
  timeframe?: string;
  changePct?: number;
  rangePct?: number;
  read: boolean;
}

export const DEFAULT_SITE_NOTIFICATIONS: SiteNotificationSettings = {
  optedIn: false, enabled: false, enabledAt: 0,
  price: false, formations: false, impulses: false, surveillance: false,
  levels: false, breakouts: false, density: false, round: false, openInterest: false,
  flow: false, liquidations: false, volume: false, early: false, quality: false,
  favorites: false, system: false, composite: false,
  sound: 'alert35', soundChosen: false, browserPush: false, telegramEnabled: false,
  impulseSymbol: '', impulseThresholdPct: 2, impulseWindowMinutes: 5,
  impulseExchange: 'binance', impulseMarket: 'futures',
  scopeExchange: 'all', scopeMarket: 'all', scopeTimeframe: 'all',
  scopeSymbols: '', onlyFavorites: false, favoriteIds: [],
  levelDistancePct: .3, roundDistancePct: .5,
  oiThresholdPct: 3, flowThresholdPct: 5, minBreakoutRvol: 2,
  liquidationMinUsd: 100_000, minQualityScore: 88,
  qualityImprovement: 10, minConfirmations: 3, cooldownMinutes: 15,
};

const CATEGORY_KEYS: ReadonlyArray<NotificationCategoryKey> = NOTIFICATION_CATEGORIES.map(c => c.key);
export function normalizeImpulseSymbol(input: string): string {
  const symbol = String(input ?? '').trim().toUpperCase().replace(/[/\s-]/g, '');
  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) return '';
  return symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
}
export function normalizeSymbolList(input: unknown): string {
  return String(input ?? '').split(/[,\s;]+/).map(normalizeImpulseSymbol)
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 40).join(', ');
}
/** Never trust arbitrary browser payloads when persisting server-side favorite scopes. */
export function normalizeNotificationFavoriteIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const keys: string[] = [];
  for (const item of input.slice(0, 300)) {
    if (typeof item !== 'string') continue;
    const key = item.trim().toLowerCase();
    const match = /^(binance|bybit):(futures|spot):([a-z0-9]{2,40})$/.exec(key);
    if (match) keys.push(match[1] + ':' + match[2] + ':' + match[3].toUpperCase());
    else if (/^[a-z0-9]{2,40}$/.test(key)) keys.push('binance:futures:' + key.toUpperCase());
    else {
      const legacy = /^(binance|bybit):([a-z0-9]{2,40})$/.exec(key);
      if (legacy) keys.push(legacy[1] + ':futures:' + legacy[2].toUpperCase());
    }
  }
  return [...new Set(keys)].slice(0, 150);
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n * 100) / 100)) : fallback;
}
export function normalizeSiteNotificationSettings(input: unknown): SiteNotificationSettings {
  const d = input && typeof input === 'object' ? input as Partial<SiteNotificationSettings> : {};
  const consent = d.optedIn === true;
  const result: SiteNotificationSettings = {
    ...DEFAULT_SITE_NOTIFICATIONS, optedIn: consent,
    enabled: consent && d.enabled === true,
    enabledAt: typeof d.enabledAt === 'number' && Number.isFinite(d.enabledAt) && d.enabledAt > 0
      ? Math.floor(d.enabledAt) : 0,
    // Older stored default was 'chime'. With no explicit-selection marker it
    // migrates to the new default; explicitly selected sounds remain unchanged.
    sound: d.sound === 'soft' || d.sound === 'pulse' || d.sound === 'custom'
      || d.sound === 'alert35' || (d.sound === 'chime' && d.soundChosen === true)
      ? d.sound : 'alert35',
    soundChosen: d.soundChosen === true
      || d.sound === 'soft' || d.sound === 'pulse' || d.sound === 'custom',
    // The master switch also revokes delivery channels; merely keeping a browser
    // permission granted is never consent to receive notifications.
    browserPush: consent && d.enabled === true && d.browserPush === true,
    // Kept as a legacy data field only. This on-site center never enables
    // server Telegram delivery or controls another page's Telegram settings.
    telegramEnabled: false,
    impulseSymbol: normalizeImpulseSymbol(d.impulseSymbol || ''),
    impulseThresholdPct: bounded(d.impulseThresholdPct, 2, .1, 50),
    impulseWindowMinutes: d.impulseWindowMinutes === 1 || d.impulseWindowMinutes === 15 ? d.impulseWindowMinutes : 5,
    impulseExchange: d.impulseExchange === 'bybit' ? 'bybit' : 'binance',
    impulseMarket: d.impulseMarket === 'spot' ? 'spot' : 'futures',
    scopeExchange: d.scopeExchange === 'binance' || d.scopeExchange === 'bybit' ? d.scopeExchange : 'all',
    scopeMarket: d.scopeMarket === 'spot' || d.scopeMarket === 'futures' ? d.scopeMarket : 'all',
    scopeTimeframe: ['1m','5m','15m','1h','4h','1d'].includes(String(d.scopeTimeframe)) ? d.scopeTimeframe as SiteNotificationSettings['scopeTimeframe'] : 'all',
    scopeSymbols: normalizeSymbolList(d.scopeSymbols),
    onlyFavorites: d.onlyFavorites === true,
    favoriteIds: normalizeNotificationFavoriteIds(d.favoriteIds),
    levelDistancePct: bounded(d.levelDistancePct, .3, .01, 5),
    roundDistancePct: bounded(d.roundDistancePct, .5, .01, 5),
    oiThresholdPct: bounded(d.oiThresholdPct, 3, .1, 50),
    flowThresholdPct: bounded(d.flowThresholdPct, 5, .1, 100),
    minBreakoutRvol: bounded(d.minBreakoutRvol, 2, 1, 20),
    liquidationMinUsd: bounded(d.liquidationMinUsd, 100_000, 1000, 10_000_000),
    minQualityScore: Math.round(bounded(d.minQualityScore, 88, 1, 100)),
    qualityImprovement: Math.round(bounded(d.qualityImprovement, 10, 1, 100)),
    minConfirmations: Math.round(bounded(d.minConfirmations, 3, 2, 6)),
    cooldownMinutes: Math.round(bounded(d.cooldownMinutes, 15, 1, 240)),
  };
  for (const key of CATEGORY_KEYS) {
    const settingKey = key === 'formation' ? 'formations' : key === 'impulse' ? 'impulses' : key;
    (result as unknown as Record<string, unknown>)[settingKey] = consent &&
      (d as unknown as Record<string, unknown>)[settingKey] === true;
  }
  return result;
}
export function siteNotificationStorageKey(uid: string): string {
  return 'h00k_site_notifications_v2:' + (uid || 'guest');
}
export function siteNotificationSettingsKey(uid: string): string {
  return 'h00k_site_notification_settings_v2:' + (uid || 'guest');
}
export function siteNotificationClearedAtKey(uid: string): string {
  return 'h00k_site_notifications_cleared_at_v1:' + (uid || 'guest');
}
/** Shared across all tabs, so a stale profile snapshot cannot resurrect notifications. */
export function siteNotificationMuteKey(uid: string): string {
  return 'h00k_site_notifications_mute_v2:' + (uid || 'guest');
}
export function applyLocalNotificationMute(settings: SiteNotificationSettings, mutedAt: number): SiteNotificationSettings {
  if (mutedAt > 0 && settings.enabledAt <= mutedAt) {
    return normalizeSiteNotificationSettings({ ...settings, enabled: false });
  }
  return settings;
}
export function siteNotificationSeenKey(uid: string): string {
  return 'h00k_site_notifications_seen_v2:' + (uid || 'guest');
}
export function notificationEnabled(settings: SiteNotificationSettings, kind: SiteNotificationKind): boolean {
  if (!settings.optedIn || !settings.enabled) return false;
  const key = kind === 'volatility' ? 'impulses' : kind === 'formation' ? 'formations'
    : kind === 'impulse' ? 'impulses' : kind;
  return (settings as unknown as Record<string, unknown>)[key] === true;
}
export function readNotificationItems(raw: string | null): SiteNotificationItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SiteNotificationItem =>
      item && typeof item.id === 'string' && typeof item.title === 'string'
      && typeof item.description === 'string' && Number.isFinite(item.timestamp)
      && ['price','formation','impulse','volatility','surveillance','levels','breakouts',
        'density','round','openInterest','flow','liquidations','volume','early','quality',
        'favorites','system','composite'].includes(item.kind)
    ).slice(0, 100).map(item => ({ ...item, read: item.read === true }));
  } catch { return []; }
}
export function matchesNotificationScope(
  settings: SiteNotificationSettings,
  source: { symbol?: string; exchange?: string; marketType?: string; timeframe?: string },
  favoriteIds: readonly string[] = [],
  options: { timeframeIndependent?: boolean } = {},
): boolean {
  // When a specific filter is selected, missing source metadata must NOT bypass it.
  if (settings.scopeExchange !== 'all' && source.exchange !== settings.scopeExchange) return false;
  if (settings.scopeMarket !== 'all' && source.marketType !== settings.scopeMarket) return false;
  if (!options.timeframeIndependent && settings.scopeTimeframe !== 'all'
    && source.timeframe !== settings.scopeTimeframe) return false;
  const symbol = (source.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (settings.scopeSymbols) {
    if (!symbol || !settings.scopeSymbols.split(/,\s*/).includes(symbol)) return false;
  }
  if (settings.onlyFavorites) {
    // Keys are "exchange:market:symbol". Legacy plain symbols mean Binance Futures,
    // not any other exchange carrying the same instrument.
    if (!symbol || !source.exchange || !source.marketType ||
      !favoriteIds.some(id => {
        if (typeof id !== 'string') return false;
        const parts = id.trim().toLowerCase().split(':');
        const exchange = parts.length >= 2 ? parts[0] : 'binance';
        const marketType = parts.length >= 3 ? parts[1] : 'futures';
        const coin = (parts.length >= 3 ? parts.slice(2).join(':')
          : parts.length === 2 ? parts[1] : parts[0]).toUpperCase();
        return exchange === source.exchange && marketType === source.marketType && coin === symbol;
      })) return false;
  }
  return true;
}

export interface ImpulseDetection {
  kind: 'impulse' | 'volatility';
  changePct: number;
  rangePct: number;
  baselinePrice: number;
  currentPrice: number;
  durationSeconds: number;
}

/** A strictly bounded rolling price window. Uses actual observed trades, not 24h change. */
export class ImpulseTracker {
  private points: Array<{ timestamp: number; price: number }> = [];
  private lastFired = 0;

  constructor(private windowMinutes = 5) {}

  push(price: number, now: number, thresholdPct: number): ImpulseDetection | null {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(now)) return null;
    const windowMs = this.windowMinutes * 60_000;
    const cutoff = now - windowMs;
    this.points = this.points.filter(point => point.timestamp >= cutoff);
    if (!this.points.length || now - this.points[this.points.length - 1].timestamp >= 1000) {
      this.points.push({ timestamp: now, price });
    } else {
      this.points[this.points.length - 1] = { timestamp: now, price };
    }
    if (this.points.length > 1000) this.points.splice(0, this.points.length - 1000);
    const oldest = this.points[0];
    const duration = now - oldest.timestamp;
    if (duration < 10_000 || !Number.isFinite(thresholdPct) || thresholdPct <= 0) return null;
    const change = (price / oldest.price - 1) * 100;
    // A fast up-and-down swing is volatility even when the net change is small.
    let low = Infinity;
    let high = 0;
    for (const point of this.points) {
      low = Math.min(low, point.price);
      high = Math.max(high, point.price);
    }
    const rangePct = low > 0 ? (high / low - 1) * 100 : 0;
    const directional = Math.abs(change) + 1e-8 >= thresholdPct;
    if (!directional && rangePct + 1e-8 < thresholdPct) return null;
    if (this.lastFired && now - this.lastFired < windowMs) return null;
    this.lastFired = now;
    return {
      kind: directional ? 'impulse' : 'volatility',
      changePct: Math.round(change * 100) / 100,
      rangePct: Math.round(rangePct * 100) / 100,
      baselinePrice: oldest.price,
      currentPrice: price,
      durationSeconds: Math.round(duration / 1000),
    };
  }
}
