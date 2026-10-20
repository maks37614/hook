import type { ExchangeId, MarketType, UserProfile } from '../types';

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
  settings: Partial<MetaScalpSettings> = {}
): Promise<SendToMetaScalpResult> {
  const port = settings.port || 17845;
  const binding = settings.binding || '001';
  const ticker = formatMetaScalpTicker(symbol, exchange, marketType);

  const payload = { tickerPattern: ticker, binding };
  const activePort = await findActiveMetaScalpPort(port);
  let message = 'MetaScalp не знайдено. Запустіть термінал на цьому комп’ютері та дозвольте сайту доступ до локальної мережі.';

  if (activePort !== null) {
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
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
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
