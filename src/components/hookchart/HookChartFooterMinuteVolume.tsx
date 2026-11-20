import React, { memo, useEffect, useState } from 'react';
import type { ExchangeId, MarketType } from '../../types';
import type { SupportedLanguage } from '../../locales';
import { fetchSharedChartJson } from '../../utils/sharedChartRequests';
import { sharedPublicChartPolling } from '../../utils/sharedPublicChartPolling';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { formatUsd } from './marketAnalytics';

type Reading = { scope: string; minuteStart: number; volume1mUsd: number | null };
type Props = { exchange: ExchangeId; marketType: MarketType; symbol: string;
  language: SupportedLanguage; enabled: boolean; observedMinute: { minuteStart: number; volume1mUsd: number } | null };
const TOOLTIP: Record<SupportedLanguage, string> = {
  uk: 'Фактичний оборот у USDT за останню завершену хвилину (свічка 1m). Не розраховується з 24-годинного обсягу.',
  en: 'Actual USDT turnover in the most recently completed 1-minute candle. Never calculated from 24h turnover.',
  pl: 'Rzeczywisty obrót USDT z ostatniej zamkniętej świecy 1-minutowej. Nie jest liczony z obrotu 24 h.',
  ru: 'Фактический оборот USDT за последнюю закрытую минутную свечу. Не рассчитывается из объёма за 24 часа.',
};

/** Footer-only public reading: isolated from HookChart candles and interaction redraws. */
export const HookChartFooterMinuteVolume = memo(function HookChartFooterMinuteVolume({
  exchange, marketType, symbol, language, enabled, observedMinute,
}: Props) {
  const normalized = normalizeExchangeSymbol(symbol);
  const scope = [exchange, marketType, normalized].join(':');
  const [reading, setReading] = useState<Reading | null>(null);
  useEffect(() => {
    if (!enabled || observedMinute !== null || !/^[A-Z0-9]{3,30}$/.test(normalized)) return;
    const params = new URLSearchParams({exchange, market:marketType, symbol:normalized});
    return sharedPublicChartPolling.subscribe(['minute-volume',scope].join(':'),
      () => fetchSharedChartJson('/api/market/av1m/coin?' + params), {
      onData: data => setReading({scope,
        minuteStart: Number.isFinite(data.minuteStart) ? data.minuteStart : 0,
        volume1mUsd: data.success && typeof data.volume1mUsd === 'number' &&
          Number.isFinite(data.volume1mUsd) && data.volume1mUsd >= 0 ? data.volume1mUsd : null,
      }),
      onError: () => setReading({scope,minuteStart:0,volume1mUsd:null}),
    }, 30_000);
  }, [enabled, observedMinute !== null, scope, exchange, marketType, normalized]);
  const current = enabled ? observedMinute ?? (reading?.scope === scope ? reading : null) : null;
  // An expired minute is not a valid reading; avoid stale symbols when changing charts.
  const valid = current && current.minuteStart > Date.now() - 180_000
    && current.minuteStart <= Date.now() && typeof current.volume1mUsd === 'number';
  return <span data-testid="hookchart-footer-av" title={TOOLTIP[language]}>
    AV 1m: <b>{valid ? `${formatUsd(current!.volume1mUsd!)}/min` : '—'}</b>
  </span>;
});
