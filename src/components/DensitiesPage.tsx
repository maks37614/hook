import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Search, RefreshCw, SlidersHorizontal, Plus, Trash2, X, ExternalLink, AlertCircle, Clock3, Info, Layers, Save } from 'lucide-react';
import type { ExchangeId, MarketType } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatCryptoPrice } from '../utils/formatters';

type Category = 'all' | 'crypto' | 'stocks' | 'custom';
type QuoteAsset = 'all' | 'USDT' | 'USDC';
type Side = 'bid' | 'ask';
interface Level {
  side: Side; price: number; quantity: number; notionalUsd: number; distancePct: number;
  strength: number; isWall: boolean; firstSeenAt?: number; lastSeenAt?: number;
  observations?: number; exchangeAppearedAt?: number;
}
interface DensityCoin {
  symbol: string; baseAsset: string; exchange: ExchangeId; marketType: MarketType;
  exchangeUrl: string; category: 'crypto' | 'stocks'; currentPrice: number;
  change24h: number; volume24hUsd: number; spreadPct: number; timestamp: number;
  walls: Level[]; bids: Level[]; asks: Level[];
}
interface Result {
  success: boolean; timestamp: number; totalCandidates: number; scanned: number;
  received: number; failed: number; matched: number; data: DensityCoin[]; error?: string;
  offset: number; nextOffset: number; hasMore: boolean;
  byExchange?: { binance: number; bybit: number };
}
interface CoinList { id: string; name: string; symbols: string[]; }
type Settings = {
  minNotionalUsd: number; minVolumeUsd: number; strengthMultiplier: number;
  maxDistancePct: number; bucketPct: number; limit: number; side: 'both' | Side;
};
const defaults: Settings = {
  minNotionalUsd: 100000, minVolumeUsd: 0, strengthMultiplier: 1.8,
  maxDistancePct: 2, bucketPct: 0.1, limit: 24, side: 'both',
};
const inputClass = 'density-input';
const categories: { value: Category; label: string }[] = [
  { value: 'all', label: 'Усі' }, { value: 'crypto', label: 'Крипта' },
  { value: 'stocks', label: 'Стокові монети' }, { value: 'custom', label: 'Мої списки' },
];
function money(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
  return '$' + n.toFixed(0);
}
function amount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n >= 1 ? n.toFixed(2) : n.toPrecision(3);
}
function parseSymbols(value: string, quoteAsset: QuoteAsset): string[] {
  const pairs = value.toUpperCase().split(/[\s,;]+/)
    .map(s => s.replace(/[^A-Z0-9]/g, '')).filter(s => s.length >= 2)
    .flatMap(s => /(?:USDT|USDC|USD1)$/.test(s)
      ? [s]
      : quoteAsset === 'all' ? [s + 'USDT', s + 'USDC'] : [s + quoteAsset]);
  return [...new Set(pairs)].slice(0, 40);
}
function savedLists(key: string): CoinList[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((v): v is CoinList => v && typeof v.id === 'string' &&
      typeof v.name === 'string' && Array.isArray(v.symbols))
      .slice(0, 25).map(v => ({ id: v.id, name: v.name.slice(0, 40),
        symbols: v.symbols.filter((s): s is string => typeof s === 'string' &&
          /^[A-Z0-9]{2,30}$/.test(s)).slice(0, 40) }));
  } catch { return []; }
}
function formatObservedTime(first?: number, now?: number) {
  if (!first || !now || now < first) return 'щойно';
  const seconds = Math.floor((now - first) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return hours ? `${hours} год ${minutes} хв` : minutes ? `${minutes} хв ${remainder} с` : `${remainder} с`;
}
function BookLevel({ level, max, now, midPrice }: { level: Level; max: number; now: number; midPrice: number }) {
  const bid = level.side === 'bid';
  const [detailsOpen, setDetailsOpen] = useState(false);
  const distance = midPrice > 0 ? ((level.price - midPrice) / midPrice) * 100 : 0;
  const distanceLabel = (distance > 0 ? '+' : '') + distance.toFixed(2) + '%';
  const sideLabel = bid ? 'BID · Купівля' : 'ASK · Продаж';
  const tooltipLabel = 'Час і відстань щільності ' + formatCryptoPrice(level.price);
  const isStale = !!level.lastSeenAt && now - level.lastSeenAt > 90_000;

  const numbers = (
    <>
      <div className={'pointer-events-none absolute inset-y-0 ' + (bid ? 'right-0 bg-emerald-500/20' : 'left-0 bg-rose-500/20')}
        style={{ width: Math.min(100, Math.max(3, level.notionalUsd / Math.max(max, 1) * 100)) + '%' }} />
      <div className="relative grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1fr)] items-center gap-1">
        <span className={'min-w-0 truncate font-bold ' + (bid ? 'text-emerald-300' : 'text-rose-300')}>
          {formatCryptoPrice(level.price)}
        </span>
        <span className="min-w-0 truncate text-right text-slate-300">{amount(level.quantity)}</span>
        <span className={'min-w-0 truncate text-right font-semibold ' +
          (level.isWall ? (bid ? 'text-emerald-300' : 'text-rose-300') : 'text-slate-200')}>
          {money(level.notionalUsd)}{level.isWall ? ' ●' : ''}
        </span>
      </div>
    </>
  );

  if (!level.isWall) {
    return (
      <div title={sideLabel + ' · ' + formatCryptoPrice(level.price) + ' · ' + money(level.notionalUsd)}
        className="density-level relative min-w-0 rounded px-2 py-1.5 font-mono text-[11px] sm:text-xs">
        {numbers}
      </div>
    );
  }

  return (
    <button type="button" aria-label={tooltipLabel} aria-expanded={detailsOpen}
      onClick={() => setDetailsOpen(open => !open)}
      onBlur={() => setDetailsOpen(false)}
      className={'density-level density-level-wall group relative block w-full min-w-0 rounded px-2 py-1.5 text-left font-mono text-[11px] transition-colors sm:text-xs ' +
        'hover:z-30 focus:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ' +
        (bid ? 'ring-1 ring-emerald-500/45 hover:bg-emerald-500/10' : 'ring-1 ring-rose-500/45 hover:bg-rose-500/10')}>
      {numbers}
      <div role="tooltip" className={
        'density-level-tooltip pointer-events-none absolute left-0 z-50 w-full min-w-0 rounded-xl border border-cyan-500/30 ' +
        (bid ? 'bottom-full mb-1 ' : 'top-full mt-1 ') +
        'bg-[#101c30] p-3 text-left text-[11px] font-normal text-slate-200 shadow-2xl shadow-black/70 ' +
        'transition-opacity duration-150 ' +
        (detailsOpen
          ? 'visible opacity-100'
          : 'invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100')
      }>
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-700/80 pb-2">
          <span className={'font-bold ' + (bid ? 'text-emerald-300' : 'text-rose-300')}>
            {sideLabel}
          </span>
          <span className="font-mono text-slate-300">{formatCryptoPrice(level.price)}</span>
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
          <span className="text-slate-400">⏱ Поява в потоці біржі</span>
          <span className={'text-right font-mono font-bold ' +
            (level.exchangeAppearedAt ? 'text-cyan-300' : 'text-amber-300')}>
            {level.exchangeAppearedAt
              ? formatObservedTime(level.exchangeAppearedAt, now) + ' тому'
              : 'Час невідомий'}
          </span>
          {level.exchangeAppearedAt && (
            <>
              <span className="text-slate-400">Час біржового оновлення</span>
              <span className="text-right font-mono text-cyan-200">
                {new Date(level.exchangeAppearedAt).toLocaleString('uk-UA', {
                  day: '2-digit', month: '2-digit', hour: '2-digit',
                  minute: '2-digit', second: '2-digit',
                })}
              </span>
            </>
          )}
          <span className="text-slate-400">Виявлено SignalHook</span>
          <span className="text-right font-mono text-slate-300">
            {formatObservedTime(level.firstSeenAt, now)} тому
          </span>
          <span className="text-slate-400">Відстань до ціни</span>
          <span className={'text-right font-mono font-bold ' + (bid ? 'text-emerald-300' : 'text-rose-300')}>
            {distanceLabel}
          </span>
          <span className="text-slate-400">Обсяг щільності</span>
          <span className="text-right font-mono font-semibold text-white">{money(level.notionalUsd)}</span>
          <span className="text-slate-400">Підтверджень</span>
          <span className="text-right font-mono text-slate-200">{level.observations || 1}</span>
          <span className="text-slate-400">Остання перевірка</span>
          <span className={'text-right font-mono ' + (isStale ? 'text-amber-300' : 'text-slate-200')}>
            {formatObservedTime(level.lastSeenAt, now)} тому
          </span>
        </div>
        <p className="mt-2 border-t border-slate-700/70 pt-2 text-[10px] leading-4 text-slate-500">
          {level.exchangeAppearedAt
            ? 'Час підтверджено подією зміни рівня стакана Binance/Bybit. Це не дата створення окремого ордера.'
            : 'Біржа не віддає дату створення раніше розміщених заявок. Час появи без попередніх біржових подій визначити неможливо.'}
          {isStale ? ' Поточну наявність рівня ще не підтверджено.' : ''}
        </p>
      </div>
    </button>
  );
}
function DensityCard({ item, now }: { item: DensityCoin; now: number }) {
  const strongest = item.walls[0];
  const biggest = Math.max(1, ...item.asks.map(v => v.notionalUsd), ...item.bids.map(v => v.notionalUsd));
  return (
    <article className={'density-card ' + (strongest.side === 'bid' ? 'density-card-bid' : 'density-card-ask')}>
      <div className="density-card-header flex flex-wrap items-start justify-between gap-2 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="density-card-symbol font-mono text-base font-extrabold text-white">{item.baseAsset}</span>
            <span className="text-xs text-slate-500">/ {item.symbol.endsWith('USDC') ? 'USDC' : 'USDT'}</span>
            <span className={'density-exchange ' + item.exchange}>{item.exchange}</span>
            <span className="density-market">{item.marketType === 'futures' ? 'Ф’ючерси' : 'Спот'}</span>
            {item.category === 'stocks' && <span className="rounded border border-indigo-500/30 px-1.5 py-0.5 text-[10px] text-indigo-300">STOCK</span>}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            <span className="font-mono text-white">{'$'}{formatCryptoPrice(item.currentPrice)}</span>
            <span className={'ml-2 ' + (item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{item.change24h > 0 ? '+' : ''}{item.change24h.toFixed(2)}%</span>
            <span className="ml-2 text-slate-500">24h {money(item.volume24hUsd)}</span>
          </p>
        </div>
        <a href={item.exchangeUrl} target="_blank" rel="noopener noreferrer"
          className="density-exchange-link inline-flex shrink-0 items-center gap-1">
          Біржа <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="density-card-summary px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-slate-300">{strongest.side === 'bid' ? '🟢 Щільність покупців' : '🔴 Щільність продавців'}</span>
          <span className="font-mono font-bold text-cyan-300">{money(strongest.notionalUsd)} · {strongest.strength.toFixed(1)}×</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
          <span>Рівень <span className="font-mono text-white">{'$'}{formatCryptoPrice(strongest.price)}</span></span>
          <span>Щільностей: {item.walls.length}</span>
        </div>
      </div>
      <div className="p-2 sm:p-3">
        <div className="mb-1 grid grid-cols-[minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1fr)] gap-1 px-2 text-[10px] uppercase tracking-wide text-slate-500">
          <span>Ціна</span><span className="text-right">Кількість</span><span className="text-right">Обсяг USD</span>
        </div>
        <div className="space-y-0.5">
          {[...item.asks].reverse().map(level => <BookLevel key={'a-' + level.price} level={level} max={biggest} now={now} midPrice={item.currentPrice} />)}
          <div className="density-mid my-1 flex flex-wrap items-center justify-between gap-1 px-2 py-2 font-mono text-[11px]">
            <span className="text-slate-400">MID / Спред</span>
            <span className="font-bold text-cyan-300">{'$'}{formatCryptoPrice(item.currentPrice)} <span className="text-slate-500">· {item.spreadPct.toFixed(3)}%</span></span>
          </div>
          {item.bids.map(level => <BookLevel key={'b-' + level.price} level={level} max={biggest} now={now} midPrice={item.currentPrice} />)}
        </div>
        <div className="density-card-footer mt-2 flex flex-wrap justify-between gap-2 pt-2 text-[10px] text-slate-500">
          <span><span className="text-rose-400">●</span> ASK: продаж <span className="ml-2 text-emerald-400">●</span> BID: купівля</span>
          <span>Знімок {new Date(item.timestamp).toLocaleTimeString('uk-UA')}</span>
        </div>
      </div>
    </article>
  );
}

export const DensitiesPage: React.FC = () => {
  const { user } = useAuth();
  const storageKey = 'signalhook_density_lists_' + (user?.uid || 'guest');
  const [lists, setLists] = useState<CoinList[]>(() => savedLists(storageKey));
  const [listId, setListId] = useState('');
  const [newName, setNewName] = useState('');
  const [symbolsInput, setSymbolsInput] = useState('');
  const [listHint, setListHint] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [exchange, setExchange] = useState<'all' | ExchangeId>('all');
  const [marketType, setMarketType] = useState<'all' | MarketType>('all');
  const [quoteAsset, setQuoteAsset] = useState<QuoteAsset>('all');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<Settings>(defaults);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [shownCount, setShownCount] = useState(40);
  const [now, setNow] = useState(() => Date.now());
  const watchControllerRef = useRef<AbortController | null>(null);
  const watchRunningRef = useRef(false);
  const watchCursorRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<Result | null>(null);
  const runningRef = useRef(false);
  const scanRef = useRef<(mode?: 'first' | 'next' | 'all') => Promise<void>>(async () => {});

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(lists)); } catch { /* browser may disable storage */ }
  }, [storageKey, lists]);
  const selected = lists.find(l => l.id === listId) || lists[0];

  // Each HTTP request scans at most 24 symbols. Full-exchange mode continues
  // through all pages, preserving partial results and letting users cancel.
  const scan = useCallback(async (mode: 'first' | 'next' | 'all' = 'all') => {
    const listSymbols = (lists.find(l => l.id === listId) || lists[0])?.symbols || [];
    // Cancel any earlier full scan even when the new custom list is empty.
    controllerRef.current?.abort();
    watchControllerRef.current?.abort();
    if (category === 'custom' && listSymbols.length === 0) {
      runningRef.current = false;
      resultRef.current = null;
      setResult(null);
      setLoading(false);
      setScanningAll(false);
      setError('Створіть свій список і додайте монети для пошуку.');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    runningRef.current = true;
    setLoading(true);
    setScanningAll(mode === 'all');
    setError('');
    if (mode !== 'next') {
      setResult(null);
      resultRef.current = null;
      setShownCount(40);
    }

    let accumulated = mode === 'next' ? resultRef.current : null;
    let offset = mode === 'next' ? (accumulated?.nextOffset || 0) : 0;
    const params = new URLSearchParams({
      category, exchange, marketType, quoteAsset,
      search: search.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      symbols: category === 'custom' ? listSymbols.join(',') : '',
      side: settings.side,
      minNotionalUsd: String(settings.minNotionalUsd),
      minVolumeUsd: String(settings.minVolumeUsd),
      strengthMultiplier: String(settings.strengthMultiplier),
      maxDistancePct: String(settings.maxDistancePct),
      bucketPct: String(settings.bucketPct),
      limit: String(settings.limit),
    });

    try {
      while (!controller.signal.aborted) {
        params.set('offset', String(offset));
        const response = await fetch('/api/densities/scan?' + params.toString(), {
          signal: controller.signal, cache: 'no-store',
        });
        const json: Result = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || 'Не вдалося завантажити щільності');
        if (controller.signal.aborted) break;

        const unique = new Map<string, DensityCoin>();
        // Include any more recent wall rechecks before merging the next scan page.
        // Otherwise a full scan can overwrite refreshed lifetimes with old ones.
        for (const item of resultRef.current?.data || accumulated?.data || [])
          unique.set(item.exchange + ':' + item.marketType + ':' + item.symbol, item);
        for (const item of json.data) unique.set(item.exchange + ':' + item.marketType + ':' + item.symbol, item);
        const allResults = [...unique.values()].sort((a, b) =>
          (b.walls[0]?.notionalUsd || 0) - (a.walls[0]?.notionalUsd || 0));
        const merged: Result = {
          ...json,
          data: allResults,
          scanned: (accumulated?.scanned || 0) + json.scanned,
          received: (accumulated?.received || 0) + json.received,
          failed: (accumulated?.failed || 0) + json.failed,
          matched: allResults.length,
          error: accumulated?.error || json.error,
        };
        accumulated = merged;
        resultRef.current = merged;
        setResult(merged);

        if (mode !== 'all' || !json.hasMore || json.nextOffset <= offset) break;
        offset = json.nextOffset;
        // Avoid a burst of thousands of requests on the exchange rate limits.
        await new Promise<void>(resolve => setTimeout(resolve, 700));
      }
      // Failures of individual exchange snapshots do not terminate the full
      // sweep, but report an actual outage if none of the books could be read.
      if (!controller.signal.aborted && accumulated && accumulated.received === 0 && accumulated.failed > 0) {
        setError(accumulated.error || 'Не вдалося отримати жодного стакана. Перевірте доступність Binance та Bybit.');
      }
    } catch (e: unknown) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Помилка завантаження стаканів');
      }
    } finally {
      if (controllerRef.current === controller) {
        runningRef.current = false;
        setLoading(false);
        setScanningAll(false);
      }
    }
  }, [lists, listId, category, exchange, marketType, quoteAsset, search, settings]);

  scanRef.current = scan;
  useEffect(() => {
    // Opening the Densities page immediately starts scanning the ENTIRE
    // current exchange universe, one bounded batch at a time.
    void scanRef.current('all');
    return () => controllerRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!intervalSeconds) return;
    const id = window.setInterval(() => {
      // Never overwrite accumulated full-market results during auto-refresh.
      if (!document.hidden && !runningRef.current &&
          (resultRef.current?.scanned || 0) <= settings.limit) {
        void scanRef.current('first');
      }
    }, intervalSeconds * 1000);
    return () => window.clearInterval(id);
  }, [intervalSeconds, settings.limit]);

  // Refresh elapsed-time labels while the page is in the foreground.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Revisit the displayed walls even while the full market sweep is running.
  // Eight live orderbooks per 30 seconds avoid excessive API load; a vanished
  // wall is removed, and unavailable books remain but show a stale check time.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const current = resultRef.current;
      if (document.hidden || watchRunningRef.current || !current?.data.length) return;
      const visible = current.data.slice(0, shownCount);
      const size = Math.min(8, visible.length);
      if (size === 0) return;
      const start = watchCursorRef.current % visible.length;
      const selected = Array.from({ length: size }, (_, i) => visible[(start + i) % visible.length]);
      watchCursorRef.current = (start + size) % visible.length;
      const ids = selected.map(item => [item.exchange, item.marketType, item.symbol].join(':'));
      const controller = new AbortController();
      watchControllerRef.current?.abort();
      watchControllerRef.current = controller;
      watchRunningRef.current = true;
      const symbols = (lists.find(l => l.id === listId) || lists[0])?.symbols || [];
      const params = new URLSearchParams({
        category, exchange, marketType, quoteAsset,
        search: search.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
        symbols: category === 'custom' ? symbols.join(',') : '',
        side: settings.side,
        minNotionalUsd: String(settings.minNotionalUsd),
        minVolumeUsd: String(settings.minVolumeUsd),
        strengthMultiplier: String(settings.strengthMultiplier),
        maxDistancePct: String(settings.maxDistancePct),
        bucketPct: String(settings.bucketPct),
        limit: String(settings.limit),
        watch: ids.join(','),
      });
      try {
        const response = await fetch('/api/densities/scan?' + params, {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const refreshed: { data: DensityCoin[]; unavailable: string[] } = await response.json();
        if (controller.signal.aborted) return;
        const previous = resultRef.current;
        if (!previous) return;
        const updatedIds = new Set(refreshed.data.map(item => [item.exchange, item.marketType, item.symbol].join(':')));
        const newRows = new Map(refreshed.data.map(item => [
          [item.exchange, item.marketType, item.symbol].join(':'), item,
        ]));
        const updated = previous.data.flatMap(item => {
          const id = [item.exchange, item.marketType, item.symbol].join(':');
          if (!updatedIds.has(id)) return [item]; // unavailable: keep last snapshot, marked stale
          const fresh = newRows.get(id)!;
          return fresh.walls.length ? [fresh] : []; // disappeared / no longer qualifies
        }).sort((a, b) => (b.walls[0]?.notionalUsd || 0) - (a.walls[0]?.notionalUsd || 0));
        const next = { ...previous, data: updated, matched: updated.length };
        resultRef.current = next;
        setResult(next);
      } catch {
        // A temporary watch failure must never terminate the full market scan.
      } finally {
        if (watchControllerRef.current === controller) watchRunningRef.current = false;
      }
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      watchControllerRef.current?.abort();
      watchRunningRef.current = false;
    };
  }, [category, exchange, marketType, quoteAsset, search, settings, lists, listId, shownCount]);

  const firstFilterRender = useRef(true);
  useEffect(() => {
    if (firstFilterRender.current) { firstFilterRender.current = false; return; }
    // Changing a venue, category or custom list starts a fresh full scan.
    void scanRef.current('all');
  }, [category, exchange, marketType, quoteAsset, listId]);

  const stopScan = () => {
    controllerRef.current?.abort();
    runningRef.current = false;
    setLoading(false);
    setScanningAll(false);
  };

  const createList = () => {
    const name = newName.trim().slice(0, 40);
    if (!name) { setListHint('Введіть назву списку.'); return; }
    if (lists.length >= 25) { setListHint('Максимум 25 списків.'); return; }
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    setLists(prev => [...prev, { id, name, symbols: [] }]);
    setListId(id); setNewName(''); setListHint('Список створено. Додайте монети.');
  };
  const addSymbols = () => {
    if (!selected) { setListHint('Спочатку створіть список.'); return; }
    const symbols = parseSymbols(symbolsInput, quoteAsset);
    if (!symbols.length) { setListHint('Введіть символи, наприклад BTC, SOL, AAPLX.'); return; }
    setLists(prev => prev.map(l => l.id === selected.id ? { ...l, symbols: [...new Set([...l.symbols, ...symbols])].slice(0, 40) } : l));
    setSymbolsInput(''); setListHint('Монети додано — натисніть «Знайти щільності».');
  };
  const choice = (isActive: boolean) => 'density-filter' + (isActive ? ' active' : '');

  return (
    <section className="densities-page mx-auto w-full max-w-[1650px] pb-10">
      <header>
        <div className="density-page-heading">
          <div className="density-title">
            <div className="density-logo"><BookOpen size={24} /></div>
            <div>
              <div className="density-eyebrow">BINANCE + BYBIT / SPOT & FUTURES</div>
              <h1>Щільності <span>стакана</span></h1>
            </div>
          </div>
          <div className="density-heading-actions">
            {loading ? (
              <button type="button" onClick={stopScan}
                className="density-stop">
                Зупинити сканування
              </button>
            ) : (
              <>
                <button type="button" onClick={() => void scan('first')}
                  className="density-refresh">
                  Оновити першу порцію
                </button>
                <button type="button" onClick={() => void scan('all')}
                  className="density-scan">
                  <RefreshCw className="h-4 w-4" /> Повторити повне сканування
                </button>
              </>
            )}
          </div>
        </div>
        <p className="density-subtitle">Пошук великих лімітних заявок у стаканах Binance і Bybit</p>
        <div className="density-stats">
          {([
            ['Перевірено стаканів', result ? (result.scanned + ' / ' + result.totalCandidates) : '—'],
            ['Монет зі щільністю', result?.matched ?? '—'],
            ['Пари Binance + Bybit', result?.totalCandidates ?? '—'],
            ['Оновлено', result ? new Date(result.timestamp).toLocaleTimeString('uk-UA') : '—'],
          ] as const).map(([label, value], index) => <div key={label} className="density-stat">
            <p className="density-stat-label">{label}</p>
            <p className={'density-stat-value' + (index === 1 ? ' highlight' : '')}>{value}</p>
          </div>)}
        </div>
        <p className="density-method-note">
          Доступні торгові пари Binance та Bybit з котируванням USDT або USDC, включно зі спотом і ф’ючерсами.
          Повний пошук запускається автоматично при відкритті сторінки та проходить увесь перелік порціями; це може зайняти тривалий час.
          Щоб автосканування не призупинилось на телефоні, залишайте сторінку відкритою й активною.
          Пари недоступної біржі не враховуються, доки її API не відповідає.
        </p>
        {result?.byExchange && (
          <div className="density-venues">
            <span className="density-exchange binance">
              Binance: {result.byExchange.binance} пар
            </span>
            <span className="density-exchange bybit">
              Bybit: {result.byExchange.bybit} пар
            </span>
          </div>
        )}
        <p className="sr-only">Сканування обмежене доступністю API обох бірж.
        </p>
        {result && result.totalCandidates > 0 && (
          <div className="density-progress" role="progressbar"
            aria-valuenow={result.scanned} aria-valuemin={0} aria-valuemax={result.totalCandidates}>
            <div className="density-progress-fill"
              style={{ width: Math.min(100, 100 * result.scanned / result.totalCandidates) + '%' }} />
          </div>
        )}
      </header>

      <div className="density-filters-panel">
        <div className="density-panel-header"><Layers size={14} /><h2>Параметри сканування</h2><span>ФІЛЬТРИ</span></div>
        <div className="density-filters-body">
        <div className="density-filter-row">
          <span className="density-filter-label">Категорія:</span>
          {categories.map(item => <button type="button" key={item.value} className={choice(category === item.value)}
            onClick={() => setCategory(item.value)}>{item.label}</button>)}
        </div>
        <div className="density-filter-row">
          <span className="density-filter-label">Котирування:</span>
          {(['all', 'USDT', 'USDC'] as const).map(quote => (
            <button type="button" key={quote}
              aria-pressed={quoteAsset === quote}
              onClick={() => setQuoteAsset(quote)}
              className={choice(quoteAsset === quote)}>
              {quote === 'all' ? 'Усі (USDT + USDC)' : quote}
            </button>
          ))}
        </div>
        <div className="density-command-bar">
          <div className="density-search relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className={inputClass + ' pl-9'} value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') void scan('all'); }} placeholder="ПОШУК МОНЕТИ (BTC, SOL, AAPLX…)" aria-label="Пошук монети" />
          </div>
          <div className="density-command-filters">
            {(['all', 'binance', 'bybit'] as const).map(e => <button type="button" key={e} onClick={() => setExchange(e)}
              className={choice(exchange === e)}>{e === 'all' ? 'Усі біржі' : e === 'binance' ? 'Binance' : 'Bybit'}</button>)}
          </div>
          <div className="density-command-filters">
            {(['all', 'futures', 'spot'] as const).map(m => <button type="button" key={m} onClick={() => setMarketType(m)}
              className={choice(marketType === m)}>{m === 'all' ? 'Усі ринки' : m === 'futures' ? 'Ф’ючерси' : 'Спот'}</button>)}
          </div>
        </div>

        {category === 'stocks' && <p className="density-info flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />Стокові монети — токенізовані акції, які реально торгуються на вибраних біржах. За відсутності таких пар результат буде порожнім.</p>}

        {category === 'custom' && <div className="density-custom-lists space-y-3">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-300">Власні списки</span>
            <span className="text-[11px] text-slate-500">Збереження у цьому браузері</span></div>
          <p className="text-[11px] text-slate-500">Без суфікса монети додаються до вибраного котирування; режим «Усі» додає USDT і USDC. Можна також ввести точну пару BTCUSDC.</p>
          <div className="flex flex-wrap gap-2">
            <input className={inputClass + ' min-w-[140px] flex-1'} value={newName} maxLength={40} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createList(); }} placeholder="Назва нового списку" />
            <button type="button" onClick={createList} className="density-button primary"><Plus className="h-4 w-4" /> Створити</button>
          </div>
          {lists.length > 0 && <>
            <div className="flex flex-wrap items-center gap-2">
              <select className={inputClass + ' max-w-xs flex-1'} value={selected?.id || ''} onChange={e => setListId(e.target.value)}>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.symbols.length})</option>)}
              </select>
              <button type="button" aria-label="Видалити список" className="density-button danger" onClick={() => {
                if (!selected || !window.confirm('Видалити список «' + selected.name + '»?')) return;
                setLists(prev => prev.filter(l => l.id !== selected.id)); setListId('');
              }}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input className={inputClass + ' min-w-[160px] flex-1'} value={symbolsInput} onChange={e => setSymbolsInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSymbols(); }} placeholder="BTC, ETH, SOL, AAPLX…" />
              <button type="button" onClick={addSymbols} className="density-button"><Save className="h-4 w-4" /> Додати</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selected?.symbols.map(s => <button type="button" key={s} title={'Видалити ' + s}
                onClick={() => setLists(prev => prev.map(l => l.id === selected.id ? { ...l, symbols: l.symbols.filter(v => v !== s) } : l))}
                className="density-symbol-chip">{s}<X className="h-3 w-3 text-slate-500" /></button>)}
              {!selected?.symbols.length && <span className="text-xs text-slate-500">Додайте монети, які потрібно перевіряти.</span>}
            </div>
          </>}
          {listHint && <p className="text-xs text-cyan-300">{listHint}</p>}
        </div>}

        <div className="density-filter-footer">
          <button type="button" onClick={() => setSettingsOpen(!settingsOpen)}
            className={'density-button' + (settingsOpen ? ' active' : '')}>
            <SlidersHorizontal className="h-4 w-4 text-cyan-400" />Налаштування пошуку <span className="text-slate-500">{settingsOpen ? '▲' : '▼'}</span>
          </button>
          <label className="density-auto-refresh"><Clock3 className="h-4 w-4" />Автооновлення першої порції
            <select className="density-input"
              value={intervalSeconds} onChange={e => setIntervalSeconds(Number(e.target.value))}>
              <option value={0}>Вимкнено</option><option value={30}>30 с</option><option value={60}>60 с</option><option value={120}>2 хв</option>
            </select>
          </label>
        </div>
        {settingsOpen && <div className="density-settings grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {([
            ['minNotionalUsd', 'Мін. щільність ($)', 1000, 1000000000, 1000],
            ['minVolumeUsd', 'Обсяг монети 24h ($)', 0, 100000000000, 100000],
            ['strengthMultiplier', 'Сила щільності (×)', 1, 20, 0.1],
            ['maxDistancePct', 'Відстань від ціни (%)', 0.1, 20, 0.1],
            ['bucketPct', 'Крок групування (%)', 0.01, 2, 0.01],
            ['limit', 'Монет за порцію (1–24)', 1, 24, 1],
          ] as const).map(([key, label, min, max, step]) => <label key={key} className="min-w-0 space-y-1">
            <span className="block text-[11px] leading-4 text-slate-400">{label}</span>
            <input className={inputClass + ' font-mono'} type="number" value={settings[key]} min={min} max={max} step={step}
              onChange={e => setSettings(prev => ({ ...prev, [key]: Number(e.target.value) }))} />
          </label>)}
          <label className="min-w-0 space-y-1"><span className="block text-[11px] text-slate-400">Сторона стакана</span>
            <select className={inputClass} value={settings.side} onChange={e => setSettings(prev => ({ ...prev, side: e.target.value as Settings['side'] }))}>
              <option value="both">BID + ASK</option><option value="bid">Тільки BID</option><option value="ask">Тільки ASK</option>
            </select>
          </label>
          <button type="button" className="density-button self-end" onClick={() => setSettings(defaults)}>Скинути параметри</button>
          <p className="col-span-full text-[11px] leading-4 text-slate-500">Сила × — порівняння обсягу заявки із середнім обсягом рівнів у вибраному діапазоні. Стакан — поточні ордери, а не виконані угоди.</p>
        </div>}
        </div>
      </div>

      {error && <div role="alert" className="density-alert flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {result && result.failed > 0 && <p className="density-partial">Часткові дані: {result.received} стаканів завантажено, {result.failed} недоступно.</p>}

      <div className="density-results-header">
        <div><h2>Знайдені щільності <span className="density-count">{result?.matched ?? 0}</span></h2>
          <p className="mt-1 text-xs text-slate-500">Червоне — продаж (ASK), зелене — купівля (BID). ● — щільність. Наведіть на рівень або натисніть його для часу та відстані у %.</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">⏱ Час появи показується лише після підтвердження нової щільності біржовим WebSocket-оновленням. Для вже існуючих заявок точна дата невідома; час першого виявлення SignalHook вказаний окремо.</p></div>
        {loading && <span className="inline-flex items-center gap-2 text-xs text-cyan-300">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {scanningAll ? 'Автосканування всіх пар: ' + (result?.scanned || 0) + (result?.totalCandidates ? ' / ' + result.totalCandidates : '') + ' перевірено…' : 'Оновлення стаканів…'}
        </span>}
      </div>
      {result && result.data.length > 0 ? (
        <div className="density-results-grid grid grid-cols-1 items-start gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {result.data.slice(0, shownCount).map(item => <DensityCard key={item.exchange + item.marketType + item.symbol} item={item} now={now} />)}
        </div>
      ) : <div className="density-empty flex flex-col items-center gap-3 px-6 py-14 text-center">
        <BookOpen className="h-10 w-10 text-slate-600" />
        <p className="text-sm font-bold text-slate-300">{loading && !result ? 'Шукаємо лімітні заявки…' : result ? 'Щільності за обраними критеріями не знайдено' : 'Результати пошуку щільностей'}</p>
        <p className="max-w-lg text-xs leading-5 text-slate-500">{result ?
          'Спробуйте зменшити мінімальну суму або силу щільності, збільшити відстань чи змінити категорію.' :
          'Сканування використовує реальні знімки стаканів. Доступність залежить від бірж.'}</p>
      </div>}
      <div className="density-pagination flex flex-wrap justify-center gap-2">
        {result && result.data.length > shownCount && (
          <button type="button" onClick={() => setShownCount(prev => prev + 40)}
            className="density-button">
            Показати ще 40 ({result.data.length - shownCount} приховано)
          </button>
        )}
        {result?.hasMore && !loading && (
          <button type="button" onClick={() => void scan('next')}
            className="density-button">
            Перевірити наступні {settings.limit} монет
          </button>
        )}
      </div>
    </section>
  );
};
