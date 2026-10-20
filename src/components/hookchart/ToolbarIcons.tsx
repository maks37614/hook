import React from 'react';

// Glyphs from the drawing and overlay toolbars in the supplied hookchart.
const common = { width: 16, height: 16, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.45,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };

export function FibIcon({ size = 16 }: { size?: number }) {
  return <svg {...common} width={size} height={size} strokeWidth={1.35}><path d="M3 3.25h12M3 6.15h12M3 9h12M3 11.85h12M3 14.75h12" opacity=".82" />
    <path d="M4 14.75L14 3.25" strokeWidth="1.65" /><circle cx="4" cy="14.75" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="14" cy="3.25" r="1.05" fill="currentColor" stroke="none" /></svg>;
}

export function IndicatorIcon() {
  return <svg {...common} strokeWidth={1.5}><path d="M2 13.5l3.2-4.2 3 2.1 3.2-6 4.6 2.2" />
    <path d="M2 15.5h14" opacity=".45" /><circle cx="11.4" cy="5.4" r="1.25" fill="currentColor" stroke="none" /></svg>;
}

export function OverlayIcon({ kind }: { kind: 'sr' | 'prevDay' | 'dayOpen' | 'vwap' | 'localHL' | 'roundLevels' | 'poc' | 'channel' | 'stops' }) {
  if (kind === 'sr') return <svg {...common}><path d="M2 4.5h14M2 9h14M2 13.5h14" /><circle cx="5" cy="4.5" r="1.25" fill="currentColor" stroke="none" /><circle cx="12.5" cy="13.5" r="1.25" fill="currentColor" stroke="none" /></svg>;
  if (kind === 'prevDay') return <svg {...common}><path d="M3 3.5h12M3 14.5h12M5 6v6M13 6v6" /><path d="M5 9h8" strokeDasharray="2 2" /></svg>;
  if (kind === 'dayOpen') return <svg {...common}><circle cx="4" cy="9" r="1.5" /><path d="M5.5 9H16" /><path d="M8 6.5V11.5" opacity=".45" /></svg>;
  if (kind === 'vwap') return <svg {...common}><path d="M2 11.5c2.2-3.8 4.1-4.3 6-2.1 2 2.3 4.2 2.1 8-3" /><path d="M3 15v-2M6 15v-3M9 15v-1.6M12 15v-4M15 15v-2.7" opacity=".7" /></svg>;
  if (kind === 'localHL') return <svg {...common}><path d="M2 12l3.2-5 3 3.2 3.1-5.2L16 11" /><circle cx="5.2" cy="7" r="1.1" fill="currentColor" stroke="none" /><circle cx="11.3" cy="5" r="1.1" fill="currentColor" stroke="none" /><path d="M3 14.5h12" opacity=".45" /></svg>;
  if (kind === 'roundLevels') return <svg {...common}><circle cx="9" cy="9" r="6" /><circle cx="9" cy="9" r="3.2" /><path d="M1.5 9h15M9 1.5v15" opacity=".65" /></svg>;
  if (kind === 'poc') return <svg {...common}><path d="M2 4.5h4M2 7.5h8M2 10.5h13M2 13.5h7" /><path d="M12 3v12" strokeWidth="1.9" /><circle cx="12" cy="10.5" r="1.5" fill="currentColor" stroke="none" /></svg>;
  if (kind === 'stops') return <svg {...common}><path d="M2 5h14M2 13h14" /><path d="M5 2v6M13 10v6" /><path d="M3.5 3.5L6.5 6.5M11.5 11.5l3 3" /><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" /></svg>;
  return <svg {...common}><path d="M2 13L15.5 5M2.5 8L16 0" /><path d="M3 10.5L15.5 3" strokeDasharray="2 2" opacity=".55" /></svg>;
}
