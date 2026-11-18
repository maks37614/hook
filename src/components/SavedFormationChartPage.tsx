import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, History, RefreshCw } from 'lucide-react';
import { HookChart } from './HookChart';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { fetchSharedHistoricalKlines } from '../utils/sharedHistoricalKlines';
import { normalizeExchangeSymbol } from '../utils/marketSymbols';
import { subscribeSharedKlines } from './hookchart/sharedKlineStream';
import { mergeLiveCandle } from '../utils/hookchartData';
import { ARCHIVE_HISTORY_MAX_CANDLES, archiveHistoryPageLimit, mergeArchivedHistory } from '../utils/archiveHistory';
import type { ArchivedFormation, Kline, Timeframe } from '../types';

interface SavedFormationChartPageProps {
  archivedItem: ArchivedFormation;
  initialTimeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  onClose: () => void;
}

const MAX_HISTORY = ARCHIVE_HISTORY_MAX_CANDLES;
const PAGE_SIZE = 1000;
const SESSION_TTL_MS = 120_000;
const SESSION_ITEMS = 6;
// Only public OHLCV, never archive notes, account records or credentials.
// Bounded to this browser tab; no localStorage / IndexedDB write or extra VPS worker.
const sessionCandles = new Map<string, { savedAt: number; rows: Kline[] }>();

function readCached(key: string): Kline[] | null {
  const hit = sessionCandles.get(key);
  if (!hit || Date.now() - hit.savedAt > SESSION_TTL_MS) {
    sessionCandles.delete(key);
    return null;
  }
  sessionCandles.delete(key);
  sessionCandles.set(key, hit);
  return hit.rows;
}

function rememberCached(key: string, rows: Kline[]): void {
  sessionCandles.delete(key);
  sessionCandles.set(key, { savedAt: Date.now(), rows: rows.slice(-MAX_HISTORY) });
  while (sessionCandles.size > SESSION_ITEMS) {
    const oldest = sessionCandles.keys().next().value;
    if (oldest === undefined) break;
    sessionCandles.delete(oldest);
  }
}


const copy = {
  uk: { saved: 'Збережена формація', history: 'Завантажити ще 500 свічок', loading: 'Завантаження історичних свічок…', unavailable: 'Не вдалося завантажити справжню історію біржі.', retry: 'Повторити', back: 'Назад', captured: 'Збережено', old: 'Попередня історія', noOlder: 'Старіших свічок немає', annotation: 'Збережені лінії відображаються на живому графіку. Нові малюнки в цьому перегляді не змінюють оригінальний архів.' },
  en: { saved: 'Saved formation', history: 'Load 500 older candles', loading: 'Loading historical candles…', unavailable: 'Could not load real exchange history.', retry: 'Retry', back: 'Back', captured: 'Saved', old: 'Older history', noOlder: 'No older candles available', annotation: 'Saved drawings are displayed on the live chart. New drawings in this view do not modify the original archive.' },
  pl: { saved: 'Zapisana formacja', history: 'Wczytaj 500 starszych świec', loading: 'Wczytywanie świec historycznych…', unavailable: 'Nie udało się wczytać rzeczywistej historii z giełdy.', retry: 'Ponów', back: 'Wróć', captured: 'Zapisano', old: 'Starsza historia', noOlder: 'Brak starszych świec', annotation: 'Zapisane rysunki są widoczne na wykresie na żywo. Nowe rysunki w tym widoku nie zmieniają oryginalnego archiwum.' },
  ru: { saved: 'Сохранённая формация', history: 'Загрузить ещё 500 свечей', loading: 'Загрузка исторических свечей…', unavailable: 'Не удалось загрузить реальную историю биржи.', retry: 'Повторить', back: 'Назад', captured: 'Сохранено', old: 'Прошлая история', noOlder: 'Более старых свечей нет', annotation: 'Сохранённые линии показаны на живом графике. Новые рисунки в этом просмотре не меняют оригинал архива.' },
} as const;

export const SavedFormationChartPage: React.FC<SavedFormationChartPageProps> = ({
  archivedItem, initialTimeframe, onTimeframeChange, onClose,
}) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const words = copy[language as keyof typeof copy] || copy.uk;
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  // Browser Back/Forward changes the hash route without remounting this archive.
  useEffect(() => setTimeframe(initialTimeframe), [initialTimeframe]);
  const [history, setHistory] = useState<{ key: string; rows: Kline[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [noOlder, setNoOlder] = useState(false);
  const [retry, setRetry] = useState(0);
  const lastWsTick = useRef<{ scope: string; receivedAt: number; candle: Kline } | null>(null);
  const symbol = normalizeExchangeSymbol(archivedItem.symbol).toUpperCase();
  const scope = [user?.uid, archivedItem.exchange, archivedItem.marketType, symbol, timeframe].join(':');
  const rows = history?.key === scope ? history.rows : [];
  const archiveOwner = !!user && user.uid === archivedItem.userId;
  const historyRowsRef = useRef(rows);
  historyRowsRef.current = rows;
  const activeScopeRef = useRef(scope);
  activeScopeRef.current = scope;
  const olderRequestRef = useRef<{ scope: string; promise: Promise<boolean> } | null>(null);

  useEffect(() => {
    if (!archiveOwner || timeframe === '30s') { setLoading(false); setError(true); return; }
    let active = true;
    const cached = readCached(scope);
    setNoOlder(false);
    setMoreLoading(false);
    setHistory(cached ? { key: scope, rows: cached } : null);
    setLoading(!cached);
    setError(false);
    // The cache paints immediately; a fresh HTTP page revalidates it, and the
    // separate shared WebSocket subscription keeps the latest candle current.
    const load = async () => {
      const startedAt = Date.now();
      try {
        if (cached && Date.now() - (sessionCandles.get(scope)?.savedAt || 0) < 15_000) return;
        const candles = await fetchSharedHistoricalKlines({
          exchange: archivedItem.exchange, marketType: archivedItem.marketType,
          symbol, timeframe, limit: PAGE_SIZE,
        });
        if (!active) return;
        if (!candles.length) {
          if (!cached) setError(true);
          return;
        }
        // Preserve older history from the local cache but prefer the fresh
        // REST response for overlapping timestamps. Finally apply only an
        // exchange WebSocket tick received DURING this HTTP request.
        setHistory(previous => {
          const older = previous?.key === scope
            ? previous.rows.filter(row => row.time < candles[0].time) : [];
          const fromHttp = mergeArchivedHistory(candles, older);
          const ws = lastWsTick.current;
          const combined = ws?.scope === scope && ws.receivedAt >= startedAt
            ? mergeLiveCandle(fromHttp, ws.candle, MAX_HISTORY) : fromHttp;
          rememberCached(scope, combined);
          return { key: scope, rows: combined };
        });
      } catch {
        if (active && !cached) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [scope, archivedItem.exchange, archivedItem.marketType, symbol, timeframe, retry, archiveOwner]);

  // An archive is not a static screenshot. Use the same deduplicated public
  // exchange WebSocket as regular HookChart, without a second polling loop.
  // Subscription scope changes with timeframe; stale callbacks cannot move
  // candles from a different market into this archived chart.
  useEffect(() => {
    if (!archiveOwner || timeframe === '30s') return;
    let disposed = false;
    const unsubscribe = subscribeSharedKlines({
      exchange: archivedItem.exchange, marketType: archivedItem.marketType, symbol, timeframe,
    }, {
      onCandle: candle => {
        if (disposed) return;
        lastWsTick.current = { scope, receivedAt: Date.now(), candle };
        setHistory(current => {
          if (!current || current.key !== scope || current.rows.length < 2) return current;
          const next = mergeLiveCandle(current.rows, candle, MAX_HISTORY);
          return next === current.rows ? current : { key: scope, rows: next };
        });
      },
    });
    return () => { disposed = true; unsubscribe(); };
  }, [archiveOwner, archivedItem.exchange, archivedItem.marketType, symbol, timeframe, scope]);

  // The "older history" button and HookChart's left-edge panning use this
  // SAME owner-scoped, single-flight loader. No duplicate 500-candle requests.
  // A previous timeframe's late response must never overwrite this chart.
  const loadOlderHistory = useCallback((requestedEndTimeMs: number): Promise<boolean> => {
    if (!archiveOwner || timeframe === '30s' || activeScopeRef.current !== scope) return Promise.resolve(false);
    const pending = olderRequestRef.current;
    if (pending?.scope === scope) return pending.promise;
    const current = historyRowsRef.current;
    if (!current.length) return Promise.resolve(false);
    if (archiveHistoryPageLimit(current.length) === 0) {
      setNoOlder(true);
      return Promise.resolve(false);
    }
    const oldest = current[0].time;
    const cursor = Math.min(Math.round(oldest * 1000) - 1, requestedEndTimeMs);
    if (!Number.isFinite(cursor) || cursor <= 0) return Promise.resolve(false);

    const promise = (async () => {
      setMoreLoading(true);
      try {
        const older = await fetchSharedHistoricalKlines({
          exchange: archivedItem.exchange, marketType: archivedItem.marketType,
          symbol, timeframe, limit: archiveHistoryPageLimit(current.length),
          endTime: cursor,
        });
        if (activeScopeRef.current !== scope) return false;
        const genuinelyOlder = older.filter(row => row.time < oldest);
        if (!genuinelyOlder.length) {
          setNoOlder(true);
          return false;
        }
        setHistory(previous => {
          if (!previous || previous.key !== scope) return previous;
          // Merge against the *latest* rows, including any WS updates while
          // the history request was in flight. Never show a stale closure.
          const combined = mergeArchivedHistory(previous.rows, genuinelyOlder);
          if (combined.length === previous.rows.length) return previous;
          rememberCached(scope, combined);
          return { key: scope, rows: combined };
        });
        if (current.length + genuinelyOlder.length >= MAX_HISTORY) setNoOlder(true);
        return true;
      } catch {
        if (activeScopeRef.current === scope) setError(true);
        return false;
      } finally {
        if (activeScopeRef.current === scope) setMoreLoading(false);
        if (olderRequestRef.current?.scope === scope) olderRequestRef.current = null;
      }
    })();
    olderRequestRef.current = { scope, promise };
    return promise;
  }, [archiveOwner, archivedItem.exchange, archivedItem.marketType, symbol, timeframe, scope]);

  const loadMore = () => {
    if (moreLoading || noOlder || !rows.length) return;
    void loadOlderHistory(Math.round(rows[0].time * 1000) - 1);
  };

  const recordedAt = useMemo(() => new Date(archivedItem.savedAtTimestamp || archivedItem.createdAt)
    .toLocaleString(language === 'en' ? 'en-GB' : language === 'pl' ? 'pl-PL' : language === 'ru' ? 'ru-RU' : 'uk-UA'), [archivedItem.savedAtTimestamp, archivedItem.createdAt, language]);
  const savedSnapshot = archivedItem.chartSnapshot;
  // A logical range captured on a different set of candles is not a reliable
  // historical timestamp; let the user pan/scroll to the saved period instead.
  const savedParams = timeframe === archivedItem.timeframe ? archivedItem.chartParams : undefined;

  if (!archiveOwner) return null;

  return (
    <section className="mx-auto flex w-full max-w-[2200px] min-w-0 flex-col gap-3 px-2 pb-6 pt-3 sm:px-4" data-saved-formation-chart>
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/90 p-2 sm:p-3">
        <button type="button" onClick={onClose} aria-label={words.back} title={words.back}
          className="rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800">
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span data-no-translate className="font-mono text-sm font-bold text-white">{archivedItem.baseAsset}/{archivedItem.quoteAsset}</span>
            <span className="text-xs font-semibold text-cyan-300">{words.saved}</span>
            <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">{archivedItem.exchange.toUpperCase()} · {archivedItem.marketType}</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">{archivedItem.formationName} · {words.captured}: {recordedAt}</p>
        </div>
        <button type="button" onClick={loadMore} disabled={loading || moreLoading || !rows.length || noOlder}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          title={words.history}>
          {moreLoading ? <RefreshCw size={15} className="animate-spin" /> : <History size={15} />}
          <span className="hidden sm:inline">{noOlder ? words.noOlder : words.old}</span>
        </button>
      </div>
      {archivedItem.entryReason?.trim() && (
        <div className="min-w-0 rounded-xl border border-purple-500/20 bg-slate-950/80 px-3 py-2">
          <strong className="text-xs text-purple-300">
            {({ uk:'Причина входу', en:'Entry reason', pl:'Powód wejścia', ru:'Причина входа' } as Record<string,string>)[language] || 'Причина входу'}
          </strong>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">{archivedItem.entryReason}</p>
        </div>
      )}
      <div className="relative h-[74dvh] min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#090d16] sm:min-h-[540px]">
        {rows.length > 0 && <HookChart
          key={scope}
          klines={rows} symbol={symbol} timeframe={timeframe}
          exchange={archivedItem.exchange} marketType={archivedItem.marketType}
          archiveMode archiveSnapshot={savedSnapshot}
          archiveOnNeedHistory={loadOlderHistory}
          markers={archivedItem.markers || []}
          savedChartParams={savedParams}
          onTimeframeChange={next => { setTimeframe(next); onTimeframeChange(next); }}
          visualContext="formationsFull"
        />}
        {loading && !rows.length && <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-300">
          <RefreshCw size={16} className="animate-spin" />{words.loading}
        </div>}
        {error && !rows.length && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-sm text-amber-200">
          {words.unavailable}
          <button type="button" onClick={() => setRetry(n => n + 1)}
            className="rounded-lg border border-cyan-700 px-3 py-2 text-cyan-200">{words.retry}</button>
        </div>}
      </div>
      {error && rows.length > 0 && <p role="status" className="text-xs text-amber-300">{words.unavailable}</p>}
      {timeframe === archivedItem.timeframe &&
        (!!savedSnapshot?.density?.markers.length || !!savedSnapshot?.overlayScene) && (
          <p role="status" className="rounded-lg border border-slate-800 bg-slate-950/75 px-3 py-2 text-xs text-slate-400">
            {({
              uk:'Позначки автоматичних інструментів і щільностей показані за збереженими координатами, а не з поточного стакана. Вони належать таймфрейму на момент збереження.',
              en:'Automatic overlays and order-book levels use saved historical coordinates, not the current order book. They belong to the saved timeframe.',
              pl:'Automatyczne oznaczenia i poziomy z arkusza zleceń wykorzystują zapisane współrzędne historyczne, nie aktualny arkusz. Dotyczą zapisanego interwału.',
              ru:'Автоматические отметки и уровни стакана используют сохранённые исторические координаты, а не текущий стакан. Они относятся к сохранённому таймфрейму.',
            } as Record<string,string>)[language] || 'Збережені історичні координати.'}
          </p>
        )}
      <p className="px-1 text-xs text-slate-500">{words.annotation}</p>
    </section>
  );
};
