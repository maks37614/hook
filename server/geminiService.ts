import { GoogleGenAI } from '@google/genai';
import { DetectedFormation, FormationAIAnalysis, Kline } from '../src/types';

let genAI: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (genAI) return genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  try {
    genAI = new GoogleGenAI({ apiKey });
    return genAI;
  } catch (err) {
    console.error('Error initializing Gemini client:', err);
    return null;
  }
}

export async function analyzeFormationWithAI(
  symbol: string,
  exchange: string,
  timeframe: string,
  formation: DetectedFormation,
  currentPrice: number,
  recentCandles: Kline[]
): Promise<FormationAIAnalysis> {
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `Ти — професійний інституційний крипто-трейдер та аналітик Price Action.
Проаналізуй наступну виявлену технічну формацію на монеті:
Монета: ${symbol}
Біржа: ${exchange.toUpperCase()}
Таймфрейм: ${timeframe}
Формація: ${formation.name} (${formation.nameEn})
Тип/Категорія: ${formation.category}, Напрямок: ${formation.bias}
Поточна ціна: ${currentPrice}
Рівні: Вхід ~${formation.levels.entryPrice}, Ціль ~${formation.levels.targetPrice}, Стоп-лос ~${formation.levels.stopLossPrice}
${formation.levels.resistancePrice ? `Опір: ${formation.levels.resistancePrice}` : ''}
${formation.levels.supportPrice ? `Підтримка: ${formation.levels.supportPrice}` : ''}
${formation.levels.necklinePrice ? `Лінія шиї: ${formation.levels.necklinePrice}` : ''}

Останні 5 свічок:
${recentCandles.slice(-5).map((c, i) => `Свічка ${i + 1}: O:${c.open.toFixed(4)}, H:${c.high.toFixed(4)}, L:${c.low.toFixed(4)}, C:${c.close.toFixed(4)}, Vol:${c.volume.toFixed(0)}`).join('\n')}

Дай структуровану JSON відповідь з наступними полями (виключно українською мовою):
{
  "summary": "Коротке резюме ситуації та готовності формації (2-3 речення українською)",
  "patternConfirmation": "Що необхідно для підтвердження істинності формації (об'єм, закриття свічки)",
  "targetAnalysis": "Обґрунтування цілей TP1 та TP2 з точки зору ліквідності",
  "invalidationCriteria": "За якої умови патерн повністю скасовується (інвалідація)",
  "volumeRecommendation": "Рекомендації щодо аналізу кластерів та об'ємів",
  "tradeScenario": {
    "recommendedEntry": "Рекомендована точка входу (ліміт/маркет/пробій)",
    "tp1": "Консервативна ціль (ціна)",
    "tp2": "Основна ціль (ціна)",
    "stopLoss": "Рекомендований стоп-лос (ціна)",
    "rrRatio": "Розрахункове співвідношення ризик/прибуток (наприклад, 1:2.8)"
  },
  "keyRisks": ["Ризик 1", "Ризик 2", "Ризик 3"]
}
Відповідай ТІЛЬКИ валідним JSON без markdown обгорток або з \`\`\`json.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return parsed as FormationAIAnalysis;
    } catch (err) {
      console.warn('Gemini API call failed, falling back to technical engine analysis:', err);
    }
  }

  // Deterministic technical fallback in Ukrainian
  const isBullish = formation.bias === 'bullish';
  const entry = formation.levels.entryPrice || currentPrice;
  const target = formation.levels.targetPrice;
  const stop = formation.levels.stopLossPrice;
  const tp1 = isBullish ? entry + (target - entry) * 0.5 : entry - (entry - target) * 0.5;

  return {
    summary: `Формація "${formation.name}" на таймфреймі ${timeframe} знаходиться у фазі "${formation.statusLabel}". Співвідношення Risk/Reward оцінюється в 1:${formation.riskRewardRatio.toFixed(1)}.`,
    patternConfirmation: isBullish
      ? 'Підтвердження потребує закріплення свічки вище локального опору зі зростанням торговельного обсягу вище 20-періодної ковзної середньої.'
      : 'Підтвердження потребує закриття свічки нижче ключової підтримки зі сплеском тиску продавців.',
    targetAnalysis: `Первинне зняття ліквідності очікується на рівні ${tp1.toFixed(4)} (TP1), основний тейк-профіт розташований на висоті патерну ${target.toFixed(4)} (TP2).`,
    invalidationCriteria: `Повне скасування сценарію при зворотному імпульсі та закритті тіла свічки за рівнем інвалідації ${stop.toFixed(4)}.`,
    volumeRecommendation: 'Зверніть увагу на об\'єм: на імпульсі виходу обсяг має перевищувати середній мінімум у 1.5–2 рази. Вхід на згасаючому обсязі несе підвищений ризик хибного пробою.',
    tradeScenario: {
      recommendedEntry: formation.status === 'breakout' ? `За поточною ціною ${entry.toFixed(4)} або на локальному ретесті` : `Відкладений лімітний ордер біля ${entry.toFixed(4)}`,
      tp1: tp1.toFixed(4),
      tp2: target.toFixed(4),
      stopLoss: stop.toFixed(4),
      rrRatio: `1:${formation.riskRewardRatio.toFixed(1)}`,
    },
    keyRisks: [
      'Хибний пробій (Fakeout) зі швидким поверненням у діапазон',
      'Різка загальна волатильність Bitcoin, що впливає на альткоїни',
      'Знижена ліквідність на молодших таймфреймах',
    ],
  };
}

/** A distinct, on-demand AI-only score; never substitute the scanner score
 * or a deterministic fallback when the Gemini provider is not available. */
export function parseAISetupScore(raw: string): number {
  const cleaned = String(raw || '').trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Некоректна оцінка AI');
  const score = (parsed as Record<string, unknown>).score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error('AI повернув некоректний бал');
  }
  return score;
}

export async function evaluateFormationScoreWithAI(input: {
  symbol: string; exchange: string; marketType: string; timeframe: string;
  formation: DetectedFormation; currentPrice: number; recentCandles: Kline[];
}): Promise<number> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');

  const formation = input.formation;
  const quality = formation.validation?.confluence;
  const factors = Object.entries(quality?.components || {})
    .filter(([key]) => key !== 'density')
    .slice(0, 18)
    .map(([key, value]) => ({
      factor: key, score: value.score, max: value.max,
      available: value.available !== false,
      status: value.status,
    }));
  // Client values are untrusted evidence. The LLM provides a separate opinion,
  // but must not invent market quotes or treat missing signals as confirmed.
  const payload = {
    symbol: input.symbol, exchange: input.exchange,
    marketType: input.marketType, timeframe: input.timeframe,
    pattern: formation.patternKey, bias: formation.bias,
    status: formation.status, currentPrice: input.currentPrice,
    entry: formation.levels.entryPrice, target: formation.levels.targetPrice,
    stop: formation.levels.stopLossPrice, rr: formation.riskRewardRatio,
    scannerQuality: formation.confidence,
    checks: factors,
    candles: input.recentCandles.slice(-10).map(c => ({
      time: c.time, open: c.open, high: c.high,
      low: c.low, close: c.close, volume: c.volume,
    })),
  };
  const prompt = `Ти — незалежний AI-оцінювач технічної формації криптовалюти.
Оціни якість сетапу числом 0–100, використовуючи ТІЛЬКИ фактичні дані нижче.
Не підмінюй відсутні OI, дельту, CVD або обсяги підтвердженнями.
Перевір геометрію, статус підтвердження пробою й ретесту, R:R, обсяг, волатильність,
структурні рівні та якість даних. Бал сканера — контекст, не обов’язкова відповідь.
За відсутності доказів будь консервативним. Це оцінка якості, а не ймовірність прибутку.
Відповідай лише валідним JSON: {"score": 0}, замінивши 0 на ціле число від 0 до 100.
Без пояснень, назв позицій, цілей чи додаткових полів.
Дані: ${JSON.stringify(payload)}`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  return parseAISetupScore(response.text || '');
}
