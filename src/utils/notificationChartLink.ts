import type { ExchangeId, MarketType, ScannedCoin, Timeframe } from '../types';
import type { SiteNotificationItem } from './siteNotifications';
import type { AppPreferences } from './userPreferences';
import type { ChartPageRoute, ChartPageSnapshot } from './chartPageRoute';

const timeframes = new Set<Timeframe>(['1m','5m','15m','1h','4h','1d']);

/** Use the original exchange/market where known; never confuse same-symbol spot and futures. */
export function notificationChartTarget(
  item: SiteNotificationItem,
  availableCoins: readonly ScannedCoin[],
  preferences: Pick<AppPreferences, 'defaultExchange' | 'defaultMarketType' | 'defaultTimeframe'>,
): { route: ChartPageRoute; snapshot: ChartPageSnapshot } | null {
  const symbol = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) return null;

  const eventExchange: ExchangeId | undefined = item.exchange === 'binance' || item.exchange === 'bybit'
    ? item.exchange : undefined;
  const eventMarket: MarketType | undefined = item.marketType === 'futures' || item.marketType === 'spot'
    ? item.marketType : undefined;
  const preferredExchange = preferences.defaultExchange !== 'all' ? preferences.defaultExchange : undefined;
  const preferredMarket = preferences.defaultMarketType !== 'all' ? preferences.defaultMarketType : undefined;

  const compatible = availableCoins.filter(c => c.symbol?.toUpperCase() === symbol
    && (!eventExchange || c.exchange === eventExchange)
    && (!eventMarket || c.marketType === eventMarket));
  const matching = compatible.find(c =>
    (!eventExchange && preferredExchange ? c.exchange === preferredExchange : true)
    && (!eventMarket && preferredMarket ? c.marketType === preferredMarket : true))
    ?? compatible[0];
  const exchange: ExchangeId = eventExchange ?? matching?.exchange ?? preferredExchange ?? 'binance';
  const marketType: MarketType = eventMarket ?? matching?.marketType ?? preferredMarket ?? 'futures';
  const timeframe: Timeframe = timeframes.has(item.timeframe as Timeframe)
    ? item.timeframe as Timeframe : preferences.defaultTimeframe;

  // The standalone chart must not display an unrelated formation from a previous scan.
  const coin: ScannedCoin = matching
    ? { ...matching, exchange, marketType, timeframe,
        formations: [], bestFormation: undefined, hasFormations: false }
    : {
        symbol,
        baseAsset: symbol.replace(/(USDT|USDC|BUSD|BTC|ETH)$/, ''),
        quoteAsset: symbol.match(/(USDT|USDC|BUSD|BTC|ETH)$/)?.[0] || 'USDT',
        exchange, marketType, timeframe,
        currentPrice: 0, priceChange24h: 0, volume24hUsd: 0,
        highPrice24h: 0, lowPrice24h: 0,
        formations: [], lastUpdated: Date.now(), exchangeUrl: '',
      };
  return {
    route: { exchange, marketType, symbol, timeframe, kind: 'coin' },
    snapshot: { coin },
  };
}

/** Split off only the exact trailing symbol so the coin itself can be a dedicated link. */
export function notificationCoinTitleParts(item: Pick<SiteNotificationItem, 'title' | 'symbol'>) {
  const symbol = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) return { label: item.title, symbol: '' };
  if (item.title.toUpperCase().endsWith(symbol)) {
    return { label: item.title.slice(0, -symbol.length), symbol };
  }
  return { label: item.title + ' · ', symbol };
}
