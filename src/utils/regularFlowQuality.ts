import type { DetectedFormation, ExchangeId, MarketType, RegularIndicatorValues } from '../types';
import { assessRegularFormationPlan, regularAtrPlanRow } from './regularFormationQuality';
import { qualityRow, REGULAR_FLOW_QUALITY_WEIGHTS as flowWeights,
  REGULAR_TECHNICAL_QUALITY_WEIGHTS as technicalWeights } from './regularFormationScore';
import { readRegularFormationEvidence } from './regularFormationIndicators';
import { REGULAR_OI_REASON_UK } from './regularOIHistory';

export { REGULAR_BASE_QUALITY_WEIGHTS, REGULAR_FLOW_QUALITY_WEIGHTS,
  REGULAR_TECHNICAL_QUALITY_WEIGHTS } from './regularFormationScore';

export type RegularFlowStatus = 'supported' | 'contradicted' | 'mixed' | 'unavailable';

export interface RegularFlowSummary {
  status: RegularFlowStatus;
  available: number;
  supportive: number;
  conflicting: number;
  independentSupport: number;
  independentAvailable?: number;
  entryConfirmedWithFlow: boolean;
  entryBlockedByFlow: boolean;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const signed = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2);

export function scoreRegularFlowQuality(
  formation: DetectedFormation, indicators: RegularIndicatorValues | undefined, exchange: ExchangeId, marketType: MarketType,
  densityChecked = false, refresh = false,
): DetectedFormation {
  const validation = formation.validation;
  const original = validation?.confluence;
  if (!original || original.scoreVersion !== 2 || !validation.regularPlan || (original.flow && !refresh)) return formation;
  const direction = formation.bias === 'bullish' ? 1 : formation.bias === 'bearish' ? -1 : 0;
  const evidence = readRegularFormationEvidence(indicators, exchange, marketType, validation.regularPlan.closedAt);
  const oi = direction ? evidence.oiChangePct : undefined;
  const candle = indicators?.candleContext;
  const directionalClose = oi !== undefined && candle !== undefined && (candle.close - candle.previousClose) * direction > 0;
  const delta = direction && evidence.deltaPct !== undefined ? evidence.deltaPct * direction : undefined;
  const cvd = direction && evidence.cvd20Pct !== undefined ? evidence.cvd20Pct * direction : undefined;

  const oiSupport = oi !== undefined && oi >= .3 && directionalClose && validation.filters.structure;
  const deltaSupport = delta !== undefined && delta >= 5;
  const cvdSupport = cvd !== undefined && cvd >= 2;
  const oiAgainst = oi !== undefined && oi <= -1;
  const deltaAgainst = delta !== undefined && delta <= -20;
  const cvdAgainst = cvd !== undefined && cvd <= -5;

  const round = formation.roundNumberContext;
  const hasRoundContext = !!round && finite(round.distancePct) && finite(round.step) && round.step > 0;
  const roundDetected = hasRoundContext && round.detected;
  const strength = roundDetected && finite(round.strength) ? round.strength : 0;
  const side = direction === 1 ? 'BID' : 'ASK';
  const verifiedDensity = !!direction && roundDetected && round.densityConfirmed && round.side === side
    && finite(round.densityUsd) && round.densityUsd >= 5_000;
  const densityAvailable = !!direction && roundDetected && (densityChecked || verifiedDensity);
  const rsi = evidence.rsi14;
  const rsiPoints = rsi === undefined ? 0 : direction === 1
    ? rsi >= 55 && rsi <= 68 ? 3 : rsi >= 50 && rsi <= 75 ? 2 : rsi >= 42 && rsi < 50 ? 1 : 0
    : direction === -1
      ? rsi >= 32 && rsi <= 45 ? 3 : rsi >= 25 && rsi <= 50 ? 2 : rsi > 50 && rsi <= 58 ? 1 : 0 : 0;
  const components = {
    ...original.components,
    openInterest: qualityRow(oiSupport ? (oi! >= 1 ? 5 : 3) : 0, flowWeights.openInterest,
      oi === undefined ? REGULAR_OI_REASON_UK[indicators?.oiAvailability === 'available'
        ? 'misaligned' : indicators?.oiAvailability ?? (marketType === 'spot' ? 'spot' : 'incomplete-history')]
        : `OI ${signed(oi)}% · ${oiSupport ? 'Зміна OI узгоджується з рухом ціни' : 'Зміна OI без підтвердження руху ціни'}`,
      marketType === 'spot' || !direction || indicators?.oiAvailability === 'unsupported-timeframe' ? 'notApplicable'
        : oi === undefined ? 'unavailable' : undefined, oiAgainst),
    delta: qualityRow(delta === undefined ? 0 : delta >= 20 ? 5 : delta >= 5 ? 4 : delta > 0 ? 2 : 0, flowWeights.delta,
      delta === undefined ? 'Дельта закритої свічки недоступна' : `Дельта ${signed(indicators!.deltaPct!)}% за останню закриту свічку`,
      !direction ? 'notApplicable' : delta === undefined ? 'unavailable' : undefined, deltaAgainst),
    cvd20: qualityRow(cvd === undefined ? 0 : cvd >= 10 ? 3 : cvd >= 2 ? 2 : cvd > 0 ? 1 : 0, flowWeights.cvd20,
      cvd === undefined ? 'Для CVD20 потрібні 20 свічок із перевіреним потоком'
        : `CVD20 ${signed(indicators!.cvd20Pct!)}% за 20 закритих свічок`,
      !direction ? 'notApplicable' : cvd === undefined ? 'unavailable' : undefined, cvdAgainst),
    roundNumber: qualityRow(strength >= 85 ? 4 : strength >= 70 ? 3 : strength > 0 ? 2 : 0, technicalWeights.roundNumber,
      roundDetected ? `Круглий рівень ${round!.level} · відстань ${round!.distancePct.toFixed(3)}% · сила ${strength}/100`
        : 'Круглий рівень поза допустимою зоною', hasRoundContext ? undefined : 'unavailable'),
    density: qualityRow(verifiedDensity ? strength >= 85 && round!.densityUsd! >= 15_000 ? 5
      : strength >= 75 ? 4 : 3 : 0, technicalWeights.density,
      !roundDetected ? 'Щільність: немає релевантного круглого рівня'
        : !densityAvailable ? 'Стакан не покриває рівень або знімок недоступний'
          : verifiedDensity ? `Верифікована ${side}-заявка ${round!.densityUsd!.toFixed(0)} · знімок стакана, може зникнути`
            : 'Рівень перевірено у стакані: потрібної BID/ASK щільності немає',
      !roundDetected || !direction ? 'notApplicable' : !densityAvailable ? 'unavailable' : undefined),
    rsi: qualityRow(rsiPoints, technicalWeights.rsi, rsi === undefined
      ? 'RSI14: немає коректних закритих свічок' : `RSI14 ${rsi.toFixed(1)} · ${direction > 0 ? 'LONG' : 'SHORT'}`,
      !direction ? 'notApplicable' : rsi === undefined ? 'unavailable' : undefined),
    atr: regularAtrPlanRow(validation.regularPlan.atr, formation.levels, formation.bias),
  };
  const available = [oi, delta, cvd].filter(value => value !== undefined).length;
  const supportive = Number(oiSupport) + Number(deltaSupport) + Number(cvdSupport);
  const independentSupport = Number(oiSupport) + Number(deltaSupport || cvdSupport);
  const independentAvailable = Number(oi !== undefined) + Number(delta !== undefined || cvd !== undefined);
  const entryBlockedByFlow = deltaAgainst && cvdAgainst;
  const flow: RegularFlowSummary = {
    status: !available ? 'unavailable' : entryBlockedByFlow ? 'contradicted'
      : independentSupport >= 2 ? 'supported' : 'mixed',
    available, supportive, independentSupport, independentAvailable,
    conflicting: Number(oiAgainst) + Number(deltaAgainst) + Number(cvdAgainst),
    entryBlockedByFlow, entryConfirmedWithFlow: false,
  };
  const conflict = 'Сильна протилежна дельта і CVD20: вхід не підтверджено потоком';
  const rejectionReasons = validation.rejectionReasons.filter(reason => reason !== conflict);
  if (entryBlockedByFlow) rejectionReasons.push(conflict);
  return assessRegularFormationPlan({
    ...formation,
    validation: { ...validation, rejectionReasons, confluence: { ...original, components, flow } },
  }, formation.levels);
}
