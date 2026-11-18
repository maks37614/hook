import type { ExchangeId, MarketType, UserProfile } from '../types';
import { sendTickerToMetaScalp, type MetaScalpSettings } from './metaScalpService';

export type TerminalProvider = 'metascalp' | 'tiger' | 'vataga' | 'none';
export type TerminalLinkSource = 'screener' | 'formations' | 'early' | 'favorites' | 'chart' | 'terminal' | 'alerts' | 'impulses' | 'densities' | 'surveillance';

export const LINK_SOURCES: Array<{ id: TerminalLinkSource; label: string; description: string }> = [
  { id: 'screener', label: 'Скрінер', description: 'Кнопки лінковки у списку монет' },
  { id: 'formations', label: 'Формації', description: 'Звичайні формації та їхні картки' },
  { id: 'early', label: 'Раннє виявлення W/M', description: 'Попередні формації без впливу на їхній пошук' },
  { id: 'favorites', label: 'Обрані монети', description: 'Швидке відкриття зі списку обраних' },
  { id: 'chart', label: 'Повноекранний графік', description: 'Кнопка на графіку та відкриття монети' },
  { id: 'terminal', label: 'Термінал h00k', description: 'Кнопка зовнішнього термінала у власному терміналі' },
  { id: 'alerts', label: 'Цінові сповіщення', description: 'Відкрити монету із центру сповіщень' },
  { id: 'impulses', label: 'Імпульси й волатильність', description: 'Відкривати інструменти зі сповіщень про імпульси' },
  { id: 'densities', label: 'Щільності BID/ASK', description: 'Відкривати інструменти зі сповіщень про щільності' },
  { id: 'surveillance', label: 'Спостереження', description: 'Відкривати інструменти зі сповіщень спостереження' },
];

export interface TerminalLinkSettings {
  provider: TerminalProvider;
  enabled: boolean;
  sources: Record<TerminalLinkSource, boolean>;
  /** Deliberate user clicks / existing chart-selection behavior, not unsolicited alerts. */
  switchOnChartOpen: boolean;
  /** Opt-in: switch on fresh notifications that identify their symbol, exchange and market. */
  autoSignals: boolean;
  /** Only meaningful when an actual 0-100 quality score is available. */
  minQuality: number;
  cooldownMs: number;
  tigerPort: number;
  tigerGroup: string;
  /** Optional per-source group overrides; terminal-specific and validated before sending. */
  metaScalpGroups: Partial<Record<TerminalLinkSource, string>>;
  tigerGroups: Partial<Record<TerminalLinkSource, string>>;
}

const DEFAULT_SOURCES: Record<TerminalLinkSource, boolean> = {
  screener: true, formations: true, early: true, favorites: true, chart: true, terminal: true,
  alerts: false, impulses: false, densities: false, surveillance: false,
};

export const DEFAULT_TERMINAL_LINK_SETTINGS: TerminalLinkSettings = {
  provider: 'metascalp', enabled: true, sources: DEFAULT_SOURCES,
  switchOnChartOpen: true, autoSignals: false, minQuality: 0, cooldownMs: 1200,
  tigerPort: 7819, tigerGroup: 'A', metaScalpGroups: {}, tigerGroups: {},
};

export function normalizeTerminalLinkSettings(saved?: Partial<TerminalLinkSettings> | null): TerminalLinkSettings {
  // Vataga is intentionally hidden until its documented local API is available.
  // Existing saved Vataga choices fail closed instead of silently switching to MetaScalp.
  const vatagaPaused = saved?.provider === 'vataga';
  const validProviders = ['metascalp', 'tiger', 'none'];
  const provider: TerminalProvider = vatagaPaused ? 'none'
    : validProviders.includes(saved?.provider || '') ? saved!.provider! : 'metascalp';
  const port = Number(saved?.tigerPort);
  const quality = Number(saved?.minQuality);
  const cooldown = Number(saved?.cooldownMs);
  const boolSources = Object.fromEntries(
    LINK_SOURCES.map(({ id }) => [id, typeof saved?.sources?.[id] === 'boolean' ? saved.sources[id] : DEFAULT_SOURCES[id]])
  ) as Record<TerminalLinkSource, boolean>;
  return {
    ...DEFAULT_TERMINAL_LINK_SETTINGS, ...saved, provider, sources: boolSources,
    enabled: !vatagaPaused && saved?.enabled !== false,
    switchOnChartOpen: saved?.switchOnChartOpen !== false,
    autoSignals: !vatagaPaused && saved?.autoSignals === true, // Explicit opt-in only.
    minQuality: Number.isFinite(quality) ? Math.min(100, Math.max(0, Math.round(quality))) : 0,
    cooldownMs: Number.isFinite(cooldown) ? Math.max(0, Math.min(60000, Math.round(cooldown))) : 1200,
    tigerPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : 7819,
    tigerGroup: normalizeTigerGroup(saved?.tigerGroup) ?? 'A',
    metaScalpGroups: sanitizeGroups(saved?.metaScalpGroups, normalizeMetaScalpGroup),
    tigerGroups: sanitizeGroups(saved?.tigerGroups, normalizeTigerGroup),
  };
}

function sanitizeGroups(raw: Partial<Record<TerminalLinkSource, string>> | undefined, valid: (s: string | undefined) => string | null) {
  return Object.fromEntries(LINK_SOURCES.flatMap(({ id }) => {
    const group = valid(raw?.[id]);
    return group ? [[id, group]] : [];
  })) as Partial<Record<TerminalLinkSource, string>>;
}

export function normalizeMetaScalpGroup(group?: string): string | null {
  const str = String(group ?? '').trim();
  if (!/^\d{1,3}$/.test(str)) return null;
  const n = Number(str);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? String(n).padStart(3, '0') : null;
}

/** Tiger Windows API uses BINANCE-FUT for USDⓈ-M Binance futures,
 * while Bybit uses the same exchange code for spot and futures.
 */
export function tigerExchangeCode(exchange: ExchangeId, marketType: MarketType): string {
  return exchange === 'binance' && marketType === 'futures'
    ? 'BINANCE-FUT'
    : exchange.toUpperCase();
}

export function normalizeTigerGroup(group?: string): string | null {
  const value = String(group ?? '').trim().toUpperCase();
  return /^[A-Z]$/.test(value) || /^(?:[0-9]|1[0-8])$/.test(value) ? value : null;
}

export function getUserTerminalLinkSettings(
  userId?: string,
  profile?: Pick<UserProfile, 'uid' | 'terminalLinkSettings' | 'metaScalpSettings'> | null
): TerminalLinkSettings {
  if (!userId || profile?.uid !== userId) return normalizeTerminalLinkSettings({ provider: 'none', enabled: false });
  // Preserve previous MetaScalp auto-switch choice for accounts created before this feature.
  if (!profile.terminalLinkSettings) {
    return normalizeTerminalLinkSettings({
      switchOnChartOpen: profile.metaScalpSettings?.autoSwitchOnClick !== false,
      enabled: profile.metaScalpSettings?.enabled !== false,
    });
  }
  return normalizeTerminalLinkSettings(profile.terminalLinkSettings);
}

export function notificationTerminalSource(kind: string): TerminalLinkSource | null {
  if (kind === 'system') return null;
  if (kind === 'formation' || kind === 'quality' || kind === 'composite') return 'formations';
  if (kind === 'early') return 'early';
  if (kind === 'impulse' || kind === 'volatility') return 'impulses';
  if (kind === 'density') return 'densities';
  if (kind === 'surveillance') return 'surveillance';
  return 'alerts';
}

/** Reject historical, delayed and future-dated notifications on automatic linking. */
export function isFreshTerminalNotification(timestamp: number, sessionStart: number, now: number): boolean {
  return Number.isFinite(timestamp) && Number.isFinite(sessionStart) && Number.isFinite(now)
    && timestamp >= sessionStart && timestamp <= now + 1000
    && now - timestamp <= 12000;
}

export function terminalLabel(provider: TerminalProvider): string {
  return { metascalp: 'MetaScalp', tiger: 'Tiger', vataga: 'Vataga', none: 'Вимкнено' }[provider];
}

export interface TerminalLinkResult {
  success: boolean;
  terminal: TerminalProvider;
  message: string;
  ticker: string;
  group: string;
  copiedToClipboard?: boolean;
}

async function clipboardFallback(ticker: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ticker);
      return true;
    }
  } catch { /* Browser denied clipboard */ }
  return false;
}

/**
 * Match Tiger's documented request echo, not a generic 'successfully' frame.
 * A response for a different symbol/group must not be reported as our success.
 */
export function matchesTigerAcknowledgement(payload: string, response: unknown): boolean {
  if (payload === 'ping') return false;
  try {
    const requested = JSON.parse(payload);
    const envelope = response as {
      response?: { type?: string };
      request?: { e?: string; m?: string; symbol?: string; linkGroup?: string; type?: string };
    } | null;
    if (!envelope || envelope.response?.type?.toLowerCase() !== 'successfully' || !envelope.request) return false;
    const echoed = envelope.request;
    const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string'
      && a.toUpperCase() === b.toUpperCase();
    return same(echoed.type, 'setLinkSymbol') &&
      same(echoed.e, requested.e) &&
      same(echoed.m, requested.m) &&
      same(echoed.symbol, requested.symbol) &&
      same(echoed.linkGroup, requested.linkGroup);
  } catch {
    return false;
  }
}

async function tigerSocketCommand(port: number, payload: string, timeoutMs = 2800): Promise<{ ok: boolean; message: string }> {
  if (typeof WebSocket === 'undefined') return { ok: false, message: 'Цей браузер не підтримує WebSocket.' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, message: 'Некоректний локальний порт Tiger.' };
  }
  return await new Promise(resolve => {
    let settled = false;
    let socket: WebSocket | null = null;
    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve({ ok, message });
    };
    const timer = setTimeout(() => finish(false, 'Tiger не відповів або не підтвердив потрібний інструмент. Перевірте локальний сервер сигналів.'), timeoutMs);
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.onopen = () => {
        try { socket?.send(payload); }
        catch { finish(false, 'Не вдалося надіслати команду в Tiger.'); }
      };
      socket.onmessage = event => {
        const raw = typeof event.data === 'string' ? event.data : '';
        if (payload === 'ping' && raw.trim().toLowerCase() === 'pong') {
          finish(true, 'Локальний сервер Tiger відповідає.');
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (payload === 'ping') {
            // An unrelated success response cannot identify the Tiger server.
            if (parsed?.title === 'Pong' && parsed?.response?.type === 'successfully') {
              finish(true, 'Локальний сервер Tiger відповідає.');
            }
            return;
          }
          if (parsed?.response?.type === 'error' || parsed?.response?.error) {
            finish(false, String(parsed?.response?.error?.message || parsed?.message || 'Tiger відхилив команду.'));
          } else if (matchesTigerAcknowledgement(payload, parsed)) {
            finish(true, String(parsed?.message || 'Tiger підтвердив перемикання.'));
          }
          // Ignore unrelated/unsolicited frames; wait for the matching response or timeout.
        } catch { /* Ignore non-JSON frames while waiting for the expected response. */ }
      };
      socket.onerror = () => finish(false, 'Не вдалося підключитися до Tiger на цьому комп’ютері.');
      socket.onclose = () => finish(false, 'Tiger закрив з’єднання без підтвердження.');
    } catch {
      finish(false, 'Браузер заблокував локальне WebSocket-з’єднання Tiger.');
    }
  });
}

export async function testTigerConnection(port: number): Promise<{ ok: boolean; message: string }> {
  const validPort = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 7819;
  return tigerSocketCommand(validPort, 'ping');
}

export async function sendToSelectedTerminal(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  source: TerminalLinkSource,
  preferences: TerminalLinkSettings,
  metaScalp: MetaScalpSettings,
  quality?: number,
  allowClipboardFallback = true
): Promise<TerminalLinkResult> {
  const p = normalizeTerminalLinkSettings(preferences);
  const ticker = symbol.trim().toUpperCase();
  const terminal = p.provider;
  const base = { terminal, ticker, group: '', success: false };
  if (!p.enabled || terminal === 'none') return { ...base, message: 'Лінковка вимкнена в профілі.' };
  if (!p.sources[source]) return { ...base, message: 'Для цього розділу передачу монет вимкнено в профілі.' };
  if (!/^[A-Z0-9:_-]{2,40}$/.test(ticker)) return { ...base, message: 'Некоректний тикер для передавання.' };
  if (p.minQuality > 0 && (quality === undefined || !Number.isFinite(quality) || quality < p.minQuality)) {
    return { ...base, message: quality === undefined ? 'Для цієї монети немає перевіреної оцінки якості сигналу.' : `Якість сигналу нижче ${p.minQuality}/100.` };
  }
  if (terminal === 'metascalp') {
    if (!metaScalp.enabled) return { ...base, message: 'MetaScalp вимкнено в налаштуваннях.' };
    const group = normalizeMetaScalpGroup(p.metaScalpGroups[source] || metaScalp.binding);
    if (!group) return { ...base, message: 'Група MetaScalp має бути від 001 до 500.' };
    const result = await sendTickerToMetaScalp(ticker, exchange, marketType, { ...metaScalp, binding: group }, allowClipboardFallback);
    return { terminal, success: result.success, ticker: result.ticker, group, message: result.message, copiedToClipboard: result.copiedToClipboard };
  }
  if (terminal === 'tiger') {
    const group = normalizeTigerGroup(p.tigerGroups[source] || p.tigerGroup);
    if (!group) return { ...base, message: 'Неправильна група Tiger. Доступні A–Z або 0–18.' };
    const payload = JSON.stringify({ type: 'setLinkSymbol', e: tigerExchangeCode(exchange, marketType), m: marketType.toUpperCase(), symbol: ticker, linkGroup: group });
    const result = await tigerSocketCommand(p.tigerPort, payload);
    const copied = result.ok || !allowClipboardFallback ? false : await clipboardFallback(ticker);
    return { terminal, success: result.ok, ticker, group, message: result.message, copiedToClipboard: copied };
  }
  const copied = allowClipboardFallback ? await clipboardFallback(ticker) : false;
  return {
    terminal, success: false, ticker, group: '',
    message: 'Vataga: відкриття через API ще не активовано — виробник не опублікував формат локальної команди. Налаштуйте «Інтеграція додатків» у Vataga; до підтвердження протоколу доступне копіювання тикера.',
    copiedToClipboard: copied,
  };
}
