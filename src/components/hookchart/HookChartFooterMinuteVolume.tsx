import React, { memo, useEffect, useState } from 'react';
import type { ExchangeId, MarketType } from '../../types';
import type { SupportedLanguage } from '../../locales';
import { fetchSharedChartJson } from '../../utils/sharedChartRequests';
import { sharedPublicChartPolling } from '../../utils/sharedPublicChartPolling';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { formatUsd } from './marketAnalytics';
import {
  expectedCompletedMinute, freshChartMinute, parseMinuteVolumeResponse, selectMinuteVolume,
  type MinuteVolume, type ReceivedMinuteVolume,
} from './avMinuteDisplay';

type Props = { exchange: ExchangeId; marketType: MarketType; symbol: string;
  language: SupportedLanguage; enabled: boolean; observedMinute: MinuteVolume | null };

const TOOLTIP: Record<SupportedLanguage, string> = {
  uk: 'Оборот у USDT за останню завершену хвилину на вибраній біржі (свічка 1m). Не обчислюється з 24h.',
  en: 'USDT turnover of the most recently completed 1m candle on the selected exchange. Not inferred from 24h.',
  pl: 'Obrót USDT ostatniej zamkniętej świecy 1m na wybranej giełdzie. Nie jest wyliczany z 24h.',
  ru: 'Оборот в USDT последней закрытой минутной свечи на выбранной бирже. Не вычисляется из 24h.',
};
const UNAVAILABLE: Record<SupportedLanguage, string> = {
  uk: 'Хвилинний оборот наразі недоступний. Перевірте з’єднання та дані біржі.',
  en: 'Minute turnover is currently unavailable. Check your connection and exchange data.',
  pl: 'Minutowy obrót jest obecnie niedostępny. Sprawdź połączenie i dane giełdowe.',
  ru: 'Минутный оборот сейчас недоступен. Проверьте соединение и данные биржи.',
};

/**
 * Isolated footer: updates never rerender candle canvas, change timeframes,
 * attach depth/trade sockets, or persist user settings.
 */
export const HookChartFooterMinuteVolume = memo(function HookChartFooterMinuteVolume({
  exchange, marketType, symbol, language, enabled, observedMinute,
}: Props) {
  const normalized = normalizeExchangeSymbol(symbol);
  const scope = [exchange, marketType, normalized].join(':');
  const [reading, setReading] = useState<{ scope: string; value: ReceivedMinuteVolume | null } | null>(null);
  const [clockMinute, setClockMinute] = useState(() => expectedCompletedMinute(Date.now()));

  // One minute-boundary timer per visible footer, not a second-by-second chart render.
  // This also catches a stopped 1m WebSocket: an old local candle must NOT
  // suppress the public fallback indefinitely.
  useEffect(() => {
    if (!enabled) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const advance = () => {
      if (!active) return;
      setClockMinute(expectedCompletedMinute(Date.now()));
      const nextBoundary = Math.floor((Date.now() - 3_000) / 60_000) * 60_000 + 63_100;
      timeout = setTimeout(advance, Math.max(1_000, nextBoundary - Date.now()));
    };
    advance();
    return () => { active = false; if (timeout !== undefined) clearTimeout(timeout); };
  }, [enabled]);

  const chartMinute = enabled ? freshChartMinute(observedMinute, Date.now()) : null;
  const needFallback = enabled && !chartMinute;
  useEffect(() => {
    if (!needFallback || !/^[A-Z0-9]{3,30}$/.test(normalized)) return;
    const params = new URLSearchParams({ exchange, market: marketType, symbol: normalized });
    return sharedPublicChartPolling.subscribe(['minute-volume', scope].join(':'),
      () => fetchSharedChartJson('/api/market/av1m/coin?' + params, 'minute-volume'), {
        onData: data => setReading({
          scope, value: parseMinuteVolumeResponse(data, Date.now()),
        }),
        onError: () => setReading({ scope, value: null }),
      }, 30_000);
  }, [needFallback, scope, exchange, marketType, normalized, clockMinute]);

  const value = enabled ? selectMinuteVolume(chartMinute, reading?.scope === scope ? reading.value : null, Date.now()) : null;
  const waiting = enabled && needFallback && (reading === null || reading.scope !== scope);
  const title = value ? `${TOOLTIP[language]} ${new Date(value.minuteStart).toLocaleTimeString()}`
    : `${TOOLTIP[language]} ${UNAVAILABLE[language]}`;
  return <span data-testid="hookchart-footer-av" title={title}>
    AV 1m: <b>{value ? `${formatUsd(value.volume1mUsd)}/min` : waiting ? '…' : '—'}</b>
  </span>;
});
