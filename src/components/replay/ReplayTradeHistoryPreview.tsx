import React, { useEffect, useMemo, useState } from 'react';
import { HookChart } from '../HookChart';
import { useLanguage } from '../../context/LanguageContext';
import { fetchHistoricalReplayCandles, processCandlesForCutoff, timeframeToMs } from '../../utils/replayService';
import type { ChartMarkerInfo, Kline, ReplayTradeJournalItem, Timeframe } from '../../types';

const text = {
  uk: { loading: 'Завантаження історичних свічок із кешу…', error: 'Історія недоступна для цієї угоди та таймфрейму.', entry: 'Вхід', exit: 'Вихід' },
  en: { loading: 'Loading historical candles from cache…', error: 'History is unavailable for this trade and timeframe.', entry: 'Entry', exit: 'Exit' },
  pl: { loading: 'Wczytywanie świec historycznych z pamięci podręcznej…', error: 'Historia tej transakcji i interwału jest niedostępna.', entry: 'Wejście', exit: 'Wyjście' },
  ru: { loading: 'Загрузка исторических свечей из кеша…', error: 'История этой сделки и таймфрейма недоступна.', entry: 'Вход', exit: 'Выход' },
} as const;

/** Historical, read-only HookChart. Loaded only on explicit journal action.
 * Replay=true disconnects live exchange streams/analysis and uses only passed
 * closed candles. Changing timeframe fetches only the requested cached range.
 */
export default function ReplayTradeHistoryPreview({ trade }: { trade: ReplayTradeJournalItem }) {
  const { language } = useLanguage();
  const label = text[language] || text.uk;
  const [timeframe, setTimeframe] = useState<Timeframe>(trade.timeframe);
  const [candles, setCandles] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => { setTimeframe(trade.timeframe); }, [trade.id, trade.timeframe]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    setCandles([]);
    void (async () => {
      const tfMs = timeframeToMs(timeframe);
      const endSec = Math.min(Math.ceil(Date.now() / 1000), trade.exitTime + Math.ceil(tfMs / 1000));
      let rows: Kline[] = [];
      // Cache-only: no exchange call, no history worker, no speculative warmup.
      try {
        const params = new URLSearchParams({
          symbol: trade.symbol, exchange: trade.exchange, market: trade.marketType,
          timeframe, beforeTime: String(endSec), limit: '280',
        });
        const response = await fetch('/api/replay/cached-history?' + params.toString());
        if (response.ok) {
          const result = await response.json();
          const cached = Array.isArray(result.data) ? result.data as Kline[] : [];
          const valid = cached.filter(row => row.time <= trade.exitTime && row.time > 0);
          const latestTime = Math.max(0, ...valid.map(row => row.time));
          if (valid.length >= 15 && latestTime >= trade.exitTime - 2 * tfMs / 1000)
            rows = processCandlesForCutoff(valid, trade.exitTime * 1000, timeframe)
              .allCandles.filter(row => row.time <= trade.exitTime);
        }
      } catch {
        // Cache can be empty after VPS restart. One bounded historical fetch
        // is permitted only because the user explicitly opened this preview.
      }
      if (!rows.length) {
        const result = await fetchHistoricalReplayCandles(
          trade.exchange, trade.marketType, trade.symbol, timeframe,
          trade.exitTime * 1000, 260, 0,
        );
        rows = result.allCandles.slice(0, result.cutoffIndex + 1)
          .filter(candle => candle.time <= trade.exitTime && Number.isFinite(candle.close));
      }
      if (cancelled) return;
      if (!rows.length) setUnavailable(true);
      else setCandles(rows);
    })().catch(() => {
      if (!cancelled) setUnavailable(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [trade.id, trade.exchange, trade.marketType, trade.symbol, trade.exitTime, timeframe]);

  const markers = useMemo(() => {
    const rows: ChartMarkerInfo[] = [
      { id: 'trade-entry', type: 'entry', label: label.entry,
        price: trade.entryPrice, time: trade.entryTime, color: '#60a5fa' },
      { id: 'trade-exit', type: 'custom', label: label.exit,
        price: trade.exitPrice, time: trade.exitTime, color: '#fbbf24' },
      ...(trade.slPrice ? [{ id: 'trade-sl', type: 'stop_loss' as const, label: 'SL', price: trade.slPrice, color: '#fb7185' }] : []),
      ...(trade.tpPrice ? [{ id: 'trade-tp', type: 'target' as const, label: 'TP', price: trade.tpPrice, color: '#34d399' }] : []),
    ];
    return rows.filter(row => Number.isFinite(row.price) && row.price > 0);
  }, [trade, label]);

  return <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#090d16]"
    data-replay-history-review>
    {candles.length > 0 && (
      <HookChart klines={candles} symbol={trade.symbol} exchange={trade.exchange}
        marketType={trade.marketType} timeframe={timeframe} markers={markers}
        replay replayReview onTimeframeChange={setTimeframe} timeframeDisabled={loading} />
    )}
    {loading && (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090d16]/90 text-xs text-slate-300" role="status">
        {label.loading}
      </div>
    )}
    {!loading && unavailable && (
      <div className="flex h-full items-center justify-center p-5 text-center text-xs text-amber-200" role="status">
        {label.error}
      </div>
    )}
  </div>;
}
