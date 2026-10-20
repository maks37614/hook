/** Explicit public-data allowlists shared by the browser relay and server. */
export type ExchangeProvider = 'binance' | 'bybit';
const binanceHosts = new Set(['api.binance.com', 'api-gcp.binance.com', 'api1.binance.com', 'api2.binance.com', 'api3.binance.com', 'api4.binance.com', 'data-api.binance.vision', 'fapi.binance.com', 'testnet.binance.vision', 'testnet.binancefuture.com']);
const bybitHosts = new Set(['api.bybit.com', 'api.bytick.com', 'api.bybick.com', 'api.bybit.nl', 'api-testnet.bybit.com']);
export function exchangeProvider(url: URL): ExchangeProvider | undefined {
  return binanceHosts.has(url.hostname) ? 'binance' : bybitHosts.has(url.hostname) ? 'bybit' : undefined;
}
const spot = new Set(['klines', 'uiKlines', 'depth', 'ticker', 'ticker/24hr', 'ticker/price', 'ticker/bookTicker', 'exchangeInfo', 'aggTrades', 'trades', 'time']);
const futures = new Set(['klines', 'depth', 'ticker/24hr', 'ticker/price', 'ticker/bookTicker', 'exchangeInfo', 'aggTrades', 'trades', 'openInterest', 'premiumIndex', 'fundingRate', 'time']);
const stats = new Set(['openInterestHist', 'topLongShortAccountRatio', 'topLongShortPositionRatio', 'globalLongShortAccountRatio', 'takerlongshortRatio']);
const bybit = new Set(['kline', 'orderbook', 'recent-trade', 'instruments-info', 'tickers', 'open-interest', 'funding/history', 'account-ratio', 'time']);
export function publicMarketUrl(input: string | URL): URL | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.search.length > 5000) return null;
  const provider = exchangeProvider(url);
  if (!provider || /testnet/.test(url.hostname)) return null;
  if ([...url.searchParams.keys()].some(key => /signature|timestamp|api.?key|secret|listenkey/i.test(key))) return null;
  const allowed = provider === 'bybit' ? url.pathname.startsWith('/v5/market/') && bybit.has(url.pathname.slice(11))
    : url.pathname.startsWith('/api/v3/') && spot.has(url.pathname.slice(8))
      || url.pathname.startsWith('/fapi/v1/') && futures.has(url.pathname.slice(9))
      || url.pathname.startsWith('/futures/data/') && stats.has(url.pathname.slice(14));
  if (!allowed) return null;
  // Regional and alternative names are not independent quota pools.
  url.hostname = provider === 'bybit' ? 'api.bybit.com' : url.pathname.startsWith('/api/') ? 'api.binance.com' : 'fapi.binance.com';
  if (url.searchParams.has('limit')) {
    const value = Number(url.searchParams.get('limit'));
    if (!Number.isInteger(value) || value < 1 || value > 1000) return null;
    if (provider === 'bybit' && url.searchParams.get('category') === 'spot') {
      const maximum = url.pathname.endsWith('/recent-trade') ? 60 : url.pathname.endsWith('/orderbook') ? 200 : 1000;
      url.searchParams.set('limit', String(Math.min(value, maximum)));
    }
  }
  url.searchParams.sort();
  return url;
}

export function publicStreamUrl(input: string): URL | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== 'wss:' || url.username || url.password || url.hash || (url.port && url.port !== '9443')) return null;
  if (url.hostname === 'stream.bybit.com' && /^\/v5\/public\/(spot|linear)$/.test(url.pathname) && !url.search) return url;
  if (!['stream.binance.com', 'fstream.binance.com', 'fstream.binancefuture.com'].includes(url.hostname)) return null;
  const path = url.pathname.replace(/^\/(public|market)(?=\/)/, '');
  let streams: string[];
  try { streams = path.startsWith('/ws/') ? [decodeURIComponent(path.slice(4))]
    : path === '/stream' && [...url.searchParams.keys()].every(key => key === 'streams') ? (url.searchParams.get('streams') || '').split('/') : []; }
  catch { return null; }
  if (!streams.length || streams.length > 8 || streams.some(stream => !/^[\p{L}\p{M}\p{N}]{2,64}@(aggTrade|trade|depth(?:\d+)?(?:@100ms)?|kline_[0-9]+[mhdwM]|forceOrder|markPrice(?:@1s)?|bookTicker|miniTicker|ticker)$/u.test(stream))) return null;
  if (url.hostname === 'fstream.binance.com' && !/^\/(public|market)\//.test(url.pathname)) {
    const depth = streams.every(stream => stream.includes('@depth'));
    if (!depth && streams.some(stream => stream.includes('@depth'))) return null;
    url.pathname = (depth ? '/public' : '/market') + path;
  }
  return url;
}

export function validBybitTopic(topic: unknown): topic is string {
  return typeof topic === 'string' && /^(tickers|publicTrade|orderbook\.(1|50|200|500|1000)|kline\.(1|3|5|15|30|60|120|240|360|720|D|W|M)|allLiquidation|liquidation)\.[\p{L}\p{M}\p{N}]{2,64}$/u.test(topic);
}
