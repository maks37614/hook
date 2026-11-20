import type { ExchangeId, MarketType, UserProfile } from '../types';
import { desktopRemoteLinkEnabled, sendTickerViaDesktop } from './desktopRemoteLink';

export interface MetaScalpSettings {
  enabled: boolean;
  port: number;
  binding: string; // '001' - '500'
  autoSwitchOnClick: boolean;
  soundFeedback?: boolean;
}

export const DEFAULT_METASCALP_SETTINGS: MetaScalpSettings = {
  enabled: true,
  port: 17845,
  binding: '001',
  autoSwitchOnClick: true,
  soundFeedback: true,
};

const STORAGE_KEY = 'crypto_screener_metascalp_settings';

export function getStoredMetaScalpSettings(userId?: string): MetaScalpSettings {
  if (!userId) return { ...DEFAULT_METASCALP_SETTINGS };
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_METASCALP_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load MetaScalp settings from localStorage:', e);
  }
  return { ...DEFAULT_METASCALP_SETTINGS };
}

export function saveStoredMetaScalpSettings(settings: MetaScalpSettings, userId?: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save MetaScalp settings:', e);
  }
}

export function getUserMetaScalpSettings(
  userId?: string,
  profile?: Pick<UserProfile, 'uid' | 'metaScalpSettings'> | null
): MetaScalpSettings {
  if (userId && profile?.uid === userId && profile.metaScalpSettings) {
    return { ...DEFAULT_METASCALP_SETTINGS, ...profile.metaScalpSettings };
  }
  return getStoredMetaScalpSettings(userId);
}

function getMetaScalpPorts(preferredPort: number): number[] {
  const preferred = Number.isInteger(preferredPort) && preferredPort >= 1 && preferredPort <= 65535
    ? preferredPort
    : DEFAULT_METASCALP_SETTINGS.port;
  return [preferred, ...Array.from({ length: 11 }, (_, index) => 17845 + index).filter((port) => port !== preferred)];
}

/**
 * Format symbol according to MetaScalp specifications:
 * Format: EXCHANGE:SYMBOL.p for futures, or EXCHANGE:SYMBOL for spot
 * Examples: BINANCE:BTCUSDT.p, BYBIT:ETHUSDT.p, BINANCE:SOLUSDT
 */
export function formatMetaScalpTicker(symbol: string, exchange: ExchangeId, marketType: MarketType): string {
  const ex = exchange.toUpperCase();
  const cleanSymbol = symbol.toUpperCase();
  const isFutures = marketType === 'futures';
  return `${ex}:${cleanSymbol}${isFutures ? '.p' : ''}`;
}

/**
 * Verify the responding application before sending terminal commands.
 */
export async function pingMetaScalpPort(port: number, timeoutMs = 1200): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.app === 'MetaScalp';
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Scans available MetaScalp local ports (17845..17855) to find active instance
 */
export async function findActiveMetaScalpPort(preferredPort = 17845): Promise<number | null> {
  for (const port of getMetaScalpPorts(preferredPort)) {
    if (await pingMetaScalpPort(port, 800)) {
      return port;
    }
  }

  return null;
}

interface LinkedMetaScalpPanel { externalId: string; connectionId: number; kind: 'orderBook' | 'chart' }
const META_DOCUMENT_GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A group can contain spot and futures books; never turn either connection into the other. */
export function linkedMetaScalpPanels(state: unknown, binding: string):
  { documents: LinkedMetaScalpPanel[]; orderBookCount: number; error?: string } | null {
  if (!state || typeof state !== 'object') return null;
  const inventory = state as { windows?: unknown; standaloneCharts?: unknown };
  if (!Array.isArray(inventory.windows) || !Array.isArray(inventory.standaloneCharts)) return null;
  const documents: unknown[] = [...inventory.standaloneCharts];
  for (const window of inventory.windows) {
    if (!window || typeof window !== 'object') continue;
    const tabs = (window as { tabs?: unknown }).tabs;
    if (!Array.isArray(tabs)) continue;
    for (const tab of tabs) {
      const items = tab && typeof tab === 'object' ? (tab as { documents?: unknown }).documents : null;
      if (Array.isArray(items)) documents.push(...items);
    }
  }
  const bindingNumber = Number(binding);
  const candidates = documents.filter(d => d && typeof d === 'object'
    && (d as { linkNumber?: number }).linkNumber === bindingNumber
    && ['orderBook','chart'].includes((d as {kind?: string}).kind || '')) as {
    externalId: string; connectionId: number; kind: 'orderBook' | 'chart';
  }[];
  if (candidates.length > 16) return { documents: [], orderBookCount: 0, error: 'TOO_MANY_PANELS' };
  const found: LinkedMetaScalpPanel[] = [];
  const seen = new Set<string>();
  for (const doc of candidates) {
    // An empty chart can have a group number but no exchange connection;
    // ignore it rather than blocking working Binance/Bybit order books.
    // Never guess a missing connection for an order book.
    if (doc.kind === 'chart' && (doc.connectionId === null || doc.connectionId === undefined))
      continue;
    if (typeof doc.externalId !== 'string' || !META_DOCUMENT_GUID.test(doc.externalId)
      || !Number.isSafeInteger(doc.connectionId) || doc.connectionId <= 0)
      return { documents: [], orderBookCount: 0, error: 'UNBOUND_PANEL' };
    const externalId = doc.externalId.toLowerCase();
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    found.push({ externalId, connectionId: doc.connectionId, kind: doc.kind });
  }
  return { documents: found, orderBookCount: found.filter(doc => doc.kind === 'orderBook').length };
}

/** Only local read-only inventory plus document-specific ticker writes. */
async function sendMixedMetaScalpGroup(port: number, binding: string, symbol: string):
  Promise<{ success: boolean; message: string } | null> {
  const base = `http://127.0.0.1:${port}`;
  const stateController = new AbortController();
  const stateTimer = setTimeout(() => stateController.abort(), 1200);
  let state: unknown;
  try {
    const response = await fetch(base + '/api/ui/state', {
      method: 'GET', mode: 'cors', cache: 'no-store', signal: stateController.signal,
    });
    if (!response.ok) return null; // Older MetaScalp: normal named-binding fallback.
    state = await response.json();
  } catch { return null; }
  finally { clearTimeout(stateTimer); }
  const matched = linkedMetaScalpPanels(state, binding);
  if (!matched) return null;
  if (matched.error) return { success: false, message: 'MetaScalp: некоректні панелі у групі ' + binding + '.' };
  const docs = matched.documents;
  // A single order book must follow the site-selected market, regardless
  // of how many charts share its group. Two or more order books in ANY
  // binding group retain their own Spot/Futures market connections.
  if (matched.orderBookCount < 2) return null;
  const results = await Promise.all(docs.map(async doc => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1600);
    try {
      const response = await fetch(base + '/api/ui/documents/' + doc.externalId + '/ticker', {
        method: 'PUT', mode: 'cors', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        // No exchange or connectionId override: every panel keeps its
        // original Binance/Bybit and Spot/Futures connection in MetaScalp.
        body: JSON.stringify({ ticker: symbol.trim().toUpperCase() }),
      });
      const data = await response.json().catch(() => null);
      return response.ok && data?.status === 'ok';
    } catch { return false; }
    finally { clearTimeout(timeout); }
  }));
  const succeeded = results.filter(Boolean).length;
  return succeeded === docs.length
    ? { success: true, message: `MetaScalp: ${symbol.toUpperCase()} надіслано до ${succeeded} панелей групи ${binding} зі збереженням Spot/Futures.` }
    : { success: false, message: `MetaScalp: оновлено ${succeeded} з ${docs.length} панелей групи ${binding}. Перевірте підключення.` };
}

export interface SendToMetaScalpResult {
  success: boolean;
  message: string;
  ticker: string;
  binding: string;
  portUsed?: number;
  copiedToClipboard?: boolean;
}

/**
 * Sends a ticker change command to the local MetaScalp terminal
 * via POST http://127.0.0.1:{port}/api/change-ticker
 */
export async function sendTickerToMetaScalp(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  settings: Partial<MetaScalpSettings> = {},
  allowClipboardFallback = true
): Promise<SendToMetaScalpResult> {
  const port = settings.port || 17845;
  const binding = settings.binding || '001';
  const ticker = formatMetaScalpTicker(symbol, exchange, marketType);

  // Tablet mode is an explicit per-device opt-in. Never scan the tablet's
  // localhost (where MetaScalp cannot be running) or send orders over this link.
  if (desktopRemoteLinkEnabled()) {
    const response = await sendTickerViaDesktop({ symbol, exchange, marketType, binding });
    return {
      success: response.success, message: response.message, ticker, binding,
    };
  }

  const payload = { tickerPattern: ticker, binding };
  const activePort = await findActiveMetaScalpPort(port);
  let message = 'MetaScalp не знайдено. Запустіть термінал на цьому комп’ютері та дозвольте сайту доступ до локальної мережі.';

  if (activePort !== null) {
    const mixed = await sendMixedMetaScalpGroup(activePort, binding, symbol);
    if (mixed) return {
      success: mixed.success, message: mixed.message, ticker, binding, portUsed: activePort,
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);
    try {
      const res = await fetch(`http://127.0.0.1:${activePort}/api/change-ticker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal,
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.status === 'ok') {
        return {
          success: true,
          message: `Тікер ${ticker} передано в MetaScalp (Група ${binding})`,
          ticker,
          binding,
          portUsed: activePort,
        };
      } else {
        message = typeof data?.error === 'string'
          ? `MetaScalp: ${data.error}`
          : `MetaScalp не підтвердив зміну тікера (HTTP ${res.status}).`;
      }
    } catch {
      message = 'Не вдалося передати тікер у MetaScalp. Перевірте термінал і дозвіл браузера на локальний доступ.';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fallback: Copy to clipboard if local API is not answering
  let copied = false;
  try {
    if (allowClipboardFallback && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ticker);
      copied = true;
    }
  } catch (clipErr) {
    console.warn('Clipboard write failed:', clipErr);
  }

  return {
    success: false,
    message,
    ticker,
    binding,
    copiedToClipboard: copied,
  };
}

export function playMetaScalpClickSound(): void {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    // Audio context may be blocked before user interaction
  }
}
