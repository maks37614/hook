import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import type { Kline, Timeframe } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { calculateATR } from '../utils/formationValidation';
import {
  TP_SL_DEFAULT_RULE, TP_SL_PATTERNS, countWickTouches, normalizeTpSlRule,
  normalizeTpSlSettings, sampleWickTouches, serializeTpSlSettings, tpSlCoinRuleKey,
  type TpSlConstructorSettings, type TpSlRule,
} from '../utils/tpSlConstructor';
import { TpSlConstructorChart, type BuilderLevels } from './TpSlConstructorChart';

type LevelKey = keyof BuilderLevels;
const intervals: Record<Timeframe, number> = { '5s': 5, '30s': 30, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const selectStyle = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100';
const finite = (n: number) => Number.isFinite(n) && n > 0;

interface Props { onClose: () => void }
export default function TpSlConstructorModal({ onClose }: Props) {
  const { user, profile, updateProfileData } = useAuth();
  const { language, t } = useLanguage();
  const [draft, setDraft] = useState<TpSlConstructorSettings>(() =>
    normalizeTpSlSettings(profile?.uid === user?.uid ? profile?.tpSlConstructorSettings : null));
  const [pattern, setPattern] = useState<string>('double_bottom');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [symbolInput, setSymbolInput] = useState('BTCUSDT');
  const [scope, setScope] = useState<'global' | 'coin'>('global');
  const [exchange, setExchange] = useState<'binance' | 'bybit'>('binance');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const coinKey = tpSlCoinRuleKey(symbol, pattern);
  const globalRule = draft.rules[pattern];
  const coinRule = coinKey ? draft.coinRules?.[coinKey] : undefined;
  const custom = scope === 'coin' ? !!coinRule : !!globalRule;
  const rule = normalizeTpSlRule((scope === 'coin' ? coinRule || globalRule : globalRule) || TP_SL_DEFAULT_RULE);
  const coinRuleCount = Object.keys(draft.coinRules || {}).length;
  const selectSymbol = () => {
    const next = symbolInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,24}$/.test(next)) {
      setError('Вкажіть торгову пару у форматі BTCUSDT (2–24 літери/цифри).');
      return;
    }
    setError('');
    setSymbolInput(next);
    setSymbol(next);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFetchError(''); setCandles([]);
    const q = new URLSearchParams({ exchange, market: 'futures',
      symbol, timeframe, limit: '180' });
    fetch('/api/klines?' + q, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не вдалося завантажити свічки біржі');
        const result = await response.json();
        if (!Array.isArray(result.data)) throw new Error('Відсутні свічкові дані');
        const now = Date.now();
        const closed = (result.data as Kline[]).filter(c =>
          finite(c.low) && finite(c.high) && c.high >= c.low && c.time > 0
          && (c.time + intervals[timeframe]) * 1000 <= now);
        if (closed.length < 30) throw new Error('Недостатньо закритих свічок для прикладу');
        setCandles(closed);
      }).catch(e => { if (!controller.signal.aborted) setFetchError(e?.message || 'Помилка графіка'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [symbol, timeframe, exchange]);

  const bullish = !/double_top|desc_triangle|bear_flag|shooting_star|bear_engulfing/.test(pattern);
  const dir = bullish ? 1 : -1;
  const sample = useMemo(() => {
    if (candles.length < 30) return null;
    const recent = candles.slice(-65);
    const atr = calculateATR(recent, 14);
    if (!(atr > 0)) return null;
    // Chart preview uses real wick OHLC, not a claim of an active formation.
    const low = Math.min(...recent.map(c => c.low));
    const high = Math.max(...recent.map(c => c.high));
    const last = recent.slice(-25);
    const entry = bullish ? Math.max(...last.map(c => c.high)) : Math.min(...last.map(c => c.low));
    const stop = bullish ? low - .5 * atr : high + .5 * atr;
    const baseRisk = dir * (entry - stop);
    if (!(stop > 0 && baseRisk > 0)) return null;
    const extreme = bullish ? low : high;
    const touching = sampleWickTouches(recent, 0, extreme, bullish ? 'low' : 'high');
    return { atr, entry, stop, extreme, touching };
  }, [candles, bullish, dir]);

  const levels = useMemo<BuilderLevels | null>(() => {
    if (!sample) return null;
    const entry = sample.entry + dir * (rule.customLevelsEnabled ? rule.entryAtrOffset : 0) * sample.atr;
    const stop = sample.stop - dir * (rule.customLevelsEnabled ? rule.stopAtrBuffer : 0) * sample.atr;
    const risk = dir * (entry - stop);
    const originalRisk = dir * (sample.entry - sample.stop);
    const originalTarget = sample.entry + dir * originalRisk * 2;
    // Independent TP override: dragging SL or Entry must NOT jump an explicitly placed TP.
    const target = rule.customLevelsEnabled && rule.targetAtrOffset !== undefined
      ? originalTarget + dir * rule.targetAtrOffset * sample.atr
      : entry + dir * risk * (rule.customLevelsEnabled ? rule.targetRiskReward : 2);
    if (![entry, stop, target].every(finite)) return null;
    return { entry, stop, target };
  }, [sample, rule, dir]);
  const geometryValid = !levels || (dir * (levels.entry - levels.stop) > 0
    && dir * (levels.target - levels.entry) > 0);
  const touchCount = useMemo(() => sample
    ? countWickTouches(sample.touching, sample.extreme, bullish ? 'low' : 'high', rule) : 0,
    [sample, rule, bullish]);
  const needed = bullish ? rule.lowTouches : rule.highTouches;

  const changeRule = (patch: Partial<TpSlRule>) => {
    if (scope === 'coin' && !coinRule && coinRuleCount >= 512) {
      setError('Досягнуто обмеження сховища: 512 індивідуальних шаблонів. Видаліть зайві шаблони.');
      return;
    }
    setError('');
    setDraft(current => {
      const key = tpSlCoinRuleKey(symbol, pattern);
      const currentGlobal = current.rules[pattern] || TP_SL_DEFAULT_RULE;
      const original = scope === 'coin' && key
        ? current.coinRules?.[key] || currentGlobal : currentGlobal;
      const next = normalizeTpSlRule({ ...original, ...patch });
      if (scope === 'global') return {
        ...current, rules: { ...current.rules, [pattern]: next },
      };
      if (!key) return current;
      return { ...current, coinRules: { ...current.coinRules, [key]: next } };
    });
  };
  const resetRule = () => {
    setError('');
    setDraft(current => {
      if (scope === 'global') {
        const rules = { ...current.rules };
        delete rules[pattern];
        return { ...current, rules };
      }
      const key = tpSlCoinRuleKey(symbol, pattern);
      if (!key) return current;
      const coinRules = { ...current.coinRules };
      delete coinRules[key];
      return { ...current, ...(Object.keys(coinRules).length ? { coinRules } : { coinRules: undefined }) };
    });
  };
  const move = (key: LevelKey, price: number) => {
    if (!sample || !levels || !finite(price)) return;
    if (key === 'entry') changeRule({
      entryAtrOffset: dir * (price - sample.entry) / sample.atr, customLevelsEnabled: true,
    });
    if (key === 'stop') changeRule({
      stopAtrBuffer: dir * (sample.stop - price) / sample.atr, customLevelsEnabled: true,
    });
    if (key === 'target') {
      const baseRisk = dir * (sample.entry - sample.stop);
      const originalTarget = sample.entry + dir * baseRisk * 2;
      changeRule({
        targetAtrOffset: dir * (price - originalTarget) / sample.atr,
        customLevelsEnabled: true,
      });
    }
  };
  const save = async () => {
    if (!user || profile?.uid !== user.uid || saving) return;
    if (scope === 'coin' && symbolInput.trim().toUpperCase() !== symbol) {
      setError('Спочатку натисніть OK біля назви монети, щоб застосувати нову пару.');
      return;
    }
    if (draft.enabled && !geometryValid) {
      setError('Перевірте напрям угоди: Stop Loss має бути з боку збитку, Take Profit — з боку прибутку.');
      return;
    }
    setSaving(true); setError('');
    try {
      await updateProfileData({ tpSlConstructorSettings: serializeTpSlSettings(draft) });
      onClose();
    } catch(e: any) { setError(e?.message || 'Не вдалося зберегти правила'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] bg-[#050a15]/95 text-slate-100 flex flex-col" role="dialog"
      aria-label={translatePhrase(language, "Конструктор TP/SL")} aria-modal="true">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div><h2 className="text-xl font-bold">{translatePhrase(language, "Конструктор TP/SL")}</h2>
          <p className="text-xs text-slate-400">{translatePhrase(language, "Правила формації для всіх монет або окремої монети · ВИМКНЕНО за замовчуванням")}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <input type="checkbox" checked={draft.enabled} onChange={e => setDraft(old => ({ ...old, enabled: e.target.checked }))}/>
            Увімкнути конструктор
          </label>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white" aria-label="Закрити без збереження"><X size={22}/></button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-3 lg:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_325px] gap-4 max-w-[1800px] mx-auto">
          <section className="min-w-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <label className="text-xs space-y-1">Тип формації
                <select className={selectStyle} value={pattern} onChange={e => { setPattern(e.target.value); setError(''); }}>
                  {TP_SL_PATTERNS.map(([id,label]) => <option key={id} value={id}>{translatePhrase(language, label)}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1">Область дії правил
                <select className={selectStyle} value={scope} onChange={e => { setScope(e.target.value as 'global' | 'coin'); setError(''); }}>
                  <option value="global">Усі монети · ця формація</option>
                  <option value="coin">{t('ui.tpsl.scopeCoin', { symbol })}</option>
                </select>
              </label>
              <label className="text-xs space-y-1">Монета (будь-яка пара)
                <span className="flex gap-1">
                  <input aria-label="Торгова пара" className={selectStyle} value={symbolInput} list="tp-sl-symbols"
                    spellCheck={false} placeholder="BTCUSDT" onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); selectSymbol(); } }}/>
                  <datalist id="tp-sl-symbols"><option value="BTCUSDT"/><option value="ETHUSDT"/>
                    <option value="SOLUSDT"/><option value="XRPUSDT"/><option value="DOGEUSDT"/></datalist>
                  <button type="button" onClick={selectSymbol} className="rounded bg-cyan-800 px-2 text-xs shrink-0"
                    title="Завантажити свічки і вибрати монету">OK</button>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-1">
                <label className="text-xs space-y-1">Біржа графіка
                  <select className={selectStyle} value={exchange}
                    onChange={e => setExchange(e.target.value as 'binance' | 'bybit')}>
                    <option value="binance">Binance</option><option value="bybit">Bybit</option>
                  </select>
                </label>
                <label className="text-xs space-y-1">Таймфрейм
                  <select className={selectStyle} value={timeframe} onChange={e => setTimeframe(e.target.value as Timeframe)}>
                    <option value="1m">1m</option><option value="5m">5m</option>
                    <option value="15m">15m</option><option value="1h">1h</option>
                    <option value="4h">4h</option><option value="1d">1D</option>
                  </select>
                </label>
              </div>
            </div>
            <p className="text-[11px] text-cyan-300">
              {scope === 'global' ? translatePhrase(language, 'Глобальний шаблон: застосовується до кожної монети з цією формацією.') :
                t('ui.tpsl.coinTemplate', { symbol })}
              {' '}{translatePhrase(language, 'Налаштування пари однакові для Binance/Bybit та spot/futures.')}
              {symbolInput.trim().toUpperCase() !== symbol && ' ' + translatePhrase(language, 'Натисніть OK для вибору нової монети.')}
            </p>
            {loading && <p className="text-xs text-cyan-300">{translatePhrase(language, 'Завантаження реальних свічок…')}</p>}
            {fetchError && <p className="text-xs text-rose-400">{translatePhrase(language, fetchError)}</p>}
            <TpSlConstructorChart candles={candles} levels={levels} onDrag={move}/>
            <p className="text-[11px] text-slate-400">
              {t('ui.tpsl.chartExplanation')}
            </p>
            {sample && <div className="flex flex-wrap gap-4 text-xs text-slate-300">
              <span>{translatePhrase(language, 'Тінь свічки')} {bullish ? 'LOW' : 'HIGH'}: {sample.extreme.toPrecision(8)}</span>
              <span>ATR: {sample.atr.toPrecision(6)}</span>
              <span>{translatePhrase(language, 'Зараховано дотиків:')} <b>{touchCount} / {needed}</b></span>
            </div>}
          </section>
          <aside className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{scope === 'coin' ? t('ui.tpsl.rulesForCoin', { symbol }) : translatePhrase(language, 'Глобальні правила')} · {translatePhrase(language, TP_SL_PATTERNS.find(([id]) => id === pattern)?.[1] || pattern)}</h3>
              <button type="button" className="flex items-center gap-1 text-xs text-slate-300 border border-slate-700 rounded-lg px-2 py-1"
                onClick={resetRule}>
                <RotateCcw size={13}/> {translatePhrase(language, "Авто")}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {translatePhrase(language, custom ? 'Власний шаблон для цієї області дії' :
                scope === 'coin' && globalRule ? 'Шаблон успадковано від глобальних правил' :
                'Автоматичні правила — власного шаблону немає')}
              {' '}{t('ui.tpsl.templateCount', { count: coinRuleCount })}
            </p>
            <label className="flex items-center gap-2 text-xs rounded-lg bg-slate-950 p-2 border border-slate-800">
              <input type="checkbox" checked={rule.customLevelsEnabled} onChange={e => changeRule({ customLevelsEnabled: e.target.checked })}/>
              Змінювати Entry/TP/SL (окремо від фільтра дотиків)
            </label>
            {([
              ['entryAtrOffset', 'Зміщення Entry (ATR)'],
              ['stopAtrBuffer', 'Відступ SL (ATR)'],
              ['targetRiskReward', 'Ціль R:R (якщо TP не пересували)'],
            ] as const).map(([key,label]) => (
              <label key={`${scope}:${symbol}:${pattern}:${key}:${rule[key]}`} className="block text-xs space-y-1">
                <span className="text-slate-300">{translatePhrase(language, label)}</span>
                <input type="number" step="any" inputMode="decimal" defaultValue={rule[key]}
                  className={selectStyle} aria-label={translatePhrase(language, label)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  onBlur={e => {
                    const value = e.currentTarget.valueAsNumber;
                    if (!Number.isFinite(value)) setError('Введіть скінченне числове значення.');
                    else if (value !== rule[key]) changeRule({
                      [key]: value, customLevelsEnabled: true,
                      ...(key === 'targetRiskReward' ? { targetAtrOffset: undefined } : {}),
                    });
                  }}/>
              </label>
            ))}
            {rule.targetAtrOffset !== undefined && (
              <div className="rounded-lg border border-emerald-600/40 bg-emerald-950/20 p-2 space-y-2">
                <p className="text-xs text-emerald-300">{t('ui.tpsl.independentTarget', { offset: rule.targetAtrOffset.toPrecision(7) })}</p>
                <button type="button" className="text-xs underline text-slate-200"
                  onClick={() => changeRule({ targetAtrOffset: undefined })}>{translatePhrase(language, 'Повернути розрахунок TP через R:R')}</button>
              </div>
            )}
            {([
              ['lowTouches', 'Дотики Low (за тінями)', 1, 6, 1],
              ['highTouches', 'Дотики High (за тінями)', 1, 6, 1],
              ['touchTolerancePct', 'Допуск дотику (%)', .05, 2, .05],
              ['minTouchGap', 'Проміжок між дотиками (свічок)', 1, 15, 1],
            ] as const).map(([key,label,min,max,step]) => (
              <label key={key} className="block text-xs space-y-1">
                <span className="flex justify-between"><span className="text-slate-300">{translatePhrase(language, label)}</span><b>{rule[key]}</b></span>
                <input className="w-full accent-cyan-500" type="range" min={min} max={max} step={step}
                  value={rule[key]} onChange={e => changeRule({ [key]: Number(e.target.value) })}/>
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={rule.requireRejection}
                onChange={e => changeRule({ requireRejection: e.target.checked })}/>
              Вимагати відскок закритої свічки
            </label>
            {levels && <div className="rounded-lg bg-slate-950 p-3 text-[11px] font-mono space-y-2">
              {([
                ['entry', 'Entry'], ['target', 'TP'], ['stop', 'SL'],
              ] as const).map(([key,label]) => (
                <label key={`${scope}:${symbol}:${pattern}:${key}:${levels[key]}`} className="flex items-center gap-2">
                  <span className="w-12">{label}</span>
                  <input className={selectStyle} type="number" inputMode="decimal" step="any"
                    aria-label={t('ui.tpsl.levelPrice', { level: label })} defaultValue={Number(levels[key].toPrecision(10))}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    onBlur={e => {
                      const value = e.currentTarget.valueAsNumber;
                      if (!finite(value)) setError('Ціна має бути додатним числом.');
                      else if (value !== Number(levels[key].toPrecision(10))) move(key, value);
                    }}/>
                </label>
              ))}
            </div>}
            {levels && !geometryValid && <p role="alert" className="text-xs text-rose-400">
              {t('ui.tpsl.geometryWarning')}
            </p>}
            <p className="text-xs text-slate-500">
              {t('ui.tpsl.privacyNote')}
            </p>
          </aside>
        </div>
      </div>
      <footer className="flex flex-wrap gap-3 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 py-3">
        <div className="text-xs text-slate-400">{translatePhrase(language, draft.enabled ? 'Персональні правила активні після збереження' : 'Вимкнено: старий алгоритм без змін')}</div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-slate-800">Скасувати</button>
          <button disabled={saving || (draft.enabled && !geometryValid)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">
            <Save size={15}/>{translatePhrase(language, saving ? 'Збереження…' : 'Зберегти правила')}
          </button>
        </div>
        {error && <p role="alert" className="w-full text-xs text-rose-400">{translatePhrase(language, error)}</p>}
      </footer>
    </div>
  );
}
