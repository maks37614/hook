import type { DetectedFormation, Kline, ScannedCoin, Timeframe } from '../types';
import { countWickTouches } from './wickTouchEvidence';
import type { WickTouchBar } from './wickTouchEvidence';
export { countWickTouches, sampleWickTouches } from './wickTouchEvidence';
export type { WickTouchBar } from './wickTouchEvidence';
import type { EarlyFormationCandidate } from './earlyFormations';
import { alignEarlyFormationToTick, evaluateEarlyTradePlans } from './earlyFormations';
import { alignRegularPrice, assessRegularFormationPlan } from './regularFormationQuality';

/** All settings are stored on users/{uid}; the shared scan/cache never sees them. */
export interface TpSlRule {
  entryAtrOffset: number;
  stopAtrBuffer: number;
  targetRiskReward: number;
  /** Optional independent ATR shift from the scanner's original target.
   * Unlike risk/reward mode, moving Entry or SL does not move this TP. */
  targetAtrOffset?: number;
  /** Only recalibrate price levels when explicitly enabled; touch filters are independent. */
  customLevelsEnabled: boolean;
  lowTouches: number;
  highTouches: number;
  touchTolerancePct: number;
  minTouchGap: number;
  requireRejection: boolean;
}
export interface TpSlConstructorSettings {
  version: 1;
  enabled: boolean;
  rules: Record<string, TpSlRule>;
  /** Optional symbol+pattern overrides; stored in rules._coins for legacy v1 compatibility. */
  coinRules?: Record<string, TpSlRule>;
}
export interface TpSlTouchState {
  count: number;
  required: number;
  ready: boolean;
  /** false if the scan did not provide enough wick evidence to verify contacts. */
  verified: boolean;
}
export const TP_SL_DEFAULT_RULE: TpSlRule = {
  entryAtrOffset: 0, stopAtrBuffer: 0, targetRiskReward: 2,
  customLevelsEnabled: false,
  lowTouches: 2, highTouches: 2, touchTolerancePct: .3,
  minTouchGap: 3, requireRejection: true,
};
export const TP_SL_DISABLED: TpSlConstructorSettings = { version: 1, enabled: false, rules: {} };
export const TP_SL_PATTERNS = [
  ['double_bottom', 'Подвійне дно (W)'], ['double_top', 'Подвійна вершина (M)'],
  ['asc_triangle', 'Висхідний трикутник'], ['desc_triangle', 'Низхідний трикутник'],
  ['bull_flag', 'Бичачий прапор'], ['bear_flag', 'Ведмежий прапор'],
  ['level_breakout', 'Пробій ключового рівня'], ['volatility_squeeze', 'Стиснення волатильності'],
  ['hammer', 'Молот'], ['shooting_star', 'Падаюча зірка'],
  ['bull_engulfing', 'Бичаче поглинання'], ['bear_engulfing', 'Ведмеже поглинання'],
] as const;
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const COIN_RULES_KEY = '_coins';
const MAX_COIN_RULES = 512;
const validPattern = new Set<string>(TP_SL_PATTERNS.map(([id]) => id));
/** One symbol+pattern key. Same pair follows the user across Binance/Bybit and spot/futures. */
export function tpSlCoinRuleKey(symbol: string, pattern: string): string | null {
  const normalized = symbol.trim().toUpperCase();
  return /^[A-Z0-9]{2,24}$/.test(normalized) && validPattern.has(pattern)
    ? `${normalized}__${pattern}` : null;
}
function validCoinKey(key: string): boolean {
  const match = /^([A-Z0-9]{2,24})__([a-z_]+)$/.exec(key);
  return !!match && tpSlCoinRuleKey(match[1], match[2]) === key;
}
function readCoinRules(input: TpSlConstructorSettings | undefined | null): Record<string, TpSlRule> {
  if (!input) return {};
  const embedded = (input.rules as unknown as Record<string, unknown> | undefined)?.[COIN_RULES_KEY];
  const raw = input.coinRules || embedded;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const rules: Record<string, TpSlRule> = {};
  for (const [key, value] of Object.entries(raw).slice(0, MAX_COIN_RULES)) {
    if (validCoinKey(key) && value && typeof value === 'object' && !Array.isArray(value))
      rules[key] = normalizeTpSlRule(value as Partial<TpSlRule>);
  }
  return rules;
}
/** Global pattern fallback; specific symbol rules take precedence when present. */
export function getTpSlRule(settings: TpSlConstructorSettings | undefined | null, symbol: string, pattern: string): TpSlRule | undefined {
  if (!settings?.enabled) return undefined;
  const coinKey = tpSlCoinRuleKey(symbol, pattern);
  const rawCoinRules = settings.coinRules || (settings.rules as unknown as Record<string, unknown>)?.[COIN_RULES_KEY];
  const bySymbol = coinKey && rawCoinRules && typeof rawCoinRules === 'object'
    ? (rawCoinRules as Record<string, TpSlRule>)[coinKey] : undefined;
  const global = settings.rules?.[pattern];
  const raw = bySymbol || global;
  return raw && typeof raw === 'object' ? normalizeTpSlRule(raw) : undefined;
}
/** The legacy v1 root settings schema allows ONLY version/enabled/rules and <=32 root rules.
 * Nest the bounded per-coin map under one reserved rules key, avoiding any migration/deploy. */
export function serializeTpSlSettings(input: TpSlConstructorSettings): TpSlConstructorSettings {
  const safe = normalizeTpSlSettings(input);
  const { coinRules, ...root } = safe;
  const rules: Record<string, unknown> = { ...root.rules };
  if (coinRules && Object.keys(coinRules).length) rules[COIN_RULES_KEY] = coinRules;
  return { ...root, rules: rules as Record<string, TpSlRule> };
}
export function normalizeTpSlRule(input: Partial<TpSlRule> | undefined): TpSlRule {
  return {
    // No artificial ATR/R:R caps: draggable levels may be anywhere above price zero.
    entryAtrOffset: finite(input?.entryAtrOffset, 0),
    stopAtrBuffer: finite(input?.stopAtrBuffer, 0),
    targetRiskReward: finite(input?.targetRiskReward, 2),
    ...(typeof input?.targetAtrOffset === 'number' && Number.isFinite(input.targetAtrOffset)
      ? { targetAtrOffset: input.targetAtrOffset } : {}),
    customLevelsEnabled: input?.customLevelsEnabled === true,
    lowTouches: Math.round(clamp(input?.lowTouches, 2, 1, 6)),
    highTouches: Math.round(clamp(input?.highTouches, 2, 1, 6)),
    touchTolerancePct: clamp(input?.touchTolerancePct, .3, .05, 2),
    minTouchGap: Math.round(clamp(input?.minTouchGap, 3, 1, 15)),
    requireRejection: typeof input?.requireRejection === 'boolean' ? input.requireRejection : true,
  };
}
export function normalizeTpSlSettings(input: TpSlConstructorSettings | undefined | null): TpSlConstructorSettings {
  if (!input || input.version !== 1) return TP_SL_DISABLED;
  const rules: Record<string, TpSlRule> = {};
  for (const [key, raw] of Object.entries(input.rules || {})) {
    if (validPattern.has(key) && raw && typeof raw === 'object' && !Array.isArray(raw))
      rules[key] = normalizeTpSlRule(raw);
  }
  const coinRules = readCoinRules(input);
  return { version: 1, enabled: input.enabled === true, rules,
    ...(Object.keys(coinRules).length ? { coinRules } : {}) };
}
function touchState(bars: readonly WickTouchBar[] | undefined, level: number, side: 'low' | 'high', rule: TpSlRule): TpSlTouchState {
  const required = side === 'low' ? rule.lowTouches : rule.highTouches;
  const verified = Array.isArray(bars) && Number.isFinite(level) && level > 0;
  const count = verified && bars ? countWickTouches(bars, level, side, rule) : 0;
  return { count, required, ready: verified && count >= required, verified };
}
const round = (value: number) => Number(value.toPrecision(10));

function applyRegularTouchGate(formation: DetectedFormation): DetectedFormation {
  const validation = formation.validation;
  const touches = formation.tpSlBuilder?.touches;
  if (!validation?.regularPlan || !touches || touches.ready) return formation;
  const confluence = validation.confluence;
  const reason = 'Дотики за правилами профілю ще не підтверджено';
  return { ...formation, statusLabel: validation.passed ? reason : formation.statusLabel,
    validation: { ...validation, passed: false, rejectionReasons: [...validation.rejectionReasons, reason],
      confluence: confluence?.flow ? { ...confluence, flow: { ...confluence.flow, entryConfirmedWithFlow: false } } : confluence },
  };
}

/** Pure user-specific projection. Disabled/missing rule returns EXACT SAME reference. */
export function resolveFormationTpSl(source: DetectedFormation, settings?: TpSlConstructorSettings | null, symbol = ''): DetectedFormation {
  const automaticLevels = source.tpSlBuilder?.automaticLevels;
  const formation = automaticLevels
    ? assessRegularFormationPlan({ ...source, tpSlBuilder: undefined }, automaticLevels) : source;
  const rule = getTpSlRule(settings, symbol, formation.patternKey);
  if (!rule || formation.bias === 'neutral') return formation;
  const direction = formation.bias === 'bullish' ? 1 : -1;
  const original = formation.levels;
  const ref = direction > 0 ? original.supportPrice : original.resistancePrice;
  const touches = formation.patternKey === 'double_bottom' || formation.patternKey === 'double_top'
    ? touchState(formation.wickTouchBars, ref ?? Number.NaN,
      direction > 0 ? 'low' : 'high', rule)
    : undefined;
  const regularPlan = formation.validation?.regularPlan;
  const base = { ...formation, tpSlBuilder: { source: 'custom' as const, touches,
    ...(regularPlan ? { automaticLevels: original } : {}) } };
  // Touch-only presets must NOT rewrite the scanner's original TP/SL or R:R.
  if (!rule.customLevelsEnabled) return applyRegularTouchGate(base);
  const atr = regularPlan?.atr ?? (formation.validation?.atrPct ?? 0) / 100 * original.entryPrice;
  if (!(atr > 0) || ![original.entryPrice, original.targetPrice, original.stopLossPrice].every(Number.isFinite))
    return applyRegularTouchGate({ ...base, tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'invalid' as const } });
  const tick = regularPlan?.tickSize;
  const entryRaw = original.entryPrice + direction * atr * rule.entryAtrOffset;
  const stopRaw = original.stopLossPrice - direction * atr * rule.stopAtrBuffer;
  const entry = tick ? alignRegularPrice(entryRaw, tick, direction > 0 ? 'up' : 'down') : round(entryRaw);
  const stop = tick ? alignRegularPrice(stopRaw, tick, direction > 0 ? 'down' : 'up') : round(stopRaw);
  const risk = direction * (entry - stop);
  const targetRaw = rule.targetAtrOffset === undefined
    ? entry + direction * risk * rule.targetRiskReward
    : original.targetPrice + direction * atr * rule.targetAtrOffset;
  const target = tick ? alignRegularPrice(targetRaw, tick, direction > 0 ? 'down' : 'up') : round(targetRaw);
  if (!(Number.isFinite(entry) && Number.isFinite(stop) && Number.isFinite(target)
    && entry > 0 && stop > 0 && target > 0 && risk > 0
    && direction * (target - entry) > 0))
    return applyRegularTouchGate({ ...base, tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'invalid' as const } });
  const levels = { ...original, entryPrice: entry, targetPrice: target, stopLossPrice: stop };
  if (regularPlan) return applyRegularTouchGate(assessRegularFormationPlan({
    ...base, tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'applied' },
  }, levels));
  return {
    ...base,
    levels,
    potentialProfitPct: Number((Math.abs(target - entry) / entry * 100).toFixed(2)),
    potentialRiskPct: Number((Math.abs(entry - stop) / entry * 100).toFixed(2)),
    riskRewardRatio: Number((Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2)),
    tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'applied' },
  };
}

/** Early W/M remains unconfirmed, even with user-projected levels. */
export function resolveEarlyTpSl(candidate: EarlyFormationCandidate, settings?: TpSlConstructorSettings | null, symbol = ''): EarlyFormationCandidate {
  const rule = getTpSlRule(settings, symbol, candidate.patternKey);
  if (!rule) return candidate;
  const dir = candidate.bias === 'bullish' ? 1 : -1;
  const touches = touchState(candidate.wickTouchBars, candidate.firstPivot,
    dir > 0 ? 'low' : 'high', rule);
  const base = { ...candidate, tpSlBuilder: { source: 'custom' as const, touches } };
  if (!rule.customLevelsEnabled) return base;
  const atr = (candidate.earlyEntryMax - candidate.earlyEntryMin) / .86;
  if (!(atr > 0)) return { ...base, tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'invalid' as const } };
  const offset = dir * atr * rule.entryAtrOffset;
  const earlyMin = round(candidate.earlyEntryMin + offset);
  const earlyMax = round(candidate.earlyEntryMax + offset);
  const earlyStop = round(candidate.stopLoss - dir * atr * rule.stopAtrBuffer);
  const breakoutEntry = round(candidate.breakoutEntry + offset);
  const breakoutStop = round(candidate.breakoutStopLoss - dir * atr * rule.stopAtrBuffer);
  const worstEntry = dir > 0 ? earlyMax : earlyMin;
  const risk = dir * (worstEntry - earlyStop);
  const target = round(rule.targetAtrOffset === undefined
    ? worstEntry + dir * risk * rule.targetRiskReward
    : candidate.target + dir * atr * rule.targetAtrOffset);
  const projected = { ...base, earlyEntryMin: earlyMin, earlyEntryMax: earlyMax,
    stopLoss: earlyStop, breakoutEntry, breakoutStopLoss: breakoutStop, target };
  // Preserve the existing exchange PRICE_FILTER invariant for early W/M.
  const aligned = candidate.tickVerified === true && candidate.tickSize
    ? alignEarlyFormationToTick(projected, candidate.tickSize)
    : projected;
  const geometry = aligned && evaluateEarlyTradePlans(aligned.bias,
    aligned.earlyEntryMin, aligned.earlyEntryMax, aligned.stopLoss,
    aligned.neckline, aligned.breakoutEntry, aligned.breakoutStopLoss, aligned.target);
  // Invalid custom price geometry must never disable the independent wick gate.
  if (!geometry || !aligned) return { ...base, tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'invalid' as const } };
  return {
    ...aligned, ...geometry, tpSlBuilder: { ...base.tpSlBuilder, levelStatus: 'applied' },
  };
}
const LIVE_TIMEFRAME_SECONDS: Record<Timeframe, number> = { '30s': 30,
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14_400, '1d': 86_400,
};

/** Incrementally update a visible early W/M preview from an ALREADY EXISTING chart feed.
 * Called once per newly CLOSED candle. Does not fetch, poll, subscribe, or
 * convert the candidate into a confirmed formation. Shared scans stay immutable. */
export function applyClosedEarlyWickTouch(
  candidate: EarlyFormationCandidate, candle: Kline, timeframe: Timeframe, configured: TpSlRule,
): EarlyFormationCandidate {
  if (!candidate.tpSlBuilder || !candidate.wickTouchBars ||
    !candidate.tpSlBuilder.touches.verified ||
    candidate.wickSnapshotEndIndex === undefined ||
    !(candidate.firstPivot > 0)) return candidate;
  const seconds = LIVE_TIMEFRAME_SECONDS[timeframe];
  const delta = candle.time - candidate.observedAt;
  if (!Number.isInteger(candle.time) || !Number.isInteger(delta) ||
    delta < seconds || delta % seconds !== 0 || delta > seconds * 1000 ||
    ![candle.high, candle.low, candle.close].every(n => Number.isFinite(n) && n > 0)) return candidate;
  const index = candidate.wickSnapshotEndIndex + delta / seconds;
  const side = candidate.bias === 'bullish' ? 'low' : 'high';
  const wick = side === 'low' ? candle.low : candle.high;
  if (Math.abs(wick - candidate.firstPivot) / candidate.firstPivot > .02) return candidate;
  // Retransmitted candle closes must not count twice.
  if (candidate.wickTouchBars.some(row => row[0] >= index)) return candidate;
  const samples: WickTouchBar[] = [...candidate.wickTouchBars,
    [index, wick, candle.close] as const].slice(-50);
  const rule = normalizeTpSlRule(configured);
  const touches = touchState(samples, candidate.firstPivot, side, rule);
  return {
    ...candidate, wickTouchBars: samples,
    tpSlBuilder: { ...candidate.tpSlBuilder, touches },
  };
}

/** Immutable projection for a UI user only. Does NOT enter the server scan/cache. */
export function projectUserCoins(coins: ScannedCoin[], settings?: TpSlConstructorSettings | null): ScannedCoin[] {
  if (!settings?.enabled || ((!settings.rules || Object.keys(settings.rules).every(k => k === COIN_RULES_KEY))
    && !settings.coinRules && !(settings.rules as unknown as Record<string, unknown> | undefined)?.[COIN_RULES_KEY])) return coins;
  return coins.map(coin => {
    const formations = coin.formations.map(f => resolveFormationTpSl(f, settings, coin.symbol));
    const earlyFormations = coin.earlyFormations?.map(f => resolveEarlyTpSl(f, settings, coin.symbol));
    if (formations.every((f, i) => f === coin.formations[i])
      && (!earlyFormations || earlyFormations.every((f, i) => f === coin.earlyFormations?.[i]))) return coin;
    return { ...coin, formations, bestFormation: coin.bestFormation
      ? resolveFormationTpSl(coin.bestFormation, settings, coin.symbol) : coin.bestFormation,
      ...(earlyFormations ? { earlyFormations } : {}),
    };
  });
}
