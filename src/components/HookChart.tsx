import { forwardRef, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import type { HookChartCanvasProps } from './hookchart/HookChartCanvas';
import type { HookChartHandle } from './hookchart/engine';

const Canvas = lazy(() => import('./hookchart/HookChartCanvas'));

export const HookChart = forwardRef<HookChartHandle, HookChartCanvasProps>(function HookChart(props, ref) {
  const { user } = useAuth();
  return <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-slate-400" role="status">Завантаження hookchart…</div>}>
    <Canvas key={`${user?.uid || 'guest'}:${props.exchange}:${props.marketType}:${props.symbol}:${props.timeframe}:${!!props.replay}`} {...props} ref={ref} />
  </Suspense>;
});
