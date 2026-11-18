import React from 'react';
import { Play, Pause, SkipForward, Shuffle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface ReplayFullscreenActionsProps {
  isPlaying: boolean;
  isLoading: boolean;
  canAdvance: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onRandomHistoricalDate: () => void;
}

/** Replay-only controls shown above HookChart when the chart is fullscreen. */
export function ReplayFullscreenActions({
  isPlaying,
  isLoading,
  canAdvance,
  onTogglePlay,
  onStepForward,
  onRandomHistoricalDate,
}: ReplayFullscreenActionsProps) {
  const { t } = useLanguage();
  const unavailable = isLoading || !canAdvance;

  return (
    <div className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5" role="group" aria-label={t("replay.chart.actions.group")}>
      <button type="button" onClick={onTogglePlay} disabled={unavailable}
        title={t(isPlaying ? 'replay.chart.actions.pauseTitle' : 'replay.chart.actions.playTitle')}
        aria-label={t(isPlaying ? 'replay.chart.actions.pause' : 'replay.chart.actions.play')}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          isPlaying
            ? 'border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
            : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
        }`}>
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button type="button" onClick={onStepForward} disabled={unavailable || isPlaying}
        title={t("replay.chart.actions.stepTitle")} aria-label={t("replay.chart.actions.step")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
        <SkipForward className="h-4 w-4" />
      </button>
      <button type="button" onClick={onRandomHistoricalDate} disabled={isLoading}
        title={t("replay.chart.actions.random")} aria-label={t("replay.chart.actions.random")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40">
        <Shuffle className="h-4 w-4" />
      </button>
    </div>
  );
}
