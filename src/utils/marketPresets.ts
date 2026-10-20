import type { MarketCoin, ScreenerPresetFilter } from '../types';
import type { MarketSelection } from './marketCoinLoader';

export type TerminalMarketPreset = Exclude<ScreenerPresetFilter, 'all'>;

export const MARKET_PRESETS: Array<{ id: TerminalMarketPreset; label: string; description: string }> = [
  { id: 'active', label: 'Активні', description: 'Активні монети за волатильністю 5 хв, як у скрінері' },
  { id: 'top_gainers', label: 'Топ ріст 24г', description: 'Найбільше зростання за 24 години' },
  { id: 'top_losers', label: 'Топ спад 24г', description: 'Найбільше падіння за 24 години' },
  { id: 'near_highs', label: 'На хаях', description: 'Монети біля максимуму за 24 години, найближчі першими' },
  { id: 'near_lows', label: 'На лоях', description: 'Монети біля мінімуму за 24 години, найближчі першими' },
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

export function selectMarketPresetCoins(coins: MarketCoin[], preset: TerminalMarketPreset, selection: MarketSelection, limit: number): MarketCoin[] {
  const seen = new Set<string>();
  const result = coins.filter(coin => {
    const key = coinMarketKey(coin);
    if (seen.has(key) || !Number.isFinite(coin.price) || coin.price <= 0 || !Number.isFinite(coin.change24h)) return false;
    if (selection.exchange !== 'all' && selection.exchange !== coin.exchange) return false;
    if (selection.marketType !== 'all' && selection.marketType !== coin.marketType) return false;
    if (!matchesMarketPreset(coin, preset)) return false;
    seen.add(key);
    return true;
  });
  result.sort((a, b) => {
    let difference = 0;
    switch (preset) {
      case 'active': difference = getCoinVol5m(b) - getCoinVol5m(a); break;
      case 'top_gainers': difference = b.change24h - a.change24h; break;
      case 'top_losers': difference = a.change24h - b.change24h; break;
      case 'near_highs': difference = getCoinDistanceToHigh(a) - getCoinDistanceToHigh(b); break;
      case 'near_lows': difference = getCoinDistanceToLow(a) - getCoinDistanceToLow(b); break;
    }
    return difference || b.volumeUsd - a.volumeUsd || coinMarketKey(a).localeCompare(coinMarketKey(b));
  });
  return result.slice(0, Number.isFinite(limit) ? Math.max(0, Math.min(36, Math.floor(limit))) : 0);
}
