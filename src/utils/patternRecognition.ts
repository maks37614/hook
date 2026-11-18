import { Kline, DetectedFormation, PatternStatus } from '../types';
import { formatCryptoPrice } from './formatters';
import { analyzeExtremes, applyExtremeContext } from './extremeAnalysis';
import { calculateATR, validateFormationSet, swingTolerancePct, normalizeKlineTimeMs } from './formationValidation';
import { sampleWickTouches } from './wickTouchEvidence';
import { analyzeRoundNumber } from './roundNumber';

interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

/**
 * Identify swing highs and swing lows (fractals)
 */
export function findSwingPoints(klines: Kline[], window: number = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  if (klines.length < window * 2 + 1) return points;
  const lastClosedIndex = klines.length - 1;
  const tolerancePct = swingTolerancePct(klines, klines[lastClosedIndex].close);
  const tolerance = tolerancePct / 100;

  // A swing is usable only after the right-side confirmation window has
  // CLOSED. This prevents a backtest/live scan from treating a future candle
  // as if it were already known at the swing timestamp.
  for (let i = window; i <= lastClosedIndex - window; i++) {
    const currentHigh = klines[i].high;
    const currentLow = klines[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (klines[j].high > currentHigh * (1 - tolerance)) isHigh = false;
      if (klines[j].low < currentLow * (1 + tolerance)) isLow = false;
    }
    if (isHigh) points.push({ index: i, time: klines[i].time, price: currentHigh, type: 'high' });
    if (isLow) points.push({ index: i, time: klines[i].time, price: currentLow, type: 'low' });
  }
  return points.sort((a, b) => a.index - b.index);
}

/**
 * Universal validator and calculator for trading geometry.
 * Keeps the detector's measured geometry; validation decides whether it is actionable.
 * Invalid geometry receives zero risk/reward metrics, without replacement prices.
 * - If price has already reached or exceeded the target, status is marked 'target_reached'.
 */
export function finalizeFormationGeometry(
  raw: Omit<DetectedFormation, 'potentialProfitPct' | 'potentialRiskPct' | 'riskRewardRatio'>,
  currentPrice: number
): DetectedFormation {
  const { entryPrice, targetPrice, stopLossPrice, supportPrice, resistancePrice, necklinePrice } = raw.levels;
  const bias = raw.bias;
  let status: PatternStatus = raw.status;
  let statusLabel = raw.statusLabel;

  // Preserve measured levels. Validation rejects invalid geometry; never invent a replacement target or stop.
  if (bias === 'bullish') {
    // Check if target was already reached or exceeded by market price
    if (targetPrice > entryPrice && currentPrice >= targetPrice) {
      status = 'target_reached';
      statusLabel = 'Ціль досягнуто (TP)';
    }
  } else if (bias === 'bearish') {
    // Check if target was already reached or exceeded by market price
    if (targetPrice < entryPrice && currentPrice <= targetPrice) {
      status = 'target_reached';
      statusLabel = 'Ціль досягнуто (TP)';
    }
  }

  // Invalid geometry has zero R:R, rather than a fabricated minimum.
  let profitPct = 0;
  let riskPct = 0;

  const valid = [entryPrice, targetPrice, stopLossPrice].every(v => Number.isFinite(v) && v > 0)
    && (bias === 'bullish' ? stopLossPrice < entryPrice && entryPrice < targetPrice
      : bias === 'bearish' && targetPrice < entryPrice && entryPrice < stopLossPrice);
  if (valid && bias === 'bullish') {
    profitPct = ((targetPrice - entryPrice) / entryPrice) * 100;
    riskPct = ((entryPrice - stopLossPrice) / entryPrice) * 100;
  } else if (valid && bias === 'bearish') {
    profitPct = ((entryPrice - targetPrice) / entryPrice) * 100;
    riskPct = ((stopLossPrice - entryPrice) / entryPrice) * 100;
  }

  const rr = valid ? Math.abs(targetPrice - entryPrice) / Math.abs(entryPrice - stopLossPrice) : 0;
  profitPct = Number(profitPct.toFixed(2));
  riskPct = Number(riskPct.toFixed(2));

  return {
    ...raw,
    status,
    statusLabel,
    levels: {
      entryPrice: entryPrice,
      targetPrice: targetPrice,
      stopLossPrice: stopLossPrice,
      supportPrice: supportPrice ? supportPrice : undefined,
      resistancePrice: resistancePrice ? resistancePrice : undefined,
      necklinePrice: necklinePrice ? necklinePrice : undefined,
    },
    potentialProfitPct: profitPct,
    potentialRiskPct: riskPct,
    riskRewardRatio: Number(rr.toFixed(2)),
  };
}

/**
 * Generates a stable, deterministic ID: symbol + pattern + timeframe + start candle + end candle
 * Prevents duplicate alerts across re-analyses for the same formation
 */
function getFormationMeta(
  klines: Kline[], symbol: string, tf: string,
  patternKey: string,
  startIndex: number,
  endIndex: number,
  structureEndIndex = endIndex
) {
  const cleanSym = symbol.replace(/[\/\s:]+/g, '').toUpperCase();
  const startIdx = Math.max(0, Math.min(startIndex, klines.length - 1));
  const endIdx = Math.max(startIdx, Math.min(endIndex, klines.length - 1));
  const startCandle = klines[startIdx];
  const endCandle = klines[endIdx];
  const structureCandle = klines[Math.max(startIdx, Math.min(structureEndIndex, endIdx))];
  const startTime = startCandle ? normalizeKlineTimeMs(startCandle.time) : 0;
  const endTime = endCandle ? normalizeKlineTimeMs(endCandle.time) : 0;

  return {
    id: `${cleanSym}-${patternKey}-${tf}-${startTime}-${normalizeKlineTimeMs(structureCandle.time)}`,
    detectedAt: endTime || (endCandle ? normalizeKlineTimeMs(endCandle.time) : Date.now()),
    candleStartIndex: startIdx,
    candleEndIndex: endIdx,
    structureEndIndex,
  };
}


function detectCandlestickFormations(
  klines: Kline[], getStableFormationMeta: (key: string, start: number, end: number) => ReturnType<typeof getFormationMeta>,
  priorBars: number,
): DetectedFormation[] {
  const formations: DetectedFormation[] = [];
  // 9. CANDLESTICK FORMATIONS (Свічкові патерни Price Action)
  for (let index = Math.max(2, klines.length - 1 - priorBars); index < klines.length; index++) {
    const c0 = klines[index];
    const c1 = klines[index - 1];
    const currentPrice = c0.close;

    const c0Body = Math.abs(c0.close - c0.open);
    const c0Range = c0.high - c0.low;
    const c1Body = Math.abs(c1.close - c1.open);
    const candleVolumeSample = klines.slice(Math.max(0, index - 20), index);
    const candleAvgVolume = candleVolumeSample.length ? candleVolumeSample.reduce((sum, c) => sum + c.volume, 0) / candleVolumeSample.length : 0;
    const candleRvol = candleAvgVolume > 0 ? c0.volume / candleAvgVolume : 0;
    const candleVolumeConfirmed = candleRvol >= 1.0;

    // Pinbar / Hammer (Бичачий молот)
    const lowerWick = Math.min(c0.open, c0.close) - c0.low;
    const upperWick = c0.high - Math.max(c0.open, c0.close);
    if (candleVolumeConfirmed && c0Range > 0 && lowerWick >= c0Range * 0.6 && upperWick <= c0Range * 0.15) {
      const target = c0.close + Math.max(lowerWick * 1.5, c0.close * 0.025);
      const stopLoss = c0.low * 0.995;
      const meta = getStableFormationMeta('hammer', Math.max(0, index), index);

      formations.push(
        finalizeFormationGeometry(
          {
            id: meta.id,
            patternKey: 'hammer',
            name: 'Молот / Бичачий пін-бар',
            nameEn: 'Hammer / Bullish Pinbar',
            category: 'candlestick',
            bias: 'bullish',
            confidence: 50,
            status: 'breakout',
            statusLabel: 'Сильний викуп проливу',
            description: `Довга нижня тінь (${((lowerWick / c0Range) * 100).toFixed(0)}% свічки) підтверджує активність лімітного покупця. Ціль відскоку: $${formatCryptoPrice(target)}.`,
            levels: {
              entryPrice: c0.close,
              targetPrice: target,
              stopLossPrice: stopLoss,
              supportPrice: c0.low,
            },
            detectedAt: meta.detectedAt,
            candleStartIndex: meta.candleStartIndex,
            candleEndIndex: meta.candleEndIndex,
            structureEndIndex: meta.structureEndIndex,
          },
          currentPrice
        )
      );
    }

    // Shooting Star (Падаюча зірка / Ведмежий пін-бар)
    if (candleVolumeConfirmed && c0Range > 0 && upperWick >= c0Range * 0.6 && lowerWick <= c0Range * 0.15) {
      const target = c0.close - Math.max(upperWick * 1.5, c0.close * 0.025);
      const stopLoss = c0.high * 1.005;
      const meta = getStableFormationMeta('shooting-star', Math.max(0, index), index);

      formations.push(
        finalizeFormationGeometry(
          {
            id: meta.id,
            patternKey: 'shooting_star',
            name: 'Падаюча зірка (Пін-бар)',
            nameEn: 'Shooting Star',
            category: 'candlestick',
            bias: 'bearish',
            confidence: 50,
            status: 'breakout',
            statusLabel: 'Відмова на максимумах',
            description: `Довга верхня тінь (${((upperWick / c0Range) * 100).toFixed(0)}% свічки) свідчить про тиск продавців. Ціль корекції: $${formatCryptoPrice(target)}.`,
            levels: {
              entryPrice: c0.close,
              targetPrice: target,
              stopLossPrice: stopLoss,
              resistancePrice: c0.high,
            },
            detectedAt: meta.detectedAt,
            candleStartIndex: meta.candleStartIndex,
            candleEndIndex: meta.candleEndIndex,
            structureEndIndex: meta.structureEndIndex,
          },
          currentPrice
        )
      );
    }

    // Bullish Engulfing (Бичаче поглинання)
    if (candleVolumeConfirmed && c1.close < c1.open && c0.close > c0.open && c0.close > c1.open && c0.open < c1.close && c0Body > c1Body * 1.2) {
      const target = c0.close + Math.max(c0Body * 1.8, c0.close * 0.025);
      const stopLoss = Math.min(c0.low, c1.low) * 0.995;
      const meta = getStableFormationMeta('bull-engulfing', Math.max(0, index - 1), index);

      formations.push(
        finalizeFormationGeometry(
          {
            id: meta.id,
            patternKey: 'bull_engulfing',
            name: 'Бичаче поглинання',
            nameEn: 'Bullish Engulfing',
            category: 'candlestick',
            bias: 'bullish',
            confidence: 50,
            status: 'breakout',
            statusLabel: 'Імпульс покупців',
            description: `Зелена свічка повністю перекрила попередню свічку на зростаючому обсязі. Орієнтир для фіксації прибутку: $${formatCryptoPrice(target)}.`,
            levels: {
              entryPrice: c0.close,
              targetPrice: target,
              stopLossPrice: stopLoss,
              supportPrice: Math.min(c0.low, c1.low),
            },
            detectedAt: meta.detectedAt,
            candleStartIndex: meta.candleStartIndex,
            candleEndIndex: meta.candleEndIndex,
            structureEndIndex: meta.structureEndIndex,
          },
          currentPrice
        )
      );
    }

    // Bearish Engulfing (Ведмеже поглинання)
    if (candleVolumeConfirmed && c1.close > c1.open && c0.close < c0.open && c0.close < c1.open && c0.open > c1.close && c0Body > c1Body * 1.2) {
      const target = c0.close - Math.max(c0Body * 1.8, c0.close * 0.025);
      const stopLoss = Math.max(c0.high, c1.high) * 1.005;
      const meta = getStableFormationMeta('bear-engulfing', Math.max(0, index - 1), index);

      formations.push(
        finalizeFormationGeometry(
          {
            id: meta.id,
            patternKey: 'bear_engulfing',
            name: 'Ведмеже поглинання',
            nameEn: 'Bearish Engulfing',
            category: 'candlestick',
            bias: 'bearish',
            confidence: 50,
            status: 'breakout',
            statusLabel: 'Імпульс продавців',
            description: `Червона свічка повністю перекрила тіло попередньої свічки. Очікувана ціль падіння: $${formatCryptoPrice(target)}.`,
            levels: {
              entryPrice: c0.close,
              targetPrice: target,
              stopLossPrice: stopLoss,
              resistancePrice: Math.max(c0.high, c1.high),
            },
            detectedAt: meta.detectedAt,
            candleStartIndex: meta.candleStartIndex,
            candleEndIndex: meta.candleEndIndex,
            structureEndIndex: meta.structureEndIndex,
          },
          currentPrice
        )
      );
    }
  }

  return formations;
}

/**
 * Scan candles and detect all matching chart and candlestick formations
 */
export function detectFormations(klines: Kline[], symbol: string): DetectedFormation[] {
  if (!klines || klines.length < 30) return [];

  // Closed-candle boundary. Exchange timestamps may be seconds or milliseconds.
  // Never compare a seconds timestamp directly to Date.now().
  const raw = [...klines]
    .filter((k) => k && [k.time, k.open, k.high, k.low, k.close, k.volume].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
  if (raw.length < 30) return [];
  const intervalMs = raw.length >= 3
    ? Math.max(1000, normalizeKlineTimeMs(raw[raw.length - 1].time) - normalizeKlineTimeMs(raw[raw.length - 2].time))
    : 0;
  const lastLooksLive = intervalMs > 0 && Date.now() < normalizeKlineTimeMs(raw[raw.length - 1].time) + intervalMs;
  klines = lastLooksLive ? raw.slice(0, -1) : raw;
  if (klines.length < 30) return [];

  const formations: DetectedFormation[] = [];
  const currentCandle = klines[klines.length - 1];
  const currentPrice = currentCandle.close;
  const swings = findSwingPoints(klines, 3);
  const highs = swings.filter((p) => p.type === 'high');
  const lows = swings.filter((p) => p.type === 'low');

  const getPctDiff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);

  // Deterministic timeframe inference for stable formation ID
  const inferTimeframe = (interval: number): string => {
    if (interval >= 86400000) return '1d';
    if (interval >= 14400000) return '4h';
    if (interval >= 3600000) return '1h';
    if (interval >= 900000) return '15m';
    if (interval >= 300000) return '5m';
    if (interval >= 60000) return '1m';
    return '1h';
  };
  const tf = inferTimeframe(intervalMs);

  const getStableFormationMeta = (key: string, start: number, end: number, structure = end) =>
    getFormationMeta(klines, symbol, tf, key, start, end, structure);

  // 1. DOUBLE BOTTOM (Подвійне дно / W-патерн)
  if (lows.length >= 2) {
    const low2 = lows[lows.length - 1];
    const low1 = lows[lows.length - 2];
    const separation = low2.index - low1.index;
    if (separation >= 4 && separation <= 40 && low2.index >= klines.length - 15) {
      const priceDiffPct = getPctDiff(low1.price, low2.price);
      if (priceDiffPct <= 0.025) {
        const interveningHighs = highs.filter((h) => h.index > low1.index && h.index < low2.index);
        if (interveningHighs.length > 0) {
          const neckline = Math.max(...interveningHighs.map((h) => h.price));
          const bottomPrice = (low1.price + low2.price) / 2;
          const height = neckline - bottomPrice;

          if (height > 0 && height / bottomPrice >= 0.015) {
            const initialTarget = neckline + height;
            const initialStopLoss = bottomPrice * 0.992;

            let entryPrice: number;
            let targetPrice: number;
            let stopLossPrice: number;
            let status: PatternStatus;
            let statusLabel: string;

            if (currentPrice >= initialTarget * 0.998) {
              // Target already achieved
              status = 'target_reached';
              statusLabel = 'Ціль досягнуто (TP)';
              entryPrice = neckline;
              targetPrice = initialTarget;
              stopLossPrice = initialStopLoss;
            } else if (currentPrice >= neckline) {
              // In breakout phase
              const isRetest = currentPrice <= neckline * 1.008;
              status = isRetest ? 'retest' : 'breakout';
              statusLabel = isRetest ? 'Ретест лінії шиї' : 'Пробій лінії шиї';
              entryPrice = currentPrice;
              targetPrice = initialTarget;
              stopLossPrice = neckline * 0.992; // trailing stop below broken neckline
            } else {
              // In forming / compression phase
              const isReady = currentPrice >= neckline * 0.975;
              status = isReady ? 'ready_to_break' : 'forming';
              statusLabel = isReady ? 'Підтискання до шиї' : 'Формування 2-го дна';
              entryPrice = neckline; // Breakout order trigger
              targetPrice = initialTarget;
              stopLossPrice = initialStopLoss;
            }

            const meta = getStableFormationMeta('double-bottom', low1.index, klines.length - 1, low2.index);

            formations.push(
              finalizeFormationGeometry(
                {
                  id: meta.id,
                  patternKey: 'double_bottom',
                  name: 'Подвійне дно (W-патерн)',
                  nameEn: 'Double Bottom',
                  category: 'reversal',
                  bias: 'bullish',
                  confidence: 50,
                  status,
                  statusLabel,
                  description: `Подвійний відскок від зони підтримки $${formatCryptoPrice(bottomPrice)}. Лінія шиї (ключовий опір) на рівні $${formatCryptoPrice(neckline)}. Проєкція цілі патерну: $${formatCryptoPrice(targetPrice)}.`,
                  levels: {
                    entryPrice,
                    targetPrice,
                    stopLossPrice,
                    supportPrice: bottomPrice,
                    necklinePrice: neckline,
                    resistancePrice: neckline,
                  },
                  detectedAt: meta.detectedAt,
                  candleStartIndex: meta.candleStartIndex,
                  candleEndIndex: meta.candleEndIndex,
                  structureEndIndex: meta.structureEndIndex,
                },
                currentPrice
              )
            );
          }
        }
      }
    }
  }

  // 2. DOUBLE TOP (Подвійна вершина / M-патерн)
  if (highs.length >= 2) {
    const high2 = highs[highs.length - 1];
    const high1 = highs[highs.length - 2];
    const separation = high2.index - high1.index;
    if (separation >= 4 && separation <= 40 && high2.index >= klines.length - 15) {
      const priceDiffPct = getPctDiff(high1.price, high2.price);
      if (priceDiffPct <= 0.025) {
        const interveningLows = lows.filter((l) => l.index > high1.index && l.index < high2.index);
        if (interveningLows.length > 0) {
          const neckline = Math.min(...interveningLows.map((l) => l.price));
          const topPrice = (high1.price + high2.price) / 2;
          const height = topPrice - neckline;

          if (height > 0 && height / topPrice >= 0.015) {
            const initialTarget = neckline - height;
            const initialStopLoss = topPrice * 1.008;

            let entryPrice: number;
            let targetPrice: number;
            let stopLossPrice: number;
            let status: PatternStatus;
            let statusLabel: string;

            if (currentPrice <= initialTarget * 1.002) {
              // Target already achieved
              status = 'target_reached';
              statusLabel = 'Ціль досягнуто (TP)';
              entryPrice = neckline;
              targetPrice = initialTarget;
              stopLossPrice = initialStopLoss;
            } else if (currentPrice <= neckline) {
              // In breakdown phase
              const isRetest = currentPrice >= neckline * 0.992;
              status = isRetest ? 'retest' : 'breakout';
              statusLabel = isRetest ? 'Ретест лінії шиї знизу' : 'Пробій підтримки шиї';
              entryPrice = currentPrice;
              targetPrice = initialTarget;
              stopLossPrice = neckline * 1.008; // trailing stop above broken neckline
            } else {
              // In forming phase
              const isReady = currentPrice <= neckline * 1.025;
              status = isReady ? 'ready_to_break' : 'forming';
              statusLabel = isReady ? 'Біля нижньої межі' : 'Тест 2-ї вершини';
              entryPrice = neckline; // Breakdown trigger
              targetPrice = initialTarget;
              stopLossPrice = initialStopLoss;
            }

            const meta = getStableFormationMeta('double-top', high1.index, klines.length - 1, high2.index);

            formations.push(
              finalizeFormationGeometry(
                {
                  id: meta.id,
                  patternKey: 'double_top',
                  name: 'Подвійна вершина (M-патерн)',
                  nameEn: 'Double Top',
                  category: 'reversal',
                  bias: 'bearish',
                  confidence: 50,
                  status,
                  statusLabel,
                  description: `Подвійний відскок від рівня опору $${formatCryptoPrice(topPrice)}. Лінія шиї (підтримка) на рівні $${formatCryptoPrice(neckline)}. Пробій вниз відкриває ціль на рівні $${formatCryptoPrice(targetPrice)}.`,
                  levels: {
                    entryPrice,
                    targetPrice,
                    stopLossPrice,
                    resistancePrice: topPrice,
                    necklinePrice: neckline,
                    supportPrice: neckline,
                  },
                  detectedAt: meta.detectedAt,
                  candleStartIndex: meta.candleStartIndex,
                  candleEndIndex: meta.candleEndIndex,
                  structureEndIndex: meta.structureEndIndex,
                },
                currentPrice
              )
            );
          }
        }
      }
    }
  }

  // 3. ASCENDING TRIANGLE (Висхідний трикутник)
  if (highs.length >= 2 && lows.length >= 2) {
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);

    if (recentHighs.length >= 2 && recentLows.length >= 2) {
      const h1 = recentHighs[recentHighs.length - 2];
      const h2 = recentHighs[recentHighs.length - 1];
      const l1 = recentLows[recentLows.length - 2];
      const l2 = recentLows[recentLows.length - 1];

      const resistanceFlat = getPctDiff(h1.price, h2.price) <= 0.015;
      const higherLows = l2.price > l1.price * 1.008;

      if (resistanceFlat && higherLows && l2.index > l1.index && h2.index > h1.index) {
        const resistance = Math.max(h1.price, h2.price);
        const triangleHeight = resistance - l1.price;
        const initialTarget = resistance + triangleHeight * 0.9;
        const initialStopLoss = l2.price * 0.995;

        let entryPrice: number;
        let targetPrice: number;
        let stopLossPrice: number;
        let status: PatternStatus;
        let statusLabel: string;

        if (currentPrice >= initialTarget * 0.998) {
          status = 'target_reached';
          statusLabel = 'Ціль досягнуто (TP)';
          entryPrice = resistance;
          targetPrice = initialTarget;
          stopLossPrice = initialStopLoss;
        } else if (currentPrice >= resistance) {
          status = 'breakout';
          statusLabel = 'Істинний пробій рівня';
          entryPrice = currentPrice;
          targetPrice = initialTarget;
          stopLossPrice = resistance * 0.992;
        } else {
          const isReady = currentPrice >= resistance * 0.985;
          status = isReady ? 'ready_to_break' : 'forming';
          statusLabel = isReady ? 'Підтискання до рівня' : 'Підвищення мінімумів';
          entryPrice = resistance;
          targetPrice = initialTarget;
          stopLossPrice = initialStopLoss;
        }

        const meta = getStableFormationMeta('asc-triangle', l1.index, klines.length - 1, Math.max(l2.index, h2.index));

        formations.push(
          finalizeFormationGeometry(
            {
              id: meta.id,
              patternKey: 'asc_triangle',
              name: 'Висхідний трикутник',
              nameEn: 'Ascending Triangle',
              category: 'breakout',
              bias: 'bullish',
              confidence: 50,
              status,
              statusLabel,
              description: `Бичаче підтискання до горизонтального опору $${formatCryptoPrice(resistance)} із серією вищих мінімумів. Розрахункова ціль пробою: $${formatCryptoPrice(targetPrice)}.`,
              levels: {
                entryPrice,
                targetPrice,
                stopLossPrice,
                resistancePrice: resistance,
                supportPrice: l2.price,
              },
              detectedAt: meta.detectedAt,
              candleStartIndex: meta.candleStartIndex,
              candleEndIndex: meta.candleEndIndex,
              structureEndIndex: meta.structureEndIndex,
            },
            currentPrice
          )
        );
      }
    }
  }

  // 4. DESCENDING TRIANGLE (Спадний трикутник)
  if (highs.length >= 2 && lows.length >= 2) {
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);

    if (recentHighs.length >= 2 && recentLows.length >= 2) {
      const h1 = recentHighs[recentHighs.length - 2];
      const h2 = recentHighs[recentHighs.length - 1];
      const l1 = recentLows[recentLows.length - 2];
      const l2 = recentLows[recentLows.length - 1];

      const supportFlat = getPctDiff(l1.price, l2.price) <= 0.015;
      const lowerHighs = h2.price < h1.price * 0.992;

      if (supportFlat && lowerHighs) {
        const support = Math.min(l1.price, l2.price);
        const triangleHeight = h1.price - support;
        const initialTarget = support - triangleHeight * 0.9;
        const initialStopLoss = h2.price * 1.005;

        let entryPrice: number;
        let targetPrice: number;
        let stopLossPrice: number;
        let status: PatternStatus;
        let statusLabel: string;

        if (currentPrice <= initialTarget * 1.002) {
          status = 'target_reached';
          statusLabel = 'Ціль досягнуто (TP)';
          entryPrice = support;
          targetPrice = initialTarget;
          stopLossPrice = initialStopLoss;
        } else if (currentPrice <= support) {
          status = 'breakout';
          statusLabel = 'Пробій підтримки';
          entryPrice = currentPrice;
          targetPrice = initialTarget;
          stopLossPrice = support * 1.008;
        } else {
          const isReady = currentPrice <= support * 1.015;
          status = isReady ? 'ready_to_break' : 'forming';
          statusLabel = isReady ? 'Тиск продавців' : 'Зниження максимумів';
          entryPrice = support;
          targetPrice = initialTarget;
          stopLossPrice = initialStopLoss;
        }

        const meta = getStableFormationMeta('desc-triangle', h1.index, klines.length - 1, Math.max(h2.index, l2.index));

        formations.push(
          finalizeFormationGeometry(
            {
              id: meta.id,
              patternKey: 'desc_triangle',
              name: 'Спадний трикутник',
              nameEn: 'Descending Triangle',
              category: 'breakout',
              bias: 'bearish',
              confidence: 50,
              status,
              statusLabel,
              description: `Ведмеже підтискання до горизонтальної підтримки $${formatCryptoPrice(support)} із послідовним зниженням максимумів. Ціль падіння: $${formatCryptoPrice(targetPrice)}.`,
              levels: {
                entryPrice,
                targetPrice,
                stopLossPrice,
                supportPrice: support,
                resistancePrice: h2.price,
              },
              detectedAt: meta.detectedAt,
              candleStartIndex: meta.candleStartIndex,
              candleEndIndex: meta.candleEndIndex,
              structureEndIndex: meta.structureEndIndex,
            },
            currentPrice
          )
        );
      }
    }
  }

  // 5. BULL FLAG (Бичачий прапор)
  if (klines.length >= 25) {
    const checkWindow = klines.slice(-20);
    const impulseStart = Math.min(...checkWindow.slice(0, 8).map((c) => c.low));
    const impulsePeakIndex = checkWindow.slice(4, 14).reduce((maxIdx, c, idx, arr) => (c.high > arr[maxIdx].high ? idx : maxIdx), 0) + 4;
    const impulsePeak = checkWindow[impulsePeakIndex].high;

    const impulseGrowth = (impulsePeak - impulseStart) / impulseStart;
    if (impulseGrowth >= 0.045) {
      const flagCandles = checkWindow.slice(impulsePeakIndex);
      if (flagCandles.length >= 4 && flagCandles.length <= 14) {
        const flagLow = Math.min(...flagCandles.map((c) => c.low));
        const retracement = (impulsePeak - flagLow) / (impulsePeak - impulseStart);
        if (retracement <= 0.55 && retracement >= 0.1) {
          const initialTarget = impulsePeak + (impulsePeak - impulseStart) * 0.85;
          const initialStopLoss = flagLow * 0.993;

          let entryPrice: number;
          let targetPrice: number;
          let stopLossPrice: number;
          let status: PatternStatus;
          let statusLabel: string;

          if (currentPrice >= initialTarget * 0.998) {
            status = 'target_reached';
            statusLabel = 'Ціль досягнуто (TP)';
            entryPrice = impulsePeak;
            targetPrice = initialTarget;
            stopLossPrice = initialStopLoss;
          } else if (currentPrice > impulsePeak) {
            status = 'breakout';
            statusLabel = 'Вихід із прапора вгору';
            entryPrice = currentPrice;
            targetPrice = initialTarget;
            stopLossPrice = Math.max(flagLow * 0.993, impulsePeak * 0.985);
          } else {
            status = 'forming';
            statusLabel = 'Консолідація в полотні';
            entryPrice = impulsePeak;
            targetPrice = initialTarget;
            stopLossPrice = initialStopLoss;
          }

          const meta = getStableFormationMeta('bull-flag', Math.max(0, klines.length - 20), klines.length - 1, klines.length - 20 + impulsePeakIndex);

          formations.push(
            finalizeFormationGeometry(
              {
                id: meta.id,
                patternKey: 'bull_flag',
                name: 'Бичачий прапор (Флагшток)',
                nameEn: 'Bull Flag',
                category: 'continuation',
                bias: 'bullish',
                confidence: 50,
                status,
                statusLabel,
                description: `Імпульсне зростання (+${(impulseGrowth * 100).toFixed(1)}%) перейшло в консолідацію. Розрахункова ціль другого імпульсу: $${formatCryptoPrice(targetPrice)}.`,
                levels: {
                  entryPrice,
                  targetPrice,
                  stopLossPrice,
                  resistancePrice: impulsePeak,
                  supportPrice: flagLow,
                },
                detectedAt: meta.detectedAt,
                candleStartIndex: meta.candleStartIndex,
                candleEndIndex: meta.candleEndIndex,
                structureEndIndex: meta.structureEndIndex,
              },
              currentPrice
            )
          );
        }
      }
    }
  }

  // 6. BEAR FLAG (Ведмежий прапор)
  if (klines.length >= 25) {
    const checkWindow = klines.slice(-20);
    const impulseStart = Math.max(...checkWindow.slice(0, 8).map((c) => c.high));
    const impulseBottomIndex = checkWindow.slice(4, 14).reduce((minIdx, c, idx, arr) => (c.low < arr[minIdx].low ? idx : minIdx), 0) + 4;
    const impulseBottom = checkWindow[impulseBottomIndex].low;

    const impulseDrop = (impulseStart - impulseBottom) / impulseStart;
    if (impulseDrop >= 0.045) {
      const flagCandles = checkWindow.slice(impulseBottomIndex);
      if (flagCandles.length >= 4 && flagCandles.length <= 14) {
        const flagHigh = Math.max(...flagCandles.map((c) => c.high));
        const retracement = (flagHigh - impulseBottom) / (impulseStart - impulseBottom);
        if (retracement <= 0.55 && retracement >= 0.1) {
          const initialTarget = impulseBottom - (impulseStart - impulseBottom) * 0.85;
          const initialStopLoss = flagHigh * 1.007;

          let entryPrice: number;
          let targetPrice: number;
          let stopLossPrice: number;
          let status: PatternStatus;
          let statusLabel: string;

          if (currentPrice <= initialTarget * 1.002) {
            status = 'target_reached';
            statusLabel = 'Ціль досягнуто (TP)';
            entryPrice = impulseBottom;
            targetPrice = initialTarget;
            stopLossPrice = initialStopLoss;
          } else if (currentPrice < impulseBottom) {
            status = 'breakout';
            statusLabel = 'Пробій полотна вниз';
            entryPrice = currentPrice;
            targetPrice = initialTarget;
            stopLossPrice = Math.min(flagHigh * 1.007, impulseBottom * 1.015);
          } else {
            status = 'forming';
            statusLabel = 'Висхідний відкат';
            entryPrice = impulseBottom;
            targetPrice = initialTarget;
            stopLossPrice = initialStopLoss;
          }

          const meta = getStableFormationMeta('bear-flag', Math.max(0, klines.length - 20), klines.length - 1, klines.length - 20 + impulseBottomIndex);

          formations.push(
            finalizeFormationGeometry(
              {
                id: meta.id,
                patternKey: 'bear_flag',
                name: 'Ведмежий прапор',
                nameEn: 'Bear Flag',
                category: 'continuation',
                bias: 'bearish',
                confidence: 50,
                status,
                statusLabel,
                description: `Імпульсне падіння (-${(impulseDrop * 100).toFixed(1)}%) з наступним відкатом. Очікуване продовження шорт-руху до цілі: $${formatCryptoPrice(targetPrice)}.`,
                levels: {
                  entryPrice,
                  targetPrice,
                  stopLossPrice,
                  supportPrice: impulseBottom,
                  resistancePrice: flagHigh,
                },
                detectedAt: meta.detectedAt,
                candleStartIndex: meta.candleStartIndex,
                candleEndIndex: meta.candleEndIndex,
                structureEndIndex: meta.structureEndIndex,
              },
              currentPrice
            )
          );
        }
      }
    }
  }

  // 7. KEY HORIZONTAL LEVEL BREAKOUT / RETEST (Пробій або ретест ключового рівня)
  if (klines.length >= 41) {
    const recent40 = klines.slice(-41, -1);
    const highsList = recent40.map((c) => c.high);
    const maxHigh = Math.max(...highsList);
    const touches = highsList.filter((h) => (maxHigh - h) / maxHigh <= 0.012).length;

    if (touches >= 3) {
      const initialTarget = maxHigh * 1.055;
      const initialStopLoss = maxHigh * 0.985;

      let entryPrice: number;
      let targetPrice: number;
      let stopLossPrice: number;
      let status: PatternStatus;
      let statusLabel: string;

      if (currentPrice >= initialTarget * 0.998) {
        status = 'target_reached';
        statusLabel = 'Ціль досягнуто (TP)';
        entryPrice = maxHigh;
        targetPrice = initialTarget;
        stopLossPrice = initialStopLoss;
      } else if (currentPrice > maxHigh) {
        const isRetest = currentPrice <= maxHigh * 1.015 && currentCandle.low <= maxHigh;
        status = isRetest ? 'retest' : 'breakout';
        statusLabel = isRetest ? 'Ретест рівня зверху' : 'Імпульсний пробій опору';
        entryPrice = currentPrice;
        targetPrice = initialTarget;
        stopLossPrice = maxHigh * 0.985;
      } else {
        status = 'ready_to_break';
        statusLabel = 'Підтискання до опору';
        entryPrice = maxHigh;
        targetPrice = initialTarget;
        stopLossPrice = initialStopLoss;
      }

      const meta = getStableFormationMeta('level-breakout', Math.max(0, klines.length - 40), klines.length - 1, klines.length - 2);

      formations.push(
        finalizeFormationGeometry(
          {
            id: meta.id,
            patternKey: 'level_breakout',
            name: status === 'retest' ? 'Ретест пробитого рівня' : 'Пробій ключового опору',
            nameEn: status === 'retest' ? 'Level Retest' : 'Resistance Breakout',
            category: 'breakout',
            bias: 'bullish',
            confidence: 50,
            status,
            statusLabel,
            description: `Ключовий рівень $${formatCryptoPrice(maxHigh)} протестовано ${touches} рази. Розрахункова ціль імпульсу: $${formatCryptoPrice(targetPrice)}.`,
            levels: {
              entryPrice,
              targetPrice,
              stopLossPrice,
              resistancePrice: maxHigh,
              supportPrice: maxHigh * 0.985,
            },
            detectedAt: meta.detectedAt,
            candleStartIndex: meta.candleStartIndex,
            candleEndIndex: meta.candleEndIndex,
            structureEndIndex: meta.structureEndIndex,
          },
          currentPrice
        )
      );
    }
  }

  // 8. VOLATILITY SQUEEZE (Стиснення діапазону)
  if (klines.length >= 31) {
    const recent10 = klines.slice(-11, -1);
    const ranges10 = recent10.map((c) => (c.high - c.low) / c.close);
    const avgRecentRange = ranges10.reduce((s, r) => s + r, 0) / 10;

    const prior20 = klines.slice(-31, -11);
    const priorRanges = prior20.map((c) => (c.high - c.low) / c.close);
    const avgPriorRange = priorRanges.reduce((s, r) => s + r, 0) / 20;

    if (avgRecentRange <= avgPriorRange * 0.48 && avgRecentRange > 0) {
      const highest10 = Math.max(...recent10.map((c) => c.high));
      const lowest10 = Math.min(...recent10.map((c) => c.low));
      const breakoutUp = currentPrice >= highest10;
      const breakoutDown = currentPrice <= lowest10;
      const bias = breakoutUp ? 'bullish' : breakoutDown ? 'bearish' : 'neutral';
      const entryPrice = breakoutUp ? currentPrice : breakoutDown ? currentPrice : (highest10 + lowest10) / 2;
      const riskBase = Math.max(highest10 - lowest10, currentPrice * 0.005);
      const targetPrice = breakoutUp ? currentPrice + riskBase * 2.2 : breakoutDown ? currentPrice - riskBase * 2.2 : highest10;
      const stopLossPrice = breakoutUp ? lowest10 : breakoutDown ? highest10 : lowest10;

      const meta = getStableFormationMeta('squeeze', Math.max(0, klines.length - 30), klines.length - 1, klines.length - 2);

      formations.push(
        finalizeFormationGeometry(
          {
            id: meta.id,
            patternKey: 'volatility_squeeze',
            name: 'Стиснення діапазону (Squeeze)',
            nameEn: 'Volatility Squeeze',
            category: 'compression',
            bias,
            confidence: breakoutUp || breakoutDown ? 60 : 0,
            status: breakoutUp || breakoutDown ? 'breakout' : 'ready_to_break',
            statusLabel: breakoutUp ? 'Підтверджений вихід вгору' : breakoutDown ? 'Підтверджений вихід вниз' : 'Очікування напрямку breakout',
            description: `Волатильність стиснулася більш ніж удвічі. Діапазон накопичення: [$${formatCryptoPrice(lowest10)} - $${formatCryptoPrice(highest10)}]. Ціль виходу вгору: $${formatCryptoPrice(targetPrice)}.`,
            levels: {
              entryPrice,
              targetPrice,
              stopLossPrice,
              resistancePrice: highest10,
              supportPrice: lowest10,
            },
            detectedAt: meta.detectedAt,
            candleStartIndex: meta.candleStartIndex,
            candleEndIndex: meta.candleEndIndex,
            structureEndIndex: meta.structureEndIndex,
          },
          currentPrice
        )
      );
    }
  }

  formations.push(...detectCandlestickFormations(klines, getStableFormationMeta, 0));

  // Location matters: a formation is materially stronger when it develops at a
  // meaningful rolling/swing extreme and price approaches that extreme in the
  // direction implied by the setup. This is also used to suppress reversal
  // candidates that form in the middle of a range.
  const withExtreme = applyExtremeContext(klines, formations);
  const withValidation = validateFormationSet(klines, withExtreme, symbol);
  return withValidation.map((formation) => {
    const reference = formation.levels.necklinePrice ?? formation.levels.entryPrice;
    const wickRef = formation.bias === 'bullish' ? formation.levels.supportPrice : formation.levels.resistancePrice;
    const wickTouchBars = (formation.patternKey === 'double_bottom' || formation.patternKey === 'double_top') && wickRef
      ? sampleWickTouches(klines, formation.candleStartIndex ?? 0, wickRef,
          formation.bias === 'bullish' ? 'low' : 'high') : undefined;
    const roundNumberContext = analyzeRoundNumber(klines, reference);
    return {
      ...formation,
      ...(wickTouchBars ? { wickTouchBars } : {}),
      confidence: formation.validation?.confluence ? Math.round(formation.validation.confluence.total) : formation.confidence,
      roundNumberContext,
      statusLabel: roundNumberContext.detected
        ? `${formation.statusLabel} · кругле число`
        : formation.statusLabel,
      description: `${formation.description}${roundNumberContext.detected ? ` Ключова кругла ціна: $${formatCryptoPrice(roundNumberContext.level || reference)}.` : ''}`
    };
  });
}

const unit = (n: number) => Math.max(0, Math.min(1, n));

function regularGeometry(candles: Kline[], formation: DetectedFormation, known: number, atr: number): number {
  const start = formation.candleStartIndex ?? known;
  const end = formation.structureEndIndex ?? known;
  const long = formation.bias === 'bullish';
  const swingPrice = (candle: Kline) => long ? candle.low : candle.high;
  const trigger = formation.levels.necklinePrice ?? (long
    ? formation.levels.resistancePrice : formation.levels.supportPrice) ?? formation.levels.entryPrice;
  const pattern = formation.patternKey;
  if (pattern === 'double_bottom' || pattern === 'double_top') {
    const first = swingPrice(candles[start]), second = swingPrice(candles[end]);
    const height = Math.abs(trigger - (first + second) / 2);
    const symmetry = 1 - unit(Math.abs(first - second) / Math.max(atr, height * .4));
    const depth = unit(height / (3 * atr));
    return 100 * (symmetry * .55 + depth * .45);
  }
  if (pattern === 'asc_triangle' || pattern === 'desc_triangle') {
    const window = candles.slice(start, end + 1);
    const span = Math.abs(trigger - swingPrice(candles[start]));
    const contacts = window.filter(c => Math.abs((long ? c.high : c.low) - trigger) <= atr * .35).length;
    const contraction = Math.abs(trigger - swingPrice(candles[end])) / Math.max(span, atr);
    return 100 * (unit(contacts / 3) * .35 + unit(span / (3 * atr)) * .35 + (1 - unit(contraction)) * .3);
  }
  if (pattern === 'bull_flag' || pattern === 'bear_flag') {
    const pole = candles.slice(start, end + 1);
    const impulse = Math.abs(trigger - (long ? Math.min(...pole.map(c => c.low)) : Math.max(...pole.map(c => c.high))));
    const consolidation = candles.slice(end + 1, known + 1);
    const pullback = consolidation.length ? Math.max(...consolidation.map(c => Math.abs(trigger - swingPrice(c)))) : 0;
    return 100 * (unit(impulse / (6 * atr)) * .55 + (1 - unit(pullback / Math.max(impulse, atr))) * .45);
  }
  const ranges = (sample: Kline[]) => sample.reduce((sum, c) => sum + (c.high - c.low) / c.close, 0) / sample.length;
  const recent = ranges(candles.slice(known - 9, known + 1));
  const prior = ranges(candles.slice(known - 29, known - 9));
  return prior > 0 ? 100 * (1 - unit(recent / prior)) : 0;
}

/** Preserve the level used on the breakout bar throughout its retest window. */
function detectRegularHorizontalLevel(candles: Kline[], symbol: string, timeframe: string, tick: number): DetectedFormation | undefined {
  const last = candles.length - 1;
  for (let index = Math.max(40, last - 8); index <= last; index++) {
    const prior = candles.slice(index - 40, index);
    const atr = calculateATR(prior);
    if (!(atr > 0)) continue;
    const level = Math.max(...prior.map(c => c.high));
    const tolerance = Math.max(atr * .3, tick);
    const threshold = level + Math.max(tick, atr * .08);
    const crossed = candles[index].close >= threshold;
    if (index !== last && !crossed) continue;
    if (crossed && candles.slice(index + 1).some(c => c.close < level - tolerance)) continue;
    if (!crossed && Math.abs(candles[index].close - level) > atr * 2.5) continue;

    const touches: number[] = [];
    for (let i = 1; i < prior.length; i++) {
      const bar = prior[i], before = prior[i - 1], after = prior[i + 1];
      if (bar.high < level - tolerance || bar.high < before.high || (after && bar.high < after.high)) continue;
      if (bar.high === before.high && (!after || bar.high === after.high)) continue;
      if (bar.high - bar.close < atr * .12 || i - (touches.at(-1) ?? -3) < 3) continue;
      touches.push(i);
    }
    if (touches.length < 2) continue;

    const base = Math.min(...prior.slice(-16).map(c => c.low));
    const localLow = Math.min(...prior.slice(-3).map(c => c.low));
    const height = level - base;
    if (height < atr * .75) continue;
    const levelAnchor = index - 40 + prior.findIndex(c => c.high === level);
    const meta = getFormationMeta(candles, symbol, timeframe, 'level-breakout', index - 40, last, levelAnchor);
    const target = level + height;
    return finalizeFormationGeometry({
      ...meta, id: `${symbol}-level-breakout-${timeframe}-${normalizeKlineTimeMs(candles[levelAnchor].time)}`,
      structureEndIndex: index - 1, structureKnownIndex: index - 1,
      detectedAt: normalizeKlineTimeMs(candles[index - 1].time),
      patternKey: 'level_breakout', name: 'Пробій ключового опору', nameEn: 'Resistance Breakout',
      category: 'breakout', bias: 'bullish', status: 'ready_to_break', statusLabel: 'Підтискання до опору',
      confidence: 50, geometryQuality: 100 * (.55 * unit(touches.length / 4) + .45 * unit(height / (3 * atr))),
      description: `Ключовий рівень $${formatCryptoPrice(level)} протестовано ${touches.length} рази. Розрахункова ціль імпульсу: $${formatCryptoPrice(target)}.`,
      levels: { entryPrice: level, resistancePrice: level, supportPrice: localLow,
        stopLossPrice: localLow - Math.max(tick, atr * .12), targetPrice: target },
    }, candles[last].close);
  }
}

/** The standard scan shares the old detections for common families; early W/M
 * continues to use the original detector as its duplicate gate. */
export function regularFormationCandidates(
  candles: Kline[], detected: DetectedFormation[], symbol: string, timeframe: string, tickSize: number | null,
): DetectedFormation[] {
  const last = candles.length - 1;
  const tick = tickSize ?? 0;
  const candidates = detected.filter(f => f.patternKey !== 'level_breakout' && f.category !== 'candlestick');
  const horizontal = detectRegularHorizontalLevel(candles, symbol, timeframe, tick);
  if (horizontal) candidates.push(horizontal);
  const candlePatterns = detectCandlestickFormations(candles,
    (key, start, end) => getFormationMeta(candles, symbol, timeframe, key, start, end), 5);
  for (const formation of candlePatterns) {
    const index = formation.structureEndIndex!;
    const bar = candles[index];
    const atr = calculateATR(candles.slice(Math.max(0, index - 14), index + 1));
    if (!(atr > 0)) continue;
    const long = formation.bias === 'bullish';
    const direction = long ? 1 : -1;
    const engulfing = formation.patternKey.endsWith('engulfing');
    const previous = engulfing ? candles[index - 1] : bar;
    const level = long ? bar.high : bar.low;
    const invalidation = long ? Math.min(bar.low, previous.low) : Math.max(bar.high, previous.high);
    const range = bar.high - bar.low;
    const body = Math.abs(bar.open - bar.close);
    const wick = long ? Math.min(bar.open, bar.close) - bar.low : bar.high - Math.max(bar.open, bar.close);
    const shape = engulfing ? unit(body / (range || 1)) : unit(wick / (range || 1));
    candidates.push({ ...formation, structureKnownIndex: index, candleEndIndex: last,
      geometryQuality: 100 * (shape * .7 + unit(range / atr) * .3),
      levels: { ...formation.levels, entryPrice: level,
        ...(long ? { resistancePrice: level, supportPrice: invalidation } : { supportPrice: level, resistancePrice: invalidation }),
        stopLossPrice: invalidation - direction * Math.max(tick, atr * .12),
        targetPrice: level + direction * Math.abs(formation.levels.targetPrice - bar.close) },
    });
  }
  return candidates.map(formation => {
    const pivotFamily = formation.category === 'reversal'
      || formation.patternKey === 'asc_triangle' || formation.patternKey === 'desc_triangle';
    const structure = formation.structureEndIndex ?? last;
    const known = formation.structureKnownIndex ?? (pivotFamily ? structure + 3
      : formation.category === 'continuation' ? last : structure);
    const atr = calculateATR(candles.slice(Math.max(0, known - 14), known + 1));
    return { ...formation, structureKnownIndex: known,
      geometryQuality: formation.geometryQuality ?? (atr > 0 && known <= last ? regularGeometry(candles, formation, known, atr) : 0),
      extremeContext: formation.extremeContext ?? analyzeExtremes(candles, formation),
    };
  });
}
