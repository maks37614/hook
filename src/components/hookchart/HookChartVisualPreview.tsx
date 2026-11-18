import React, { useMemo } from 'react';
import { createSyntheticPreviewCandles } from './syntheticPreviewCandles';
import { VISUAL_GAP_MAX, type VisualChartProfile } from './visualProfiles';

interface HookChartVisualPreviewProps {
  profile: VisualChartProfile;
  longColor?: string;
  shortColor?: string;
}

const WIDTH = 420;
const HEIGHT = 166;
const PLOT = 344;
const TOP = 9;
const BOTTOM = 148;

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/**
 * Light, non-interactive schematic of the saved HookChart viewport.
 * No chart engine, pointer listeners, observers, WebSockets, polling or fetch.
 * The actual HookChart applies the saved values on its own screen dimensions.
 */
export function HookChartVisualPreview({
  profile, longColor = '#0ECB81', shortColor = '#F6465D',
}: HookChartVisualPreviewProps) {
  // Deterministic synthetic values are created only while the settings tab is open.
  const candles = useMemo(() => createSyntheticPreviewCandles(560), []);
  const geometry = useMemo(() => {
    const visible = Math.max(15, Math.min(500, Math.round(profile.visibleBars)));
    const rightGap = Math.max(0, Math.min(VISUAL_GAP_MAX, Math.round(profile.rightGapBars)));
    const view = candles.slice(-visible);
    const naturalLow = Math.min(...view.map(c => c.l));
    const naturalHigh = Math.max(...view.map(c => c.h));
    const middle = (naturalLow + naturalHigh) / 2;
    const zoom = profile.autoPriceScale ? 1 : clamp(profile.verticalZoom, .01, 100);
    const range = Math.max((naturalHigh - naturalLow) / zoom, 1);
    const step = PLOT / (visible + rightGap);
    const gapPixels = rightGap * step;
    const gapStart = PLOT - gapPixels;
    const stride = Math.max(1, Math.ceil(view.length / 110));
    const y = (price: number) => clamp(
      (TOP + BOTTOM) / 2 - ((price - middle) / range) * (BOTTOM - TOP) * .88,
      TOP, BOTTOM,
    );
    return {
      visible, rightGap, step, gapPixels, gapStart,
      bodies: view.flatMap((c, index) => {
        if (index % stride !== 0) return [];
        const x = (index + .5) * step;
        if (x >= PLOT) return [];
        const open = y(c.o), close = y(c.c);
        return [{
          x, hi: y(c.h), lo: y(c.l),
          top: Math.min(open, close), bottom: Math.max(open, close),
          rising: c.c >= c.o,
          width: Math.max(.7, Math.min(8, step * stride * .66)),
        }];
      }),
    };
  }, [candles, profile.visibleBars, profile.rightGapBars, profile.verticalZoom, profile.autoPriceScale]);

  return (
    <div className="hookchart-mini-preview" data-synthetic-hookchart="true" data-right-gap-bars={geometry.rightGap}>
      <div className="hookchart-mini-title">
        <span>Штучні свічки · без підключень до бірж</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%"
        role="img" aria-label="Маленький штучний графік для попереднього перегляду масштабу та відступів"
        focusable="false" preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', width: '100%', height: 'auto' }}>
        <rect width={WIDTH} height={HEIGHT} fill="#0d1523" rx="7" />
        {[.25, .5, .75].map(p => (
          <line key={p} x1="0" y1={TOP + (BOTTOM - TOP) * p} x2={PLOT}
            y2={TOP + (BOTTOM - TOP) * p} stroke="#253449" strokeWidth=".7" />
        ))}
        {geometry.rightGap > 0 && <>
          <rect x={geometry.gapStart} y={TOP} width={geometry.gapPixels} height={BOTTOM - TOP}
            fill="#22d3ee" fillOpacity=".12" />
          <line x1={geometry.gapStart} x2={geometry.gapStart} y1={TOP} y2={BOTTOM}
            stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="4 3" strokeOpacity=".85" />
        </>}
        <line x1={PLOT} y1="0" x2={PLOT} y2={HEIGHT} stroke="#34475e" strokeWidth="1" />
        {geometry.bodies.map((c, i) => (
          <g key={i} fill={c.rising ? longColor : shortColor}
            stroke={c.rising ? longColor : shortColor}>
            <line x1={c.x} x2={c.x} y1={c.hi} y2={c.lo} strokeWidth=".8" />
            <rect x={c.x - c.width / 2} y={c.top}
              width={c.width} height={Math.max(1, c.bottom - c.top)} stroke="none" />
          </g>
        ))}
        <text x={PLOT + 7} y="22" fontSize="10" fill="#9ab2c8">Масштаб</text>
        <text x={PLOT + 7} y="39" fontSize="11" fontWeight="700" fill="#bfe7fb">
          {profile.autoPriceScale ? 'AUTO' : `×${profile.verticalZoom}`}
        </text>
        <text x={PLOT + 7} y={HEIGHT - 19} fontSize="9" fill="#8fa6bf">
          {geometry.rightGap} бар.
        </text>
        <text x="7" y={HEIGHT - 7} fontSize="9" fill="#8299b5">
          {geometry.visible} видимих барів · умовний ціновий діапазон
        </text>
      </svg>
      <div className="hookchart-mini-gap-status" role="status" aria-live="polite">
        Вільний простір праворуч: <strong>{geometry.rightGap} барів</strong>
        <span> · {Math.round(geometry.gapPixels / PLOT * 100)}% ширини схеми</span>
      </div>
      <p className="hookchart-mini-note">
        Це схематичний перегляд. Під час зміни повзунка підсвічена зона та кількість вільних барів
        оновлюються одразу. На реальному HookChart масштаб залежить від ширини екрана й обраного типу графіка.
      </p>
    </div>
  );
}
