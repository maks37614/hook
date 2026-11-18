import type { DetectedFormation, FormationValidation, Kline } from '../types';
import { calculateATR, normalizeKlineTimeMs, swingTolerancePct } from './formationValidation';
import { qualityRow, REGULAR_BASE_QUALITY_WEIGHTS as weights, summarizeRegularScore } from './regularFormationScore';

export interface RegularPlanContext {
  atr: number;
  tickSize: number | null;
  lastClose: number;
  decisionPrice: number;
  closedAt: number;
  triggerLevel: number;
  breakoutClosedAt?: number;
  retestClosedAt?: number;
  structureActive: boolean;
  entryExpired: boolean;
  /** Price path strictly after the chosen decision candle, in chronological order. */
  afterEntry: [high: number, low: number][];
}

type Levels = DetectedFormation['levels'];
const MAX_RETEST_AGE = 8;
const ENTRY_FRESH_BARS = 2;
const MIN_RISK_REWARD = 2;
const positive = (value: number) => Number.isFinite(value) && value > 0;
const pct = (distance: number, reference: number) => distance / reference * 100;

export function regularBreakoutLevel(formation: DetectedFormation): number {
  const levels = formation.levels;
  if (formation.bias === 'neutral') return levels.entryPrice;
  return levels.necklinePrice ?? (formation.bias === 'bullish' ? levels.resistancePrice : levels.supportPrice) ?? levels.entryPrice;
}

export function alignRegularPrice(price: number, tick: number | null, side: 'up' | 'down'): number {
  if (!tick || !positive(tick)) return Number(price.toPrecision(12));
  const steps = side === 'up' ? Math.ceil(price / tick - 1e-9) : Math.floor(price / tick + 1e-9);
  return Number((steps * tick).toPrecision(12));
}

function closedVolumeRatio(candles: Kline[], index: number): number | null {
  if (index < 20) return null;
  const sample = candles.slice(index - 20, index);
  const mean = sample.reduce((sum, c) => sum + c.volume, 0) / sample.length;
  return mean > 0 ? candles[index].volume / mean : null;
}

export function buildRegularFormation(
  candles: Kline[], formation: DetectedFormation, tick: number | null,
): DetectedFormation {
  const lastIndex = candles.length - 1;
  const last = candles[lastIndex];
  if (!last) return formation;
  const interval = candles.length >= 2
    ? normalizeKlineTimeMs(last.time) - normalizeKlineTimeMs(candles[lastIndex - 1].time) : 0;
  const closeTime = (index: number) => normalizeKlineTimeMs(candles[index].time) + interval;
  const known = formation.structureKnownIndex ?? formation.structureEndIndex ?? lastIndex;
  const structureEnd = formation.structureEndIndex ?? known;
  const start = formation.candleStartIndex ?? structureEnd;
  const enoughData = candles.length >= 35;
  const finiteData = interval > 0 && candles.every((c, i) =>
    Number.isFinite(c.time) && c.time > 0 && [c.open, c.high, c.low, c.close].every(positive)
    && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)
    && Number.isFinite(c.volume) && c.volume >= 0
    && (!i || normalizeKlineTimeMs(c.time) - normalizeKlineTimeMs(candles[i - 1].time) === interval));
  const closedCandleOnly = interval > 0 && closeTime(lastIndex) <= Date.now();
  const lookAheadSafe = Number.isInteger(start) && Number.isInteger(structureEnd) && Number.isInteger(known)
    && start >= 0 && start <= structureEnd && structureEnd <= known && known <= lastIndex;
  const isUsable = enoughData && finiteData && closedCandleOnly && lookAheadSafe;
  const direction = formation.bias === 'bullish' ? 1 : formation.bias === 'bearish' ? -1 : 0;
  const level = regularBreakoutLevel(formation);
  const atrAt = (index: number) => calculateATR(candles.slice(Math.max(0, index - 14), index + 1));
  const atr = finiteData ? atrAt(lastIndex) : 0;
  const atrPct = positive(last.close) ? pct(atr, last.close) : 0;
  const knownAtr = isUsable ? atrAt(known) : 0;
  const threshold = Math.max(tick ?? 0, knownAtr * .08);
  const tolerance = Math.max(tick ?? 0, knownAtr * .3);
  const epsilon = Number.EPSILON * Math.abs(level) * 8;
  const beyond = (price: number) => (price - level) * direction >= threshold - epsilon;
  let breakoutIndex: number | undefined;
  let retestIndex: number | undefined;
  if (isUsable && direction && positive(level) && positive(knownAtr)) {
    // Pivots may first become observable on the trigger bar itself. A prior
    // break only becomes actionable after a new crossing when the shape is known.
    const first = Math.max(1, known > structureEnd ? known : known + 1);
    for (let i = first; i <= lastIndex; i++) {
      if (beyond(candles[i].close) && !beyond(candles[i - 1].close)) {
        breakoutIndex = i;
        break;
      }
    }
    if (breakoutIndex !== undefined) {
      const limit = Math.min(lastIndex, breakoutIndex + MAX_RETEST_AGE);
      let touching = false;
      for (let i = breakoutIndex + 1; i <= limit; i++) {
        const c = candles[i];
        if ((c.close - level) * direction < -tolerance) break;
        const touch = direction === 1 ? c.low : c.high;
        if (Math.abs(touch - level) <= tolerance + epsilon && beyond(c.close)) {
          if (!touching) retestIndex = i;
          touching = true;
        } else if ((touch - level) * direction > tolerance + knownAtr * .15) touching = false;
      }
    }
  }

  const decisionIndex = retestIndex ?? breakoutIndex;
  const entry = decisionIndex === undefined ? formation.levels.entryPrice : candles[decisionIndex].close;
  const ratio = breakoutIndex === undefined ? null : closedVolumeRatio(candles, breakoutIndex);
  const volume = ratio !== null && ratio >= 1.15;
  const volatility = atrPct >= .05 && atrPct <= 12;
  const distance = Math.abs(last.close - level);
  const nearbyLevel = positive(level) && positive(atr) && distance <= atr * 3;
  const context: RegularPlanContext = {
    atr: decisionIndex === undefined ? atr : atrAt(decisionIndex),
    tickSize: tick, lastClose: last.close, decisionPrice: entry, closedAt: closeTime(lastIndex), triggerLevel: level,
    breakoutClosedAt: breakoutIndex === undefined ? undefined : closeTime(breakoutIndex),
    retestClosedAt: retestIndex === undefined ? undefined : closeTime(retestIndex),
    structureActive: breakoutIndex !== undefined && (last.close - level) * direction > 0
      && !candles.slice(breakoutIndex + 1).some(c => (c.close - level) * direction < -tolerance),
    entryExpired: decisionIndex !== undefined && lastIndex - decisionIndex > ENTRY_FRESH_BARS,
    afterEntry: decisionIndex === undefined ? [] : candles.slice(decisionIndex + 1, decisionIndex + MAX_RETEST_AGE + 1)
      .map(c => [c.high, c.low]),
  };

  const reasons: string[] = [];
  if (!isUsable) reasons.push('Якість або час свічок не підтверджено');
  if (breakoutIndex === undefined) reasons.push('Немає підтвердженого пробою рівня');
  else if (!context.structureActive) reasons.push('Ціна втратила пробитий рівень');
  if (breakoutIndex !== undefined && !volume) reasons.push(ratio === null
    ? 'Обсяг свічки пробою недоступний' : 'Обсяг свічки пробою не підтверджений');
  if (!volatility) reasons.push('Волатильність поза робочим діапазоном');
  if (!nearbyLevel) reasons.push('Немає близького рівня пробою');

  const extreme = formation.extremeContext;
  const extremePoints = extreme ? (extreme.aligned ? 4 : 0) + Math.min(2, extreme.approachStrength / 50)
    + Math.min(1.5, extreme.testsCount * .5) + (extreme.sweepDetected ? .5 : 0) : 0;
  const levelInAtr = atr > 0 ? distance / atr : Infinity;
  const levelPoints = levelInAtr <= .5 ? 6 : levelInAtr <= 1 ? 4.8 : levelInAtr <= 2 ? 3.6 : levelInAtr <= 3 ? 1.8 : 0;
  const volumePoints = ratio === null ? 0 : ratio >= 2 ? 5 : ratio >= 1.5 ? 4 : ratio >= 1.15 ? 3 : ratio >= 1 ? 1.5 : 0;
  const geometry = Number.isFinite(formation.geometryQuality) ? formation.geometryQuality! : 50;
  const components = {
    formation: qualityRow(geometry / 100 * weights.formation, weights.formation,
      `Якість геометрії/формації: ${geometry.toFixed(0)}/100`),
    extremeLocation: qualityRow(extremePoints, weights.extremeLocation, extreme
      ? `Відстань до екстремуму ${extreme.distancePct.toFixed(2)}% · сила підходу ${extreme.approachStrength}/100 · тести ${extreme.testsCount}`
      : 'Контекст екстремуму недоступний',
      extreme ? undefined : 'unavailable'),
    trigger: qualityRow(breakoutIndex === undefined ? 0 : weights.trigger, weights.trigger, breakoutIndex === undefined
      ? 'Потрібне закриття за рівнем після підтвердження структури' : 'Закритий breakout підтверджено'),
    retest: qualityRow(retestIndex !== undefined ? weights.retest : breakoutIndex !== undefined ? 2.8 : 0,
      weights.retest, retestIndex !== undefined ? 'Після пробою ціна перевірила той самий рівень і закрилася на правильному боці'
        : 'Ретест очікується після пробою', breakoutIndex === undefined ? 'pending' : undefined),
    volume: qualityRow(volumePoints, weights.volume, ratio === null
      ? 'Потрібен обсяг пробою та 20 попередніх свічок'
      : `RVOL ${ratio.toFixed(2)}x · свічка пробою`, breakoutIndex === undefined ? 'pending' : ratio === null ? 'unavailable' : undefined),
    volatility: qualityRow(atrPct >= .15 && atrPct <= 6 ? 3 : volatility ? 1.5 : 0,
      weights.volatility, `ATR/price ${atrPct.toFixed(2)}%`),
    level: qualityRow(levelPoints, weights.level, Number.isFinite(levelInAtr)
      ? `Відстань до рівня пробою: ${levelInAtr.toFixed(2)} ATR` : 'Відстань до рівня недоступна'),
    riskReward: qualityRow(0, weights.riskReward, 'R:R 0.00'),
    dataQuality: qualityRow(isUsable ? weights.dataQuality : 0, weights.dataQuality,
      isUsable ? 'Закриті послідовні свічки та коректний час структури' : 'Якість або час свічок не підтверджено'),
  };
  const validation: FormationValidation = {
    passed: false, confirmed: false, closedCandleOnly, lookAheadSafe, enoughData, finiteData,
    swingQuality: Math.round(geometry), equalExtremaTolerancePct: finiteData ? swingTolerancePct(candles, last.close) : 0,
    atrPct, volatilityPct: atrPct, breakoutConfirmed: breakoutIndex !== undefined,
    breakoutIndex, breakoutPrice: breakoutIndex === undefined ? undefined : candles[breakoutIndex].close,
    retestIndex, entryMode: breakoutIndex === undefined ? 'WAIT_BREAKOUT' : retestIndex !== undefined ? 'RETEST' : 'BREAKOUT',
    entryPrice: entry, stopPrice: formation.levels.stopLossPrice, targetPrice: formation.levels.targetPrice,
    riskReward: 0, minRiskReward: MIN_RISK_REWARD, volumeRatio: ratio ?? 0, volumeAvailable: ratio !== null,
    nearbyLevelDistancePct: positive(level) ? pct(distance, level) : 999,
    filters: { volume, volatility, nearbyLevel, structure: context.structureActive },
    regularPlan: context, rejectionReasons: reasons,
    confluence: summarizeRegularScore({
      total: 0, grade: 'D', components, independentConfirmations: 0, conflicts: [], missing: [], notes: [],
    }),
  };
  return { ...formation, levels: { ...formation.levels, entryPrice: entry }, validation };
}

export function regularAtrPlanRow(atr: number, levels: Levels, bias: DetectedFormation['bias']) {
  const { entryPrice, stopLossPrice, targetPrice } = levels;
  if (bias === 'neutral') return qualityRow(0, 2, 'Потрібне закриття за рівнем після підтвердження структури', 'pending');
  if (![atr, entryPrice, stopLossPrice, targetPrice].every(positive))
    return qualityRow(0, 2, 'ATR14: немає надійних свічок чи коректного SL/TP', 'unavailable');
  const direction = bias === 'bullish' ? 1 : -1;
  if ((entryPrice - stopLossPrice) * direction <= 0 || (targetPrice - entryPrice) * direction <= 0)
    return qualityRow(0, 2, 'Некоректний порядок рівнів входу, стопа і цілі');
  const stopInAtr = Math.abs(entryPrice - stopLossPrice) / atr;
  const targetInAtr = Math.abs(targetPrice - entryPrice) / atr;
  const score = stopInAtr >= .65 && stopInAtr <= 3.2 && targetInAtr <= 3.2 ? 2
    : stopInAtr >= .45 && stopInAtr <= 4 && targetInAtr <= 4 ? 1 : 0;
  return qualityRow(score, 2, `SL ${stopInAtr.toFixed(2)} ATR · TP ${targetInAtr.toFixed(2)} ATR`);
}

/** Reused for the original scanner plan and the user's displayed TP/SL plan. */
export function assessRegularFormationPlan(formation: DetectedFormation, levels: Levels): DetectedFormation {
  const v = formation.validation;
  const c = v?.confluence;
  const context = v?.regularPlan;
  if (!v || !c || !context) return formation;
  const direction = formation.bias === 'bullish' ? 1 : formation.bias === 'bearish' ? -1 : 0;
  const { entryPrice, stopLossPrice, targetPrice } = levels;
  const risk = (entryPrice - stopLossPrice) * direction;
  const reward = (targetPrice - entryPrice) * direction;
  const valid = [entryPrice, stopLossPrice, targetPrice].every(positive) && risk > 0 && reward > 0;
  const rr = valid ? reward / risk : 0;
  const displayedRr = rr < MIN_RISK_REWARD ? Math.min(1.99, Number(rr.toFixed(2))) : Number(rr.toFixed(2));
  let outcome: 'stop' | 'target' | undefined;
  const shifted = !!formation.tpSlBuilder?.levelStatus && Math.abs(entryPrice - context.decisionPrice)
    > Math.max(context.tickSize ?? 0, Math.abs(entryPrice) * 1e-10);
  let entryObserved = !shifted;
  if (valid) {
    for (const [high, low] of context.afterEntry) {
      if (!entryObserved) {
        if (low <= entryPrice && high >= entryPrice) entryObserved = true;
        continue;
      }
      if (direction === 1 ? low <= stopLossPrice : high >= stopLossPrice) { outcome = 'stop'; break; }
      if (direction === 1 ? high >= targetPrice : low <= targetPrice) { outcome = 'target'; break; }
    }
  }
  const tooFar = v.breakoutConfirmed && context.atr > 0
    && Math.abs(context.lastClose - entryPrice) > context.atr * 1.5;
  const spotRisk = (context.lastClose - stopLossPrice) * direction;
  const spotReward = (targetPrice - context.lastClose) * direction;
  const pricesMoved = v.breakoutConfirmed && valid && rr >= MIN_RISK_REWARD
    && (spotRisk <= 0 || spotReward / spotRisk < MIN_RISK_REWARD);
  const waitRetest = v.breakoutConfirmed && (context.entryExpired || tooFar);
  const planReasons = v.rejectionReasons.filter(reason => !reason.startsWith('R:R ')
    && !['Некоректний порядок рівнів входу, стопа і цілі', 'Вхід за пробоєм або ретестом застарів',
      'Ціна відійшла від входу більш ніж на 1.5 ATR: очікуйте ретест', 'Ціль уже досягнута',
      'Стоп уже досягнутий після входу', 'Вхід очікує досягнення заданої ціни',
      'Співвідношення R:R за останнім закриттям нижче 2.0',
      'Дотики за правилами профілю ще не підтверджено'].includes(reason));
  if (direction && !valid) planReasons.push('Некоректний порядок рівнів входу, стопа і цілі');
  if (direction && rr < MIN_RISK_REWARD) planReasons.push(`R:R ${displayedRr.toFixed(2)} < 2.0`);
  if (outcome === 'stop') planReasons.push('Стоп уже досягнутий після входу');
  if (outcome === 'target') planReasons.push('Ціль уже досягнута');
  if (context.entryExpired) planReasons.push('Вхід за пробоєм або ретестом застарів');
  if (tooFar) planReasons.push('Ціна відійшла від входу більш ніж на 1.5 ATR: очікуйте ретест');
  if (pricesMoved && !outcome) planReasons.push('Співвідношення R:R за останнім закриттям нижче 2.0');
  if (v.breakoutConfirmed && !entryObserved) planReasons.push('Вхід очікує досягнення заданої ціни');
  const confirmed = v.enoughData && v.finiteData && v.closedCandleOnly && v.lookAheadSafe
    && v.filters.structure && valid && rr >= MIN_RISK_REWARD && !outcome && !waitRetest && !pricesMoved && entryObserved;
  const passed = confirmed && v.filters.volume && v.filters.volatility && v.filters.nearbyLevel
    && !c.flow?.entryBlockedByFlow;
  const components = { ...c.components, riskReward: qualityRow(
    rr >= 3 ? 8 : rr >= 2.5 ? 6.4 : rr >= 2 ? 4.8 : rr >= 1.5 ? 2.4 : 0,
    weights.riskReward, `R:R ${displayedRr.toFixed(2)}`, !direction ? 'pending' : undefined,
  ) };
  if (components.atr) components.atr = regularAtrPlanRow(context.atr, levels, formation.bias);
  const independentConfirmations = [v.breakoutConfirmed && v.filters.structure, v.filters.volume,
    !!formation.extremeContext?.aligned, rr >= MIN_RISK_REWARD].filter(Boolean).length + (c.flow?.independentSupport ?? 0);
  const confluence = summarizeRegularScore({ ...c, components, independentConfirmations,
    ...(c.flow ? { flow: { ...c.flow, entryConfirmedWithFlow: passed && c.flow.independentSupport >= 2 } } : {}),
  });
  const statusLabel = outcome === 'target' ? 'Ціль досягнуто (TP)' : outcome === 'stop' ? 'Вхід скасовано: стоп досягнуто'
    : passed ? 'ПІДТВЕРДЖЕНО' : c.flow?.entryBlockedByFlow ? 'сильна розбіжність дельти/CVD'
      : waitRetest ? 'очікування свіжого ретесту'
        : v.breakoutConfirmed ? 'очікування підтвердження'
          : formation.patternKey === 'level_breakout' ? 'Підтискання до опору · очікування пробою' : 'очікування пробою';
  return { ...formation, levels, confidence: Math.round(confluence.total), riskRewardRatio: displayedRr,
    status: outcome === 'target' ? 'target_reached' : v.retestIndex !== undefined ? 'retest'
      : v.breakoutConfirmed ? 'breakout' : formation.status === 'forming' ? 'forming' : 'ready_to_break',
    statusLabel: statusLabel + (formation.roundNumberContext?.detected ? ' · кругле число' : ''),
    potentialProfitPct: valid ? Number(pct(reward, entryPrice).toFixed(2)) : 0,
    potentialRiskPct: valid ? Number(pct(risk, entryPrice).toFixed(2)) : 0,
    validation: { ...v, passed, confirmed, rejectionReasons: planReasons, confluence,
      entryMode: waitRetest ? 'WAIT_RETEST' : v.retestIndex !== undefined ? 'RETEST'
        : v.breakoutConfirmed ? 'BREAKOUT' : 'WAIT_BREAKOUT',
      entryPrice, stopPrice: stopLossPrice, targetPrice, riskReward: displayedRr },
  };
}

export function reassessRegularFormationQuality(candles: Kline[], formation: DetectedFormation): DetectedFormation {
  const result = buildRegularFormation(candles, formation, null);
  return assessRegularFormationPlan(result, result.levels);
}
