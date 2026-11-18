import type { ExchangeId, Kline, MarketType, TerminalChartBlock } from '../../types';

export const MAX_ANALYSIS_MARKETS = 10;
export const CONTEXT_SECONDS = 86_400;
export type AnalysisTf = '1m' | '5m';
export type MarketAddress = { exchange: ExchangeId; marketType: MarketType; symbol: string };
export type ScenarioId = 'z5_level' | 'z5_sweep' | 'z4_cascade' | 'z4_line' | 'z4_reverse'
  | 'z4_trend' | 'z3_local' | 'z3_line' | 'z3_range' | 'z3_reject' | 'z3_distance'
  | 'z1_first' | 'z1_continue' | 'temka1' | 'temka2' | 'pump' | 'dump' | 'post_pump';
export type Regime = 'range' | 'up' | 'down' | 'pump' | 'dump' | 'post_pump' | 'chop';
export type EvidenceTag = 'volume' | 'delta_up' | 'delta_down' | 'oi_up' | 'density'
  | 'round' | 'consolidation' | 'exhaustion';
export type ChartEvidence = {
  manualLevels: number[];
  densityEnabled: boolean;
  densities: Array<{ price: number; side: 'ASK' | 'BID'; at: number; firstAt: number; usd: number }>;
  oi: Array<{ t: number; v: number }>;
};
export type MarketContext = {
  regime: Regime;
  coverageMinutes: number;
  volatilityPct: number;
  movementPct: number;
  h1: 'up' | 'down' | 'flat' | 'unavailable';
  h4: 'up' | 'down' | 'flat' | 'unavailable';
  /** A strict 24h window cannot establish a multi-day daily trend. */
  dailyTrendAvailable: false;
  priorTests: number;
  priorFailures: number;
};
export type ContextNotice = {
  kind: 'scenario';
  key: string;
  scenario: ScenarioId;
  zone: 1 | 2 | 3 | 4 | 5 | null;
  stage: 'info' | 'watch' | 'confirmed' | 'cancelled';
  side: 'up' | 'down' | 'neutral';
  level: number;
  mainLevel?: number;
  invalidateLevel: number;
  invalidateSide: 'above' | 'below';
  structureTf: AnalysisTf;
  triggerTf: AnalysisTf;
  observedAt: number;
  returnMinutes?: number;
  confirmation?: 'close' | 'wick_rebreak' | 'sweep_reclaim';
  context: MarketContext;
  evidence: EvidenceTag[];
};

export type ContextUpdate = {
  type: 'update'; scope: string; candles: Partial<Record<AnalysisTf, Kline>>; evidence: ChartEvidence; at: number;
  closedCandles?: Partial<Record<AnalysisTf, Kline>>;
};
export type ContextResult = { scope: string; notices: ContextNotice[]; needFast: boolean };
export type WorkerRequest =
  | { type: 'seed'; scope: string; tf: AnalysisTf; rows: Kline[]; at: number }
  | (ContextUpdate & { requestId: number })
  | { type: 'remove'; scope: string };
export type WorkerResponse = ContextResult & { requestId: number };

export function analysisMarketKey(market: MarketAddress): string {
  return [market.exchange, market.marketType, market.symbol.trim().toUpperCase()].join(':');
}

export function terminalNoticeChart(blocks: readonly TerminalChartBlock[], scope: string,
  notice: Pick<ContextNotice, 'triggerTf' | 'structureTf'> & { blockId?: string }): TerminalChartBlock | undefined {
  const matching = blocks.filter(block => analysisMarketKey(block) === scope);
  const original = matching.find(block => block.id === notice.blockId);
  for (const tf of [notice.triggerTf, notice.structureTf]) {
    if (original?.timeframe === tf) return original;
    const chart = matching.find(block => block.timeframe === tf);
    if (chart) return chart;
  }
  return original ?? matching[0];
}

export function terminalAnalysisAllowed(limit: number, chartCount: number): boolean {
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_ANALYSIS_MARKETS
    && Number.isInteger(chartCount) && chartCount >= 0 && chartCount <= MAX_ANALYSIS_MARKETS;
}
