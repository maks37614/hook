import { useEffect, useRef } from 'react';
import type { Kline, TerminalChartBlock } from '../types';
import { subscribeSharedKlines } from '../components/hookchart/sharedKlineStream';
import { fetchSharedHistoricalKlines, sharedHistoricalKlineKey } from './sharedHistoricalKlines';
import { createTimedRequestCache } from './sharedAnalysisKlines';
import { analysisMarketKey, terminalAnalysisAllowed, terminalNoticeChart, type ContextNotice } from './terminalAnalysis/model';
import { evidenceScope, readTerminalEvidence } from './terminalAnalysis/evidence';
import { startTerminalAnalysis, type AnalysisSession, type AnalysisWorker } from './terminalAnalysis/session';

export type TerminalLiveAlert = ContextNotice & {
  id: string;
  scope: string;
  symbol: string;
  exchange: TerminalChartBlock['exchange'];
  marketType: TerminalChartBlock['marketType'];
  timeframe: TerminalChartBlock['timeframe'];
  timestamp: number;
  blockId: string;
};

// Only public candles. No drawings, account evidence or decisions in this cache.
const warmHistory = createTimedRequestCache<Kline[]>(15_000, 20);

export function useTerminalLiveAlerts(
  enabled: boolean,
  blocks: readonly TerminalChartBlock[],
  onAlert: (alert: TerminalLiveAlert) => void,
  options: { configuredLimit: number; owner: string; onError: () => void; onHide: () => void },
): void {
  const active = enabled && blocks.length > 0 && terminalAnalysisAllowed(options.configuredLimit, blocks.length);
  const owner = options.owner;
  const sessionRef = useRef<AnalysisSession | null>(null);
  const latest = useRef({ active, blocks, onAlert, options });
  latest.current = { active, blocks, onAlert, options };
  useEffect(() => {
    if (!active) return;
    const isCurrent = () => latest.current.active && latest.current.options.owner === owner;
    const session = startTerminalAnalysis({
      blocks: latest.current.blocks, configuredLimit: latest.current.options.configuredLimit,
      visible: document.visibilityState !== 'hidden',
      onError: () => { if (isCurrent()) latest.current.options.onError(); },
      onNotice: (notice, market) => {
        if (!isCurrent() || document.visibilityState === 'hidden') return false;
        const scope = analysisMarketKey(market);
        const block = terminalNoticeChart(latest.current.blocks, scope, notice);
        if (!block) return false;
        latest.current.onAlert({ ...notice, id: scope + ':' + notice.key + ':' + notice.stage,
          scope, symbol: market.symbol, exchange: market.exchange, marketType: market.marketType,
          timeframe: notice.triggerTf, timestamp: notice.observedAt, blockId: block.id });
        return true;
      },
    }, {
      now: Date.now,
      createWorker: () => new Worker(new URL('./terminalAnalysis/terminalContext.worker.ts', import.meta.url),
        { type: 'module' }) as unknown as AnalysisWorker,
      history: (market, tf, limit) => {
        const request = { ...market, timeframe: tf, limit };
        return warmHistory.load(sharedHistoricalKlineKey(request), () => fetchSharedHistoricalKlines(request));
      },
      subscribe: (market, tf, onCandle) => subscribeSharedKlines({ ...market, timeframe: tf }, { onCandle }),
      evidence: (sources, at) => readTerminalEvidence(sources.map(b => evidenceScope(owner, b, b.timeframe)), at),
      later: (callback, ms) => setTimeout(callback, ms), cancel: clearTimeout,
    });
    sessionRef.current = session;
    const visibility = () => {
      const visible = document.visibilityState !== 'hidden';
      session.setVisible(visible);
      if (!visible && isCurrent()) latest.current.options.onHide();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      if (sessionRef.current === session) sessionRef.current = null;
      // This effect tears down when the user presses analysis OFF. Keep
      // third-party browser cleanup failures local to the optional monitor.
      try { session.stop(); } catch (error) {
        console.warn('Terminal analysis session cleanup failed:', error);
      }
    };
  }, [active, owner]);
  useEffect(() => {
    sessionRef.current?.setBlocks(blocks, options.configuredLimit);
  }, [blocks, options.configuredLimit]);
}
