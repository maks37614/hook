import type { MarketCoin, ScannedCoin, ScreenerPresetFilter, Timeframe } from '../types';
import type { MarketSelection } from './marketCoinLoader';

export type QuoteMarketPreset = Exclude<ScreenerPresetFilter, 'all'>;
export type TerminalMarketPreset = QuoteMarketPreset | 'formations' | 'av' | 'av_1m';
export type TerminalQuoteMarketPreset = QuoteMarketPreset | 'av' | 'av_1m';
/** Enough information to open a chart; scanner-only form metadata is optional. */
export type TerminalPresetCoin = Pick<MarketCoin, 'symbol' | 'baseAsset' | 'quoteAsset' | 'exchange' | 'marketType'> & {
  timeframe?: Timeframe;
  formationId?: string;
};

export const MARKET_PRESETS: Array<{ id: TerminalMarketPreset; label: string; description: string }> = [
  { id: 'active', label: 'Активні', description: 'Активні монети за волатильністю 5 хв, як у скрінері' },
  { id: 'formations', label: 'Формації', description: 'Монети з поточного списку Формацій або раннього W/M з урахуванням фільтрів та сортування' },
  { id: 'av', label: 'AV', description: 'Середній обсяг торгів за хвилину (USDT), розрахований за оборотом 24г. Від найбільшого до найменшого.' },
  { id: 'av_1m', label: 'AV 1m', description: '10 монет із найбільшим середнім обсягом торгів за хвилину (USDT): оборот за 24г / 1440.' },
  { id: 'top_gainers', label: 'Топ ріст 24г', description: 'Найбільше зростання за 24 години' },
  { id: 'top_losers', label: 'Топ спад 24г', description: 'Найбільше падіння за 24 години' },
  { id: 'near_highs', label: 'На хаях', description: 'Монети у верхній зоні діапазонів за 30–730 днів, найвища позиція першою' },
  { id: 'near_lows', label: 'На лоях', description: 'Монети у нижній зоні діапазонів за 30–730 днів, найнижча позиція першою' },
];

export function getCoinVol5m(coin: { volatility5mPct?: number; volatility24hPct?: number; change24h?: number }): number {
  if (typeof coin.volatility5mPct === 'number' && coin.volatility5mPct > 0) return coin.volatility5mPct;
  const vol24h = coin.volatility24hPct || Math.abs(coin.change24h || 0) * 1.2 || 2.0;
  return Number(Math.max(0.12, vol24h * 0.14).toFixed(2));
}

export function getCoinDistanceToHigh(coin: { distanceToHighPct?: number; high24h?: number; highPrice24h?: number; price?: number; currentPrice?: number }): number {
  if (typeof coin.distanceToHighPct === 'number' && !isNaN(coin.distanceToHighPct)) return coin.distanceToHighPct;
  const high = coin.high24h || coin.highPrice24h || 0;
  const price = coin.price || coin.currentPrice || 0;
  return high > 0 && price > 0 ? Number(Math.max(0, ((high - price) / high) * 100).toFixed(1)) : 0;
}

export function getCoinDistanceToLow(coin: { distanceToLowPct?: number; low24h?: number; lowPrice24h?: number; price?: number; currentPrice?: number }): number {
  if (typeof coin.distanceToLowPct === 'number' && !isNaN(coin.distanceToLowPct)) return coin.distanceToLowPct;
  const low = coin.low24h || coin.lowPrice24h || 0;
  const price = coin.price || coin.currentPrice || 0;
  return low > 0 && price > 0 ? Number(Math.max(0, ((price - low) / low) * 100).toFixed(1)) : 0;
}

export function matchesMarketPreset(coin: MarketCoin, preset: ScreenerPresetFilter): boolean {
  switch (preset) {
    case 'active': return Boolean(coin.isActiveCoin);
    case 'top_gainers': return coin.change24h > 0;
    case 'top_losers': return coin.change24h < 0;
    case 'near_highs': return Boolean(coin.isNearHigh);
    case 'near_lows': return Boolean(coin.isNearLow);
    default: return true;
  }
}

export function coinMarketKey(coin: { symbol: string; exchange: string; marketType: string }): string {
  return `${coin.exchange}:${coin.marketType}:${coin.symbol.toUpperCase()}`;
}

export function selectMarketPresetCoins(coins: MarketCoin[], preset: TerminalQuoteMarketPreset, selection: MarketSelection, limit: number): MarketCoin[] {
  const seen = new Set<string>();
  const averageVolumePreset = preset === 'av' || preset === 'av_1m';
  const result = coins.filter(coin => {
    const key = coinMarketKey(coin);
    // Volume rankings need a valid turnover and tradable quote, not a 24h
    // percentage change. Some newly listed pairs do not have change24h yet.
    if (seen.has(key) || !Number.isFinite(coin.price) || coin.price <= 0
      || (!averageVolumePreset && !Number.isFinite(coin.change24h))) return false;
    if (selection.exchange !== 'all' && selection.exchange !== coin.exchange) return false;
    if (selection.marketType !== 'all' && selection.marketType !== coin.marketType) return false;
    if (averageVolumePreset && (!Number.isFinite(coin.volumeUsd) || coin.volumeUsd < 0 || (preset === 'av_1m' && coin.volumeUsd === 0))) return false;
    if (preset !== 'av' && preset !== 'av_1m' && !matchesMarketPreset(coin, preset)) return false;
    seen.add(key);
    return true;
  });
  result.sort((a, b) => {
    let difference = 0;
    switch (preset) {
      case 'av':
      case 'av_1m': difference = b.volumeUsd - a.volumeUsd; break; // AV 1m = 24h USD turnover / 1,440 minutes.
      case 'active': difference = getCoinVol5m(b) - getCoinVol5m(a); break;
      case 'top_gainers': difference = b.change24h - a.change24h; break;
      case 'top_losers': difference = a.change24h - b.change24h; break;
      case 'near_highs': difference = getCoinDistanceToHigh(a) - getCoinDistanceToHigh(b); break;
      case 'near_lows': difference = getCoinDistanceToLow(a) - getCoinDistanceToLow(b); break;
    }
    return difference || b.volumeUsd - a.volumeUsd || coinMarketKey(a).localeCompare(coinMarketKey(b));
  });
  // The AV 1m preset is a fixed top-10 watch; regular presets retain full
  // ranking for paging. Sorting turnover is equivalent to sorting AV=turnover/1440.
  const ranked = preset === 'av_1m' ? result.slice(0, 10) : result;
  if (limit === Number.POSITIVE_INFINITY) return ranked;
  return ranked.slice(0, Number.isFinite(limit) ? Math.max(0, Math.min(36, Math.floor(limit))) : 0);
}

/**
 * Reuse exactly the list already visible in Formations, including its order and
 * selected formation. No quote fetch or additional pattern scan is allowed here.
 * Terminal market-preset exchange filters intentionally do not override the
 * filters the trader already applied on the Formations page.
 */
export function selectFormationPresetCoins(visible: readonly ScannedCoin[]): TerminalPresetCoin[] {
  const seen = new Set<string>();
  const result: TerminalPresetCoin[] = [];
  for (const coin of visible) {
    if (!coin || !coin.symbol || !coin.baseAsset || !coin.quoteAsset ||
        !['binance', 'bybit'].includes(coin.exchange) ||
        !['spot', 'futures'].includes(coin.marketType) ||
        !Number.isFinite(coin.currentPrice) || coin.currentPrice <= 0) continue;
    const key = coinMarketKey(coin);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      symbol: coin.symbol,
      baseAsset: coin.baseAsset,
      quoteAsset: coin.quoteAsset,
      exchange: coin.exchange,
      marketType: coin.marketType,
      timeframe: coin.timeframe,
      formationId: coin.formations?.[0]?.id,
    });
  }
  return result;
}
