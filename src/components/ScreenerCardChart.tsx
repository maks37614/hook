import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, X } from 'lucide-react';
import type { Kline, MarketCoin, Timeframe } from '../types';
import { formatCryptoPrice } from '../utils/formatters';
import { fetchSharedHistoricalKlines } from '../utils/sharedHistoricalKlines';
import { getStoredPreferences } from '../utils/userPreferences';
import { useLanguage } from '../context/LanguageContext';
import { ScreenerCopySymbolButton } from './ScreenerCopySymbolButton';
import { TradingViewChart } from './TradingViewChart';

interface ScreenerCardChartProps {
  coin: MarketCoin;
  onClose: () => void;
  onOpenDetails: () => void;
}

/**
 * The Screener creates this component ONLY for the one card opened by a user.
 * It uses the same TradingViewChart / HookChart renderer, appearance profile,
 * market scope, shared public history and live candle feeds as the full chart.
 * No chart connections or history requests are created for closed cards.
 */
export const ScreenerCardChart: React.FC<ScreenerCardChartProps> = ({ coin, onClose, onOpenDetails }) => {
  const { t } = useLanguage();
  const [timeframe, setTimeframe] = useState<Timeframe>(() => getStoredPreferences().defaultTimeframe);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadedScope, setLoadedScope] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [livePrice, setLivePrice] = useState(coin.price);
  const scope = [coin.exchange, coin.marketType, coin.symbol, timeframe].join('|');
  const ready = loadedScope === scope && klines.length > 0;

  useEffect(() => {
    let cancelled = false;
    setKlines([]);
    setLoadedScope('');
    setLoading(true);
    setFailed(false);
    void fetchSharedHistoricalKlines({
      exchange: coin.exchange,
      marketType: coin.marketType,
      symbol: coin.symbol,
      timeframe,
      limit: 200,
    }).then((rows) => {
      if (cancelled) return;
      if (!rows.length) {
        setFailed(true);
        return;
      }
      setKlines(rows);
      setLoadedScope(scope);
      setLivePrice(rows[rows.length - 1].close);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [coin.exchange, coin.marketType, coin.symbol, timeframe, scope, retry]);

  return (
    <div data-screener-card-chart className="flex h-full min-h-0 w-full min-w-0 flex-col" onClick={(event) => event.stopPropagation()}>
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-1 border-b border-slate-800/80 px-1 pb-1.5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span data-no-translate className="truncate font-mono text-xs font-bold text-slate-100" title={coin.symbol}>
            {coin.baseAsset}/{coin.quoteAsset}
          </span>
          <ScreenerCopySymbolButton symbol={coin.symbol} />
          <span data-exchange={coin.exchange} className="site-exchange-badge site-exchange-badge--compact shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase">
            {coin.exchange}
          </span>
          <span className="min-w-0 truncate font-mono text-[11px] font-bold text-cyan-400" title={String(livePrice)}>
            ${formatCryptoPrice(livePrice)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenDetails}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-1.5 text-cyan-300 hover:bg-cyan-500/20"
            title={t('screener.main.cardChartDetails')}
            aria-label={t('screener.main.cardChartDetails')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20"
            title={t('screener.main.cardChartClose')}
            aria-label={t('screener.main.cardChartClose')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        {ready ? (
          <TradingViewChart
            klines={klines}
            historyManagedByParent
            historyLimit={200}
            symbol={coin.symbol}
            timeframe={timeframe}
            exchange={coin.exchange}
            marketType={coin.marketType}
            visualContext="screenerQuick"
            // Card-only layout: timeframe buttons move into HookChart's footer.
            compactScreenerCard
            forceHookChart
            showNavigationControls={false}
            fullHeight
            onTimeframeChange={setTimeframe}
            onLivePriceUpdate={setLivePrice}
          />
        ) : (
          <div role="status" aria-live="polite" className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
            {failed && !loading ? (
              <>
                <span className="text-[11px] text-amber-300">{t('screener.main.cardChartError')}</span>
                <button
                  type="button"
                  onClick={() => setRetry(value => value + 1)}
                  className="rounded-lg border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/10"
                >
                  {t('screener.main.cardChartRetry')}
                </button>
              </>
            ) : (
              <>
                <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin text-cyan-400" />
                <span className="text-[11px] text-slate-400">{t('screener.main.cardChartLoading')}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
