import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrainCircuit, ChevronDown, X } from 'lucide-react';
import type { ExchangeId, MarketType } from '../../types';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { hasEnoughRecurrenceHistory, isRecurrenceReportStale, type RecurrenceBar, type RecurrenceFinding, type RecurrenceReport } from './marketRecurrence';
import { loadMarketRecurrenceHistory, marketRecurrenceTimeframeMs } from './marketRecurrenceHistory';
import { recordRecurrenceWorker } from './chartDiagnostics';

type Language = 'uk' | 'en' | 'pl' | 'ru';
type Props = {
  rootRef: React.RefObject<HTMLDivElement | null>;
  candles: readonly RecurrenceBar[];
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: string;
  language: Language;
  disabled?: boolean;
  showTooltip?: boolean;
  onResultsChange?: (scope: string, report: RecurrenceReport | null) => void;
};
const COPY = {
  uk: { title: 'Закономірності ринку', enable: 'Увімкнути аналіз закономірностей', disable: 'Вимкнути аналіз закономірностей',
    unsupported: 'Доступно від 1m (крім 30s)', off: 'Вимкнено', loading: 'Аналіз 7 днів…', empty: 'Перевірених повторень не знайдено', insufficient: 'Недостатньо якісної історії для висновку',
    error: 'Не вдалося отримати історію або виконати аналіз', coverage: 'Історії', candles: 'свічок',
    precision: 'позначки: інтервал 5m', base: 'Базовий TF', events: 'Випадків', baseline: 'Звичайна частота', holdout: 'Окрема перевірка', details: 'Статистика',
    repeat: 'Повторення у вибірці', preliminary: 'Попереднє спостереження',
    warning: 'Не є прогнозом напрямку чи ймовірністю прибутку. Для щоденних сесій 7 днів недостатньо для підтвердження.',
    impulse: 'Імпульс', volume: 'Сплеск обсягу', hour: 'Щогодини', halfHour: 'Кожні 30 хв', quarterHour: 'Кожні 15 хв',
    london: 'Відкриття Лондона', newYork: 'Відкриття Нью-Йорка', tokyo: 'Відкриття Токіо',
  },
  en: { title: 'Market recurrences', enable: 'Enable recurrence analysis', disable: 'Disable recurrence analysis',
    unsupported: 'Available from 1m (not 30s)', off: 'Off', loading: 'Analyzing 7 days…', empty: 'No validated recurrences found', insufficient: 'Not enough complete history for a reliable result',
    error: 'History or analysis is unavailable', coverage: 'History', candles: 'candles', base: 'Base TF', precision: 'marks: 5m window',
    events: 'Events', baseline: 'Background rate', holdout: 'Hold-out check', details: 'Statistics', repeat: 'Repeated in sample',
    preliminary: 'Preliminary observation', warning: 'Not a price-direction or profit forecast. Seven days cannot validate daily session behavior.',
    impulse: 'Impulse', volume: 'Volume spike', hour: 'Every hour', halfHour: 'Every 30m', quarterHour: 'Every 15m',
    london: 'London open', newYork: 'New York open', tokyo: 'Tokyo open',
  },
  pl: { title: 'Powtarzalność rynku', enable: 'Włącz analizę powtarzalności', disable: 'Wyłącz analizę powtarzalności',
    unsupported: 'Dostępne od 1m (bez 30s)', off: 'Wyłączone', loading: 'Analiza 7 dni…', empty: 'Nie znaleziono potwierdzonych powtórzeń', insufficient: 'Brak pełnej historii do wiarygodnej oceny',
    error: 'Historia lub analiza jest niedostępna', coverage: 'Historia', candles: 'świec', base: 'Bazowy TF', precision: 'znaczniki: zakres 5m',
    events: 'Zdarzenia', baseline: 'Częstość bazowa', holdout: 'Test poza próbą', details: 'Statystyka', repeat: 'Powtarza się w próbie',
    preliminary: 'Wstępna obserwacja', warning: 'To nie prognoza kierunku ani zysku. Siedem dni to za mało do potwierdzenia wzorców sesyjnych.',
    impulse: 'Impuls', volume: 'Skok wolumenu', hour: 'Co godzinę', halfHour: 'Co 30 min', quarterHour: 'Co 15 min',
    london: 'Otwarcie Londynu', newYork: 'Otwarcie Nowego Jorku', tokyo: 'Otwarcie Tokio',
  },
  ru: { title: 'Закономерности рынка', enable: 'Включить поиск закономерностей', disable: 'Выключить поиск закономерностей',
    unsupported: 'Доступно от 1m (кроме 30s)', off: 'Выключено', loading: 'Анализ 7 дней…', empty: 'Проверенных повторений не найдено', insufficient: 'Недостаточно полной истории для надёжного вывода',
    error: 'История или анализ недоступны', coverage: 'История', candles: 'свечей', base: 'Базовый ТФ', precision: 'отметки: интервал 5m',
    events: 'Случаев', baseline: 'Базовая частота', holdout: 'Отдельная проверка', details: 'Статистика', repeat: 'Повторяется в выборке',
    preliminary: 'Предварительное наблюдение',
    warning: 'Это не прогноз направления или прибыли. Семь дней недостаточно для подтверждения закономерностей сессий.',
    impulse: 'Импульс', volume: 'Всплеск объёма', hour: 'Каждый час', halfHour: 'Каждые 30 мин', quarterHour: 'Каждые 15 мин',
    london: 'Открытие Лондона', newYork: 'Открытие Нью-Йорка', tokyo: 'Открытие Токио',
  },
} as const;
type Copy = typeof COPY[Language];
type Status = { key: string; loading: boolean; report?: RecurrenceReport; error?: boolean };
let sharedWorker: Worker | null = null;
let workerUsers = 0;
let nextId = 0;
const pending = new Map<number, { resolve: (report: RecurrenceReport) => void; reject: (error: Error) => void }>();
const resultCache = new Map<string, Promise<RecurrenceReport>>();
// One low-frequency clock for all enabled charts in a tab, including Terminal.
// When no recurrence tool is active, no interval is running.
let recurrenceClock = Date.now();
const recurrenceClockListeners = new Set<() => void>();
let recurrenceClockTimer: ReturnType<typeof setInterval> | null = null;
const readRecurrenceClock = () => recurrenceClock;
const idleRecurrenceClock = () => () => {};
function subscribeRecurrenceClock(listener: () => void): () => void {
  recurrenceClockListeners.add(listener);
  if (!recurrenceClockTimer) {
    recurrenceClock = Date.now();
    recurrenceClockTimer = setInterval(() => {
      recurrenceClock = Date.now();
      for (const notify of recurrenceClockListeners) notify();
    }, 60_000);
  }
  listener(); // Catch a gap between first rendering and subscribing.
  return () => {
    recurrenceClockListeners.delete(listener);
    if (!recurrenceClockListeners.size && recurrenceClockTimer) {
      clearInterval(recurrenceClockTimer);
      recurrenceClockTimer = null;
    }
  };
}
function rejectPending() {
  for (const handler of pending.values()) handler.reject(new Error('worker-stopped'));
  pending.clear();
}
function retainWorker(): () => void {
  workerUsers++;
  return () => {
    workerUsers = Math.max(0, workerUsers - 1);
    if (!workerUsers) {
      sharedWorker?.terminate();
      sharedWorker = null;
      rejectPending();
      resultCache.clear();
    }
  };
}
function runWorker(key: string, rows: RecurrenceBar[], timeframeMs: number, nowMs: number): Promise<RecurrenceReport> {
  const cached = resultCache.get(key);
  if (cached) return cached;
  const request = new Promise<RecurrenceReport>((resolve, reject) => {
    if (typeof Worker === 'undefined') { reject(new Error('worker-unsupported')); return; }
    try {
      if (!sharedWorker) {
        sharedWorker = new Worker(new URL('./marketRecurrence.worker.ts', import.meta.url), { type: 'module' });
        sharedWorker.onmessage = (message: MessageEvent<{ id: number; report?: RecurrenceReport; workerMs?: number; error?: string }>) => {
          const { id, report, workerMs } = message.data;
          const handle = pending.get(id);
          if (!handle) return;
          pending.delete(id);
          if (report) {
            if (workerMs !== undefined) recordRecurrenceWorker(workerMs, report.bars);
            handle.resolve(report);
          }
          else handle.reject(new Error('analysis-failed'));
        };
        sharedWorker.onerror = () => {
          rejectPending();
          sharedWorker?.terminate();
          sharedWorker = null;
          resultCache.clear();
        };
      }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      sharedWorker.postMessage({ id, rows, timeframeMs, nowMs });
    } catch (error) { reject(error instanceof Error ? error : new Error('worker-failed')); }
  });
  resultCache.set(key, request);
  while (resultCache.size > 24) resultCache.delete(resultCache.keys().next().value!);
  void request.catch(() => { if (resultCache.get(key) === request) resultCache.delete(key); });
  return request;
}
function findingLabel(f: RecurrenceFinding, c: Copy) {
  const kind = f.kind === 'impulse' ? c.impulse : c.volume;
  const cycle = c[f.cycle];
  if (f.cycle === 'london' || f.cycle === 'newYork' || f.cycle === 'tokyo') return kind + ' · ' + cycle;
  return kind + ' · ' + cycle + ' (+' + f.minute + 'm)';
}
const percent = (value: number) => Math.round(value * 100) + '%';

function MarketRecurrenceToolInner({ rootRef, candles, exchange, marketType, symbol, timeframe, language, disabled = false, showTooltip = true, onResultsChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const seriesRef = useRef(candles);
  seriesRef.current = candles;
  const c = COPY[language] || COPY.uk;
  const timeframeMs = marketRecurrenceTimeframeMs(timeframe);
  const supported = timeframeMs > 0 && !disabled;
  const scope = [exchange, marketType, normalizeExchangeSymbol(symbol), timeframe].join(':');
  // On 1m only recompute once per closed 5m bucket, never on every live tick.
  const latestCandleTime = candles.at(-1)?.t || 0;
  const closedBucket = timeframeMs ? Math.floor(latestCandleTime / timeframeMs) : 0;
  const key = scope + ':' + closedBucket;
  const active = enabled && supported;
  // Do not spend timers or CPU on disabled charts.
  const staleClockNow = React.useSyncExternalStore(
    active ? subscribeRecurrenceClock : idleRecurrenceClock,
    readRecurrenceClock,
    () => 0,
  );
  useEffect(() => {
    if (!active) return;
    return retainWorker();
  }, [active]);
  // Preserve the no-history → history-ready transition without recomputing on each tick.
  const hasLoadedCandle = latestCandleTime > 0;
  useEffect(() => {
    if (!active || !hasLoadedCandle) return;
    let cancelled = false;
    const controller = new AbortController();
    setStatus({ key, loading: true });
    void (async () => {
      try {
        const nowMs = Date.now();
        const rows = await loadMarketRecurrenceHistory({
          exchange, marketType, symbol, chartTimeframe: timeframe,
          existing: seriesRef.current, nowMs, signal: controller.signal,
        });
        if (cancelled) return;
        const baseTf = marketRecurrenceTimeframeMs(timeframe);
        const lastTime = rows.at(-1)?.t || 0;
        const firstTime = rows[0]?.t || 0;
        const workerKey = [exchange, marketType, symbol, timeframe, baseTf, firstTime, lastTime, rows.length].join(':');
        const report = await runWorker(workerKey, rows, baseTf, nowMs);
        if (!cancelled) setStatus({ key, loading: false, report });
      } catch {
        if (!cancelled) setStatus({ key, loading: false, error: true });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [active, key, exchange, marketType, symbol, timeframe, hasLoadedCandle]);
  const result = active && status?.key === key ? status : null;
  const report = result && !result.loading && !result.error ? result.report ?? null : null;
  const stale = !!report && isRecurrenceReportStale(report, staleClockNow);
  const insufficient = !!report && (!hasEnoughRecurrenceHistory(report) || stale);
  // Opt-in chart-only overlay. It is cleared on disable, timeframe changes,
  // error and unmount; no account preference or drawing is ever saved.
  useEffect(() => {
    onResultsChange?.(scope, active && status?.key === key && !status.loading && !status.error && !stale
      ? status.report ?? null : null);
    return () => onResultsChange?.(scope, null);
  }, [onResultsChange, scope, active, key, status, stale]);
  const panel = active && rootRef.current ? createPortal(
    <section className="hookchart-market-recurrence-panel" role="region" aria-label={c.title}>
      <div className="hookchart-market-recurrence-head">
        <b>{c.title} · 7d</b>
        <button type="button" onClick={() => setEnabled(false)} title={c.disable} aria-label={c.disable}><X size={14}/></button>
      </div>
      <div className="hookchart-market-recurrence-meta">
        {symbol.toUpperCase()} · {c.base}: {timeframe === '1m' ? '5m' : timeframe}{timeframe === '1m' ? ' · ' + c.precision : ''}
      </div>
      {!result || result.loading ? <p role="status">{c.loading}</p>
        : result.error ? <p role="status">{c.error}</p>
        : <>
          <div className="hookchart-market-recurrence-summary">
            <span role="status">{insufficient ? c.insufficient : report?.findings[0] ? findingLabel(report.findings[0], c) : c.empty}</span>
            <button type="button" onClick={() => setDetailsOpen(open => !open)}
              aria-expanded={detailsOpen} aria-label={c.details} title={c.details}>
              <ChevronDown size={14} style={{ transform: detailsOpen ? 'rotate(180deg)' : undefined }}/>
            </button>
          </div>
          {detailsOpen && !insufficient && <>
            <small>{c.coverage}: {report!.coveredDays.toFixed(1)}/7d · {report!.bars} {c.candles}</small>
            {report!.findings.map((item, index) =>
              <div className="hookchart-market-recurrence-item" key={item.kind + item.cycle + item.minute + index}>
                <strong>{findingLabel(item, c)}</strong>
                <span>{item.status === 'repeat' ? c.repeat : c.preliminary}</span>
                <small>{c.events}: {item.hits}/{item.observations} ({percent(item.rate)}) · {c.baseline}: {percent(item.baselineRate)}</small>
                <small>{c.holdout}: {item.holdoutHits}/{item.holdoutObservations}</small>
              </div>)}
            <small className="hookchart-market-recurrence-warning">{c.warning}</small>
          </>}
        </>}
    </section>, rootRef.current) : null;
  return <>
    <button
      type="button"
      className={'hookchart-market-recurrence-toggle' + (active ? ' active' : '')}
      aria-label={active ? c.disable : supported ? c.enable : c.unsupported}
      title={showTooltip ? (active ? c.disable : supported ? c.enable : c.unsupported) : undefined}
      aria-pressed={active}
      disabled={!supported}
      onClick={() => setEnabled(on => !on)}
    ><BrainCircuit size={15} strokeWidth={1.8} aria-hidden="true"/></button>
    {panel}
  </>;
}

// Live intra-candle ticks do not change the closed-candle recurrence result.
// This prevents a 36-chart Terminal from rerendering opt-in panels on every tick.
export const MarketRecurrenceTool = React.memo(MarketRecurrenceToolInner, (a, b) =>
  a.rootRef === b.rootRef && a.exchange === b.exchange && a.marketType === b.marketType &&
  a.symbol === b.symbol && a.timeframe === b.timeframe && a.language === b.language &&
  a.disabled === b.disabled && a.showTooltip === b.showTooltip &&
  a.onResultsChange === b.onResultsChange &&
  a.candles.length === b.candles.length && a.candles.at(-1)?.t === b.candles.at(-1)?.t);
