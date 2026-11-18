import React from 'react';
import type { ChartMarkerInfo, DetectedFormation, ExchangeId, Kline, MarketType, Timeframe } from '../types';
import { TradingViewChart } from './TradingViewChart';
import type { VisualChartProfile, VisualContextId } from './hookchart/visualProfiles';
import type { TerminalToolbarVisibility } from './hookchart/HookChartCanvas';
import type { ArchiveChartCapture } from '../utils/archiveChartSnapshot';

const EMPTY_HISTORY: Kline[] = [];

interface ExchangeCandlestickChartProps {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: string;
  historyLimit?: number;
  terminalMode?: boolean;
  /** Enable trade-derived 30s data in the single-panel Terminal without changing its HookChart layout. */
  terminalThirtySecondMode?: boolean;
  /** Use only native HookChart regardless of a legacy user provider setting. */
  forceHookChart?: boolean;
  terminalAutoScale?: boolean;
  terminalEcoMode?: boolean;
  /** Visual-only candle display cadence for the Terminal page. */
  terminalRefreshMs?: number;
  terminalActiveCharts?: number;
  terminalInitialView?: VisualChartProfile;
  terminalFitAllRequest?: number;
  visualContext?: VisualContextId;
  terminalToolbarVisibility?: TerminalToolbarVisibility;
  hookchartToolbarActions?: React.ReactNode;
  hookchartToolbarOverlays?: React.ReactNode;
  formation?: DetectedFormation | null;
  /** Explicitly selected Terminal formation markers, for this chart only. */
  customMarkers?: ChartMarkerInfo[];
  previewMarkers?: boolean;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  onLivePriceUpdate?: (price: number) => void;
  onAddToArchive?: (capture: ArchiveChartCapture) => void;
  isSavingArchive?: boolean;
}

export const ExchangeCandlestickChart: React.FC<ExchangeCandlestickChartProps> = ({
  symbol, exchange, marketType, timeframe, historyLimit = 1000, onTimeframeChange, onLivePriceUpdate,
  terminalMode, terminalThirtySecondMode, forceHookChart, terminalAutoScale, terminalEcoMode, terminalRefreshMs, terminalActiveCharts, terminalInitialView, terminalFitAllRequest, visualContext, terminalToolbarVisibility, hookchartToolbarActions, hookchartToolbarOverlays, formation, customMarkers, previewMarkers, onAddToArchive, isSavingArchive,
}) => (
  <div className="h-full w-full min-h-0" role="group" aria-label={`Графік ${symbol}`}>
    <TradingViewChart
      key={`${exchange}:${marketType}:${symbol}:${timeframe}`}
      klines={EMPTY_HISTORY}
      terminalMode={terminalMode}
      terminalThirtySecondMode={terminalThirtySecondMode}
      forceHookChart={forceHookChart}
      terminalAutoScale={terminalAutoScale}
      terminalEcoMode={terminalEcoMode}
      terminalRefreshMs={terminalRefreshMs}
      terminalActiveCharts={terminalActiveCharts}
      terminalInitialView={terminalInitialView}
      terminalFitAllRequest={terminalFitAllRequest}
      visualContext={visualContext}
      terminalToolbarVisibility={terminalToolbarVisibility}
      onAddToArchive={onAddToArchive}
      isSavingArchive={isSavingArchive}
      hookchartToolbarActions={hookchartToolbarActions}
      hookchartToolbarOverlays={hookchartToolbarOverlays}
      formation={formation}
      customMarkers={customMarkers}
      previewMarkers={previewMarkers}
      symbol={symbol}
      exchange={exchange}
      marketType={marketType}
      timeframe={timeframe}
      onTimeframeChange={onTimeframeChange}
      onLivePriceUpdate={onLivePriceUpdate}
      historyLimit={historyLimit}
      fullHeight
      showNavigationControls={false}
      hideSymbolAndPrice
    />
  </div>
);
