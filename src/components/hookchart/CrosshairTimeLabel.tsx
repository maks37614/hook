import React, { useMemo, useSyncExternalStore } from 'react';
import type { ChartCrosshairStore } from './crosshairState';

export const CrosshairTimeLabel = React.memo(function CrosshairTimeLabel({ store, plotWidth, timezone, language, seconds = false }: {
  store: ChartCrosshairStore; plotWidth: number; timezone: string; language: string; seconds?: boolean;
}) {
  const position = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const formatter = useMemo(() => new Intl.DateTimeFormat(language, {
    timeZone: timezone, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' as const } : {}),
    hour12: false,
  }), [timezone, language, seconds]);
  if (!position || !(plotWidth > 0)) return null;
  const text = formatter.format(position.time);
  const width = Math.min(plotWidth, Math.max(140, text.length * 6.5 + 16));
  const left = Math.max(0, Math.min(plotWidth - width, position.x - width / 2));
  return <span className="chartCrosshairTime" title={text} style={{ left, width }}>{text}</span>;
});
