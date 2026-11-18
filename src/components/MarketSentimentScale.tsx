import React, { useEffect, useState } from 'react';
import { translateKey, type SupportedLanguage } from '../locales';
import {
  clampSentimentScore,
  SENTIMENT_SEGMENTS,
  sentimentColorForScore,
} from '../utils/marketSentiment';

interface MarketSentimentScaleProps {
  score: number;
  sentimentLabel: string;
  language?: SupportedLanguage;
}

export { clampSentimentScore } from '../utils/marketSentiment';

/** Read-only market sentiment meter; the number is always supplied by the API. */
export const MarketSentimentScale: React.FC<MarketSentimentScaleProps> = ({ score, sentimentLabel, language = 'uk' }) => {
  // Pure translation keeps SSR, screenshots and standalone charts accessible
  // even without a mounted LanguageProvider. Callers pass the selected locale.
  const t = (key: string, params?: Record<string, string | number>) => translateKey(language, key, params);
  const actualScore = clampSentimentScore(score);
  // Start at the real score; never briefly paint a misleading 50/100.
  const [displayScore, setDisplayScore] = useState(actualScore);

  useEffect(() => {
    setDisplayScore(actualScore);
  }, [actualScore]);

  const markerPosition = clampSentimentScore(displayScore);
  const markerAccent = sentimentColorForScore(displayScore);
  const activeSegment = SENTIMENT_SEGMENTS.findIndex(s =>
    markerPosition >= s.start && (markerPosition < s.end || s.end === 100),
  );

  return (
    <div
      data-market-sentiment-scale
      className="mx-auto box-border w-full min-w-0 max-w-[900px] px-3 pb-2.5 pt-2 sm:px-4 sm:pb-3 md:py-2.5 xl:px-3 xl:pb-2 xl:pt-1.5"
      role="meter"
      aria-label={t('sentiment.meterAria')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={actualScore}
      aria-valuetext={t('sentiment.meterValue', { score: actualScore, label: sentimentLabel })}
    >
      {/* The bar and its score pointer share the same centered coordinate system. */}
      <div data-market-sentiment-track className="relative w-full py-1.5 xl:py-1">
        <div className="flex gap-[4px] sm:gap-[5px] xl:gap-[4px]" aria-hidden="true">
          {SENTIMENT_SEGMENTS.map((segment, index) => (
            <span
              key={segment.start}
              data-market-sentiment-segment
              className={`h-[19px] min-w-0 rounded-[5px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition-[filter,box-shadow] duration-300 xl:h-[12px] xl:rounded-[4px] ${index === activeSegment ? 'brightness-110 ring-1 ring-white/40' : ''}`}
              style={{
                backgroundColor: segment.color,
                flexGrow: segment.end - segment.start,
                flexBasis: 0,
              }}
            />
          ))}
        </div>

        {/* The small line always denotes the exact score, even at 0 and 100. */}
        <span
          data-market-sentiment-position
          className="pointer-events-none absolute top-1/2 z-[5] h-7 w-[2px] -translate-x-1/2 -translate-y-1/2 motion-safe:transition-[left,background-color] motion-safe:duration-1000 motion-safe:ease-out xl:h-[19px]"
          style={{ left: `${markerPosition}%`, backgroundColor: markerAccent }}
          aria-hidden="true"
        />
        <div
          data-market-sentiment-marker
          className="pointer-events-none absolute top-1/2 z-10 flex h-[29px] min-w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-[7px] border bg-[#091c24] px-2 font-mono text-[12px] font-bold motion-safe:transition-[left,border-color,color,box-shadow] motion-safe:duration-1000 motion-safe:ease-out sm:text-[13px] xl:h-[24px] xl:min-w-[64px] xl:rounded-[6px] xl:px-1.5 xl:text-[12px]"
          style={{
            left: `clamp(36px, ${markerPosition}%, calc(100% - 36px))`,
            borderColor: markerAccent,
            color: markerAccent,
            boxShadow: `0 0 12px ${markerAccent}66, inset 0 0 8px ${markerAccent}22`,
          }}
          aria-hidden="true"
        >
          <span>{Math.round(displayScore)}</span>
          <span className="text-slate-300">/100</span>
        </div>
      </div>
      {/* A three-column grid fixes the middle label at the true 50% center,
          regardless of translation length. Its outer edges match the bar. */}
      <div data-market-sentiment-labels className="mt-1 grid w-full grid-cols-3 items-center gap-2 text-[10px] font-medium text-slate-300 sm:text-[11px] xl:mt-0.5 xl:text-[10px]" aria-hidden="true">
        <span className="text-left text-red-400">{t('sentiment.fear')}</span>
        <span className="text-center">{t('sentiment.neutral')}</span>
        <span className="text-right text-emerald-400">{t('sentiment.greed')}</span>
      </div>
    </div>
  );
};
