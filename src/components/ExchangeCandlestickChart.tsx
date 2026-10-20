import React from 'react';
import type { ExchangeId, MarketType, Kline, Timeframe, DetectedFormation } from '../types';
import { TradingViewChart } from './TradingViewChart';

const EMPTY_HISTORY: Kline[] = [];

interface ExchangeCandlestickChartProps {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: string;
  terminalMode?: boolean;
  hookchartToolbarActions?: React.ReactNode;
  hookchartToolbarOverlays?: React.ReactNode;
  formation?: DetectedFormation | null;
  onTimeframeChange?: (timeframe: Timeframe) => void;
}

export const ExchangeCandlestickChart: React.FC<ExchangeCandlestickChartProps> = ({
  symbol, exchange, marketType, timeframe, onTimeframeChange, terminalMode, hookchartToolbarActions, hookchartToolbarOverlays, formation,
}) => (
  <div className="h-full w-full min-h-0" role="group" aria-label={`Графік ${symbol}`}>
    <TradingViewChart
      key={`${exchange}:${marketType}:${symbol}:${timeframe}`}
      klines={EMPTY_HISTORY}
      terminalMode={terminalMode}
      hookchartToolbarActions={hookchartToolbarActions}
      hookchartToolbarOverlays={hookchartToolbarOverlays}
      formation={formation}
      symbol={symbol}
      exchange={exchange}
      marketType={marketType}
      timeframe={timeframe}
      onTimeframeChange={onTimeframeChange}
      historyLimit={1000}
      fullHeight
      showNavigationControls={false}
      hideSymbolAndPrice
    />
  </div>
);

