import { readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CoinGeckoHolderSnapshot } from '../src/types';

// CoinGecko Demo: https://docs.coingecko.com/demo/reference/token-info-contract-address
// No paid /top_holders or historical endpoints. All requests are server-side.
const ROOT = 'https://api.coingecko.com/api/v3';
const HOLDERS_TTL = 12 * 60 * 60_000;
const CATALOG_TTL = 24 * 60 * 60_000;
const NEGATIVE_TTL = 30 * 60_000;
const MAX_CACHE = 1500;
// Native blockchain assets are not ERC20/SPL contracts. Never present
// holders of wrapped BTC/ETH as owners of the native asset.
const NATIVE_COINS: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana',
  BNB: 'BNB Chain', XRP: 'XRP Ledger', DOGE: 'Dogecoin',
  ADA: 'Cardano', LTC: 'Litecoin', BCH: 'Bitcoin Cash',
  DOT: 'Polkadot', XLM: 'Stellar', TRX: 'Tron',
  AVAX: 'Avalanche', ATOM: 'Cosmos', NEAR: 'NEAR',
  TON: 'TON', SUI: 'Sui', APT: 'Aptos',
  HBAR: 'Hedera', ICP: 'Internet Computer',
  ETC: 'Ethereum Classic', XMR: 'Monero', ZEC: 'Zcash',
};
// Mainnet token contract verified in the Chainlink project's own registry.
// Never assume the symbol identifies an asset without an exact contract.
export const VERIFIED_TOKEN_CONTRACTS: Record<string, { network: string; address: string }> = {
  LINK: { network: 'eth', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA' },
};

const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USD', 'BTC', 'ETH', 'EUR', 'TRY'] as const;

// CoinGecko coin-list platform IDs -> GeckoTerminal onchain network IDs.
// Never infer a contract from an exchange symbol alone when multiple projects
// or multiple blockchain contracts are possible.
const PLATFORM_IDS: Record<string, string> = {
  ethereum: 'eth',
  solana: 'solana',
  'binance-smart-chain': 'bsc',
  'polygon-pos': 'polygon_pos',
  'arbitrum-one': 'arbitrum',
  'optimistic-ethereum': 'optimism',
  base: 'base',
  avalanche: 'avax',
  'avalanche-c-chain': 'avax',
  'the-open-network': 'ton',
  sui: 'sui-network',
  ronin: 'ronin',
  linea: 'linea',
};
export type HolderStatus =
  'available' | 'not_configured' | 'native_unsupported' |
  'unmapped' | 'ambiguous' | 'unavailable' | 'rate_limited' | 'upstream_error';


type Contract = { network: string; address: string };
type CatalogEntry = { symbol?: unknown; platforms?: unknown };
type CacheEntry = { expires: number; result: CoinGeckoHolderSnapshot };
type BudgetState = { month: string; count: number };

export function getBaseTicker(symbol: unknown): string | null {
  if (typeof symbol !== 'string') return null;
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,36}$/.test(s)) return null;
  for (const quote of QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length + 1) return s.slice(0, -quote.length);
  }
  return s;
}

export function validateContract(raw: unknown): Contract | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.network !== 'string' || typeof obj.address !== 'string') return null;
  const network = obj.network.trim();
  const address = obj.address.trim();
  if (!Object.values(PLATFORM_IDS).includes(network)) return null;
  // Prevent path injection/SSRF and reject obviously invalid addresses.
  if (network === 'solana') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  } else if (network === 'ton') {
    if (!/^(?:0:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{48})$/.test(address)) return null;
  } else if (network === 'sui-network') {
    if (!/^0x[0-9a-fA-F]{64}$/.test(address)) return null;
  } else if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return null;
  }
  return { network, address };
}

function monthOf(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}

export function parseCoinGeckoHolders(
  raw: unknown, symbol: string, contract: Contract, now: number,
): CoinGeckoHolderSnapshot {
  const payload = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
  const a = payload.data?.attributes;
  const base = getBaseTicker(symbol);
  const tokenSymbol = typeof a?.symbol === 'string' ? a.symbol.trim().toUpperCase() : '';
  const matchingAddress = typeof a?.address === 'string' &&
    (contract.network === 'solana' || contract.network === 'ton'
      ? a.address === contract.address
      : a.address.toLowerCase() === contract.address.toLowerCase());
  const match = base === tokenSymbol && matchingAddress && payload.data?.type === 'token';
  const holder = a?.holders;
  const rawCount = holder?.count;
  const count = typeof rawCount === 'number' && Number.isSafeInteger(rawCount) && rawCount >= 0
    ? rawCount : null;
  const distributions = holder?.distribution_percentage;
  const percentages: Record<string, number> = {};
  if (distributions && typeof distributions === 'object') {
    for (const key of ['top_10', '11_20', '21_40', '11_30', '31_50', 'rest']) {
      const rawPct = distributions[key];
      if ((typeof rawPct === 'string' && rawPct.trim() !== '') || typeof rawPct === 'number') {
        const value = Number(rawPct);
        if (Number.isFinite(value) && value >= 0 && value <= 100) percentages[key] = value;
      }
    }
  }
  const time = typeof holder?.last_updated === 'string' ? Date.parse(holder.last_updated) : NaN;
  const lastUpdated = Number.isFinite(time) && time > 0 && time <= now + 5 * 60_000
    ? new Date(time).toISOString() : null;
  const verified = match && count !== null;
  return {
    source: 'CoinGecko Demo', symbol: base || symbol,
    status: verified ? 'available' : 'unavailable',
    count: verified ? count : null,
    distribution: verified && Object.keys(percentages).length ? percentages : null,
    lastUpdated: verified ? lastUpdated : null,
    network: contract.network, contractAddress: contract.address,
    detail: verified
      ? 'Кількість власників та розподіл за даними CoinGecko (beta). Біржові адреси й контракти можуть належати багатьом людям.'
      : 'CoinGecko не повернув підтверджених даних Holders для цього контракту.',
  };
}

export function createCoinGeckoHoldersService(options: {
  apiKey?: string;
  tokenMap?: Record<string, Contract>;
  fetcher?: typeof fetch;
  now?: () => number;
  storageFile?: string | null;
  maxMonthlyCalls?: number;
} = {}) {
  const key = options.apiKey?.trim() || '';
  const fetcher = options.fetcher || fetch;
  const nowFn = options.now || Date.now;
  const storageFile = options.storageFile || null;
  const monthlyCap = Math.min(9500, Math.max(1, options.maxMonthlyCalls ?? 8000));
  const overrides = new Map<string, Contract>();
  for (const [symbol, raw] of Object.entries({
    ...VERIFIED_TOKEN_CONTRACTS,
    ...(options.tokenMap || {}),
  })) {
    const contract = validateContract(raw);
    if (contract && /^[A-Z0-9]{2,36}$/.test(symbol.toUpperCase())) {
      overrides.set(symbol.toUpperCase(), contract);
    }
  }
  const cached = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<CoinGeckoHolderSnapshot>>();
  let catalog: Map<string, { match: Contract | null; ambiguous: boolean }> | null = null;
  let catalogUntil = 0;
  let catalogTask: Promise<typeof catalog> | null = null;
  let blockedUntil = 0;
  const recentRequests: number[] = [];

  let budget: BudgetState = { month: monthOf(nowFn()), count: 0 };
  if (storageFile) {
    try {
      const onDisk = JSON.parse(readFileSync(storageFile, 'utf8')) as BudgetState;
      if (onDisk.month === budget.month && Number.isSafeInteger(onDisk.count) && onDisk.count >= 0) {
        budget = { month: onDisk.month, count: onDisk.count };
      }
    } catch { /* No state file yet. */ }
  }
  const saveBudget = () => {
    if (!storageFile) return;
    try {
      mkdirSync(dirname(storageFile), { recursive: true });
      const tmp = storageFile + '.tmp';
      writeFileSync(tmp, JSON.stringify(budget), { mode: 0o600 });
      renameSync(tmp, storageFile);
    } catch { /* Fails closed on next restart only; outgoing cap still applies per process. */ }
  };
  const reserve = (): boolean => {
    const now = nowFn();
    const month = monthOf(now);
    if (budget.month !== month) budget = { month, count: 0 };
    // More restrictive than Demo's 100/min; protects the free allocation.
    while (recentRequests.length && recentRequests[0] <= now - 60_000) recentRequests.shift();
    if (now < blockedUntil || budget.count >= monthlyCap || recentRequests.length >= 5) return false;
    recentRequests.push(now);
    budget.count += 1; // Failed HTTP calls consume credits too.
    saveBudget();
    return true;
  };
  const getJson = async (path: string): Promise<unknown> => {
    if (!reserve()) throw new Error('COINGECKO_BUDGET');
    let response: Response;
    try {
      response = await fetcher(ROOT + path, {
        headers: { accept: 'application/json', 'x-cg-demo-api-key': key },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new Error('COINGECKO_NETWORK');
    }
    if (response.status === 429) {
      blockedUntil = nowFn() + 15 * 60_000;
      throw new Error('COINGECKO_RATE_LIMIT');
    }
    if (!response.ok) throw new Error('COINGECKO_HTTP_' + response.status);
    return response.json();
  };
  const fetchCatalog = async () => {
    if (catalog && nowFn() < catalogUntil) return catalog;
    if (catalogTask) return catalogTask;
    catalogTask = (async () => {
      const result = await getJson('/coins/list?include_platform=true');
      if (!Array.isArray(result)) throw new Error('COINGECKO_CATALOG_INVALID');
      const mapped = new Map<string, { match: Contract | null; ambiguous: boolean }>();
      for (const row of result as CatalogEntry[]) {
        if (!row || typeof row.symbol !== 'string') continue;
        const symbol = row.symbol.toUpperCase();
        if (!/^[A-Z0-9]{2,36}$/.test(symbol)) continue;
        const previous = mapped.get(symbol);
        if (previous) {
          // A duplicate ticker may be a different token. Never guess.
          previous.match = null;
          previous.ambiguous = true;
          continue;
        }
        const platforms = row.platforms && typeof row.platforms === 'object'
          ? row.platforms as Record<string, unknown> : {};
        const locations = Object.entries(platforms)
          .map(([platform, address]) => validateContract({
            network: PLATFORM_IDS[platform], address,
          })).filter((value): value is Contract => value !== null);
        mapped.set(symbol, {
          match: locations.length === 1 ? locations[0] : null,
          ambiguous: locations.length > 1,
        });
      }
      catalog = mapped;
      catalogUntil = nowFn() + CATALOG_TTL;
      return catalog;
    })().finally(() => { catalogTask = null; });
    return catalogTask;
  };

  const unavailable = (symbol: string, status: HolderStatus, detail: string,
    contract: Contract | null = null): CoinGeckoHolderSnapshot => ({
    source: 'CoinGecko Demo', symbol, status, count: null, distribution: null,
    lastUpdated: null, network: contract?.network || null,
    contractAddress: contract?.address || null, detail,
  });
  const get = async (rawSymbol: unknown): Promise<CoinGeckoHolderSnapshot> => {
    const symbol = getBaseTicker(rawSymbol);
    if (!symbol) return unavailable('', 'unmapped', 'Некоректний символ монети.');
    if (NATIVE_COINS[symbol]) return unavailable(symbol, 'native_unsupported',
      symbol + ' — нативна монета мережі ' + NATIVE_COINS[symbol] +
      '. CoinGecko Demo Token Info показує власників контрактних токенів, ' +
      'а не загальну кількість власників нативної монети. Дані н/д, не помилка API.');
    if (!key) return unavailable(symbol, 'not_configured',
      'Для Holders потрібен безкоштовний COINGECKO_DEMO_API_KEY на сервері.');
    const hit = cached.get(symbol);
    if (hit && hit.expires > nowFn()) return hit.result;
    if (inflight.has(symbol)) return inflight.get(symbol)!;
    const task = (async () => {
      let result: CoinGeckoHolderSnapshot;
      let ttl = NEGATIVE_TTL;
      let location = overrides.get(symbol) || null;
      try {
        if (!location) {
          const entries = await fetchCatalog();
          const entry = entries?.get(symbol);
          if (!entry?.match) {
            result = unavailable(symbol, entry?.ambiguous ? 'ambiguous' : 'unmapped',
              entry?.ambiguous
                ? 'Неоднозначний символ або декілька мереж. Потрібна перевірена адреса контракту.'
                : 'Немає однозначного ончейн-контракту CoinGecko для цього символу.');
            ttl = CATALOG_TTL;
          } else {
            location = entry.match;
            result = unavailable(symbol, 'unavailable', 'Holders ще не завантажені.', location);
          }
        } else {
          result = unavailable(symbol, 'unavailable', 'Holders ще не завантажені.', location);
        }
        if (location) {
          const raw = await getJson('/onchain/networks/' + encodeURIComponent(location.network) +
            '/tokens/' + encodeURIComponent(location.address) + '/info');
          result = parseCoinGeckoHolders(raw, symbol, location, nowFn());
          ttl = result.status === 'available' ? HOLDERS_TTL : NEGATIVE_TTL;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const limited = message.includes('BUDGET') || message.includes('RATE_LIMIT');
        result = unavailable(symbol, limited ? 'rate_limited' : 'upstream_error',
          limited ? 'Досягнуто безкоштовного ліміту CoinGecko або тимчасове обмеження запитів.'
            : 'CoinGecko зараз не повертає даних; підставні значення не використовуються.',
          location);
        ttl = limited ? 10 * 60_000 : NEGATIVE_TTL;
        if (!catalog) catalogUntil = nowFn() + NEGATIVE_TTL;
      }
      // Shared cache for all users, markets and timeframes.
      cached.set(symbol, { result, expires: nowFn() + ttl });
      if (cached.size > MAX_CACHE) cached.delete(cached.keys().next().value!);
      return result;
    })().finally(() => { inflight.delete(symbol); });
    inflight.set(symbol, task);
    return task;
  };
  return { get };
}

function readTokenMap(): Record<string, Contract> {
  try {
    const obj = JSON.parse(process.env.COINGECKO_HOLDERS_TOKEN_MAP || '{}');
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch { return {}; }
}
const configuredBudget = Number(process.env.COINGECKO_HOLDERS_MONTHLY_BUDGET);
export const coingeckoHolders = createCoinGeckoHoldersService({
  apiKey: process.env.COINGECKO_DEMO_API_KEY,
  tokenMap: readTokenMap(),
  maxMonthlyCalls: Number.isSafeInteger(configuredBudget) && configuredBudget > 0
    ? configuredBudget : 8000,
  storageFile: resolve('server/data/coingecko-holders-budget.json'),
});
