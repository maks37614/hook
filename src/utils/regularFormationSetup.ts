import type { DetectedFormation, Kline } from '../types';
import { formatCryptoPrice } from './formatters';
import { alignRegularPrice, assessRegularFormationPlan, buildRegularFormation, regularBreakoutLevel } from './regularFormationQuality';
import { analyzeRoundNumber } from './roundNumber';

export interface RegularSetupAdjustment {
  originalTarget: number;
  measuredTarget: number;
  atr14: number;
  tickVerified: boolean;
  reasons: Array<'ATR' | 'price range' | 'swing obstacle'>;
}

const valid = (n: number) => Number.isFinite(n) && n > 0;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-12, Math.abs(a) * 1e-9);

function previousObstacle(
  candles: Kline[], formation: DetectedFormation, entry: number, rawTarget: number, atr: number,
): number | null {
  const boundary = Math.max(0, Math.min(candles.length, formation.candleStartIndex ?? candles.length - 20));
  const old = candles.slice(Math.max(0, boundary - 60), boundary);
  if (old.length < 7) return null;
  const bullish = formation.bias === 'bullish';
  const nearest: number[] = [];
  const minimum = Math.max(atr * .6, entry * .0015);
  for (let i = 2; i < old.length - 2; i++) {
    const c = old[i];
    const swing = bullish ? c.high : c.low;
    const confirmed = bullish
      ? old.slice(i - 2, i + 3).every((x, j) => j === 2 || swing > x.high)
      : old.slice(i - 2, i + 3).every((x, j) => j === 2 || swing < x.low);
    if (!confirmed) continue;
    const distance = bullish ? swing - entry : entry - swing;
    if (distance > minimum && distance < Math.abs(rawTarget - entry)) nearest.push(distance);
  }
  return nearest.length ? Math.min(...nearest) : null;
}

/** One plan based on the causal trigger/retest, rounded against the trader. */
export function refineRegularFormationSetup(
  candles: Kline[], formation: DetectedFormation, tickSize: number | null = null,
): DetectedFormation {
  const base = buildRegularFormation(candles, formation, tickSize);
  const context = base.validation?.regularPlan;
  if (!context || formation.bias === 'neutral' || !valid(context.atr) || !base.validation?.lookAheadSafe)
    return assessRegularFormationPlan(base, base.levels);
  const { atr } = context;
  const { entryPrice: rawEntry, targetPrice: measuredTP, stopLossPrice: rawStop } = base.levels;
  const long = formation.bias === 'bullish';
  const direction = long ? 1 : -1;
  const entry = alignRegularPrice(rawEntry, tickSize, long ? 'up' : 'down');
  const retest = base.validation?.retestIndex;
  const retestBar = retest === undefined ? undefined : candles[retest];
  const sideLevel = long ? formation.levels.supportPrice : formation.levels.resistancePrice;
  const structure = retestBar ? (long ? retestBar.low : retestBar.high)
    : formation.patternKey === 'double_bottom' || formation.patternKey === 'double_top'
      ? (long
        ? Math.min(candles[formation.candleStartIndex ?? 0].low, candles[formation.structureEndIndex ?? 0].low)
        : Math.max(candles[formation.candleStartIndex ?? 0].high, candles[formation.structureEndIndex ?? 0].high))
      : sideLevel;
  const structuralStop = structure !== undefined && valid(structure)
    && (entry - structure) * direction > 0
    ? structure - direction * Math.max(tickSize ?? 0, atr * .12) : rawStop;
  const stop = alignRegularPrice(long ? Math.min(structuralStop, entry - atr * .65)
    : Math.max(structuralStop, entry + atr * .65), tickSize, long ? 'down' : 'up');
  const reward = (measuredTP - entry) * direction;
  const maxima: Array<{ reason: RegularSetupAdjustment['reasons'][number]; dist: number }> = [
    { reason: 'ATR', dist: atr * 3.2 }, { reason: 'price range', dist: entry * .045 },
  ];
  const obstacle = reward > 0 ? previousObstacle(candles, formation, entry, measuredTP, atr) : null;
  if (obstacle !== null) maxima.push({ reason: 'swing obstacle', dist: obstacle - atr * .15 });
  const maxDistance = Math.min(reward, ...maxima.map(row => row.dist));
  const target = alignRegularPrice(maxDistance > 0 ? entry + direction * maxDistance : measuredTP,
    tickSize, long ? 'down' : 'up');
  const reasons = maxima.filter(row => reward > row.dist && near(maxDistance, row.dist)).map(row => row.reason);
  const roundNumberContext = analyzeRoundNumber(candles, regularBreakoutLevel(formation));
  const oldLabel = '$' + formatCryptoPrice(measuredTP);
  const newLabel = '$' + formatCryptoPrice(target);
  return assessRegularFormationPlan({
    ...base, roundNumberContext,
    description: base.description.replaceAll(oldLabel, newLabel),
    regularSetupAdjustment: {
      originalTarget: measuredTP, measuredTarget: target, atr14: atr,
      tickVerified: valid(tickSize ?? 0), reasons,
    },
  }, { ...base.levels, entryPrice: entry, stopLossPrice: stop, targetPrice: target });
}

export function refineRegularFormationSet(
  candles: Kline[], formations: DetectedFormation[], tickSize: number | null = null,
): DetectedFormation[] {
  return formations.map(formation => refineRegularFormationSetup(candles, formation, tickSize))
    .sort((a, b) => Number(b.validation?.passed === true) - Number(a.validation?.passed === true)
      || (b.validation?.confluence?.total ?? b.confidence) - (a.validation?.confluence?.total ?? a.confidence));
}
