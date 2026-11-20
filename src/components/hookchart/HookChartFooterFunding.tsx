import React, { memo, useEffect, useState } from 'react';
import type { ExchangeId, MarketType } from '../../types';
import { translatePhrase, type SupportedLanguage } from '../../locales';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { subscribeSharedHookChartFunding } from './sharedFundingStream';

type Props = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  language: SupportedLanguage;
};

export function formatFooterFundingRate(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  return `${rate > 0 ? '+' : ''}${(rate * 100).toFixed(4)}%`;
}

/**
 * Shared HookChart footer statistic. An independent memoized component keeps
 * minute-scale funding updates from re-rendering candles or chart interaction.
 *
 * One subscribed exchange + instrument only; spot and archived/replay charts
 * never create a funding subscription. The shared funding service deduplicates
 * an identical subscription from a strategy or another chart in the same tab.
 */
export const HookChartFooterFunding = memo(function HookChartFooterFunding({
  exchange, marketType, symbol, language,
}: Props) {
  const normalizedSymbol = normalizeExchangeSymbol(symbol);
  const scope = `${exchange}:${marketType}:${normalizedSymbol}`;
  const [reading, setReading] = useState<{ scope: string; rate: number } | null>(null);

  useEffect(() => {
    if (marketType !== 'futures' || !isValidExchangeSymbol(normalizedSymbol)) return;
    return subscribeSharedHookChartFunding(exchange, normalizedSymbol, snapshot => {
      setReading(previous =>
        previous?.scope === scope && Object.is(previous.rate, snapshot.rate)
          ? previous : { scope, rate: snapshot.rate });
    });
  }, [exchange, marketType, normalizedSymbol, scope]);

  const rate = marketType === 'futures' && reading?.scope === scope
    ? reading.rate : Number.NaN;
  const label = translatePhrase(language,
    exchange === 'binance' ? 'Фандинг Binance:' : 'Фандинг Bybit:');
  const title = translatePhrase(language, marketType === 'spot'
    ? 'На спотовому ринку фандинг відсутній.'
    : 'Ставка фандингу вибраної біржі для безстрокових ф’ючерсів.');

  return (
    <span data-testid="hookchart-footer-funding" title={title}>
      {label} <b>{formatFooterFundingRate(rate)}</b>
    </span>
  );
});
