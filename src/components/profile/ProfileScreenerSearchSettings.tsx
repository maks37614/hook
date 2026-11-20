import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, BookmarkPlus, CheckCircle2, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import type { ScreenerSearchConfig, SearchUserSettings } from '../../types';
import { getStoredPreferences } from '../../utils/userPreferences';
import { SCREENER_VOLUME_CAPS, preferredVolumeSortOrder } from '../../utils/screenerVolume';
import {
  MAX_SCREENER_SEARCH_PRESETS, SCREENER_SEARCH_SORT_OPTIONS,
  normalizeScreenerSearchConfig, normalizeScreenerSearchSettings,
} from '../../utils/screenerSearchSettings';

const control = 'w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none';
const label = 'block space-y-1 text-xs font-medium text-slate-300';

const filters = [
  { value: 'all', label: 'Усі монети' },
  { value: 'active', label: 'Активні' },
  { value: 'top_gainers', label: 'Топ зростання' },
  { value: 'top_losers', label: 'Топ падіння' },
  { value: 'near_highs', label: 'Біля максимумів' },
  { value: 'near_lows', label: 'Біля мінімумів' },
] as const;

function preferredFallback(profile: { defaultExchange?: ScreenerSearchConfig['exchange']; defaultMarketType?: ScreenerSearchConfig['marketType'] } | null) {
  const stored = getStoredPreferences();
  return {
    exchange: profile?.defaultExchange ?? stored.defaultExchange,
    marketType: profile?.defaultMarketType ?? stored.defaultMarketType,
  };
}

/** Profile-only editor. No quote polling, chart mounting or exchange requests. */
export function ProfileScreenerSearchSettings() {
  const { user, profile, updateProfileData } = useAuth();
  const { t, language } = useLanguage();
  const numberLocale = { uk: 'uk-UA', en: 'en-US', ru: 'ru-RU', pl: 'pl-PL' }[language];
  const fallback = preferredFallback(profile);
  const fallbackExchange = fallback.exchange;
  const fallbackMarketType = fallback.marketType;
  const stored = useMemo(() => normalizeScreenerSearchSettings(profile?.searchSettings, {
    exchange: fallbackExchange, marketType: fallbackMarketType,
  }), [profile?.searchSettings, fallbackExchange, fallbackMarketType]);
  const [draft, setDraft] = useState<ScreenerSearchConfig>(() =>
    normalizeScreenerSearchConfig(stored.defaultConfig, fallback));
  const [presetName, setPresetName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.uid || profile?.uid !== user.uid) return;
    setDraft(normalizeScreenerSearchConfig(stored.defaultConfig, fallback));
    setPresetName('');
    setEditingId(null);
    setMessage('');
    setError('');
    // Switching accounts must never carry edited search presets across users.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.uid]);

  const setField = <K extends keyof ScreenerSearchConfig>(key: K, value: ScreenerSearchConfig[K]) => {
    setDraft(previous => {
      const next = { ...previous, [key]: value };
      // Keep the profile editor consistent with the Screener's volume filter:
      // changing the threshold or direction shows the closest matching coins first.
      // Explicit manual changes to sortOrder remain available.
      if ((key === 'volumeMode' || key === 'maxVolumeUsd' || (key === 'sortBy' && value === 'volume'))
        && next.sortBy === 'volume') {
        next.sortOrder = preferredVolumeSortOrder(next.volumeMode);
      }
      return normalizeScreenerSearchConfig(next, fallback);
    });
    setMessage('');
  };

  const write = async (next: SearchUserSettings, successMessage: string): Promise<boolean> => {
    if (savingRef.current || !user?.uid || profile?.uid !== user.uid) return false;
    savingRef.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await updateProfileData({ searchSettings: normalizeScreenerSearchSettings(next, fallback) });
      setMessage(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося зберегти налаштування пошуку');
      return false;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const hasInvalidPriceRange = draft.minPriceUsd > 0 && draft.maxPriceUsd > 0
    && draft.minPriceUsd > draft.maxPriceUsd;
  const saveDefault = () => {
    if (hasInvalidPriceRange) { setError('Мінімальна ціна не може перевищувати максимальну.'); return; }
    void write({
      ...stored, defaultConfig: normalizeScreenerSearchConfig(draft, fallback), defaultPresetId: null,
    }, 'Налаштування за замовчуванням збережено для Скрінера.');
  };

  const savePreset = () => {
    if (hasInvalidPriceRange) { setError('Мінімальна ціна не може перевищувати максимальну.'); return; }
    const name = presetName.trim();
    if (!name) { setError('Введіть назву пресета.'); return; }
    const presets = stored.presets || [];
    const isEditingExisting = !!editingId && presets.some(item => item.id === editingId);
    if (!isEditingExisting && presets.length >= MAX_SCREENER_SEARCH_PRESETS) {
      setError('Досягнуто ліміт 12 пресетів. Видаліть непотрібний.'); return;
    }
    if (presets.some(item => item.name.toLowerCase() === name.toLowerCase() && item.id !== editingId)) {
      setError('Пресет із такою назвою вже існує.'); return;
    }
    const id = isEditingExisting ? editingId!
      : (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const item = { id, name: name.slice(0, 40), config: normalizeScreenerSearchConfig(draft, fallback) };
    const next = isEditingExisting ? presets.map(p => p.id === editingId ? item : p) : [...presets, item];
    void write({ ...stored, presets: next }, isEditingExisting ? 'Пресет оновлено.' : 'Пресет створено.')
      .then(saved => { if (saved) setEditingId(id); });
  };

  const choosePreset = (id: string) => {
    const preset = stored.presets?.find(item => item.id === id);
    if (!preset) return;
    setEditingId(id);
    setPresetName(preset.name);
    setDraft(normalizeScreenerSearchConfig(preset.config, fallback));
    setMessage('');
    setError('');
  };

  const defaultPreset = (id: string) => void write({
    ...stored, defaultPresetId: id,
  }, 'Обраний пресет застосовуватиметься при відкритті Скрінера.');

  const removePreset = (id: string) => {
    void write({
      ...stored,
      presets: (stored.presets || []).filter(item => item.id !== id),
      defaultPresetId: stored.defaultPresetId === id ? null : stored.defaultPresetId,
    }, 'Пресет видалено.').then(saved => {
      // On failed profile writes, preserve the selected preset and any unsaved edits.
      if (saved && editingId === id) {
        setEditingId(null);
        setPresetName('');
        setDraft(normalizeScreenerSearchConfig(stored.defaultConfig, fallback));
      }
    });
  };

  if (!user?.uid || profile?.uid !== user.uid) return <p className="text-sm text-slate-400">Завантаження налаштувань пошуку…</p>;

  return <div className="space-y-5">
    <div className="rounded-xl border border-cyan-500/25 bg-slate-950/70 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-cyan-200"><Search size={16}/> Пошук монет у Скрінері</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Налаштування діють лише на сторінці «Скрінер». Пошук, фільтри й порядок монет використовують уже завантажені ринкові дані;
        HookChart, Формації та Раннє виявлення не змінюються.
      </p>
    </div>

    <section className="space-y-4 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">{editingId ? 'Редагування пресета' : 'Редактор фільтрів і сортування'}</h4>
        <button type="button" disabled={busy} onClick={() => {
          setEditingId(null); setPresetName('');
          setDraft(normalizeScreenerSearchConfig(stored.defaultConfig, fallback)); setMessage(''); setError('');
        }} className="text-xs text-cyan-300 hover:text-white disabled:opacity-50">
          Налаштувати стандартні параметри
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>Пошук за монетою
          <input className={control} value={draft.searchQuery} maxLength={80}
            placeholder="Наприклад, BTC або ETH"
            onChange={event => setField('searchQuery', event.target.value)} />
          <span className="block text-xs font-normal leading-relaxed text-slate-400">
            Необов’язково. Якщо залишити поле порожнім, скрінер шукатиме всі монети, які відповідають вибраним фільтрам.
          </span>
        </label>
        <label className={label}>Готовий фільтр Скрінера
          <select className={control} value={draft.presetFilter} onChange={event => setField('presetFilter', event.target.value as ScreenerSearchConfig['presetFilter'])}>
            {filters.map(option => <option key={option.value} value={option.value}>{translatePhrase(language, option.label)}</option>)}
          </select>
        </label>
        <label className={label}>Біржа
          <select className={control} value={draft.exchange} onChange={event => setField('exchange', event.target.value as ScreenerSearchConfig['exchange'])}>
            <option value="all">Усі біржі</option><option value="binance">Binance</option><option value="bybit">Bybit</option>
          </select>
        </label>
        <label className={label}>Ринок
          <select className={control} value={draft.marketType} onChange={event => setField('marketType', event.target.value as ScreenerSearchConfig['marketType'])}>
            <option value="all">{translatePhrase(language, 'Усі ринки')}</option><option value="futures">Ф’ючерси</option><option value="spot">Спот</option>
          </select>
        </label>
        <div className={label}>
          <span>{t('screenerVolume24h')}</span>
          <div className="flex min-w-0 items-center gap-2">
            <select aria-label={translatePhrase(language, 'Межа обсягу за 24 години')} className={control} value={draft.maxVolumeUsd}
              onChange={event => setField('maxVolumeUsd', Number(event.target.value))}>
              <option value={0}>{t('screenerVolumeUnlimited')}</option>
              {draft.maxVolumeUsd > 0 && !SCREENER_VOLUME_CAPS.some(option => option.value === draft.maxVolumeUsd) && (
                <option value={draft.maxVolumeUsd}>
                  {draft.volumeMode === 'from' ? '≥' : '≤'} ${new Intl.NumberFormat(numberLocale, { notation: 'compact', maximumFractionDigits: 2 }).format(draft.maxVolumeUsd)}
                </option>
              )}
              {SCREENER_VOLUME_CAPS.map(option => <option key={option.value} value={option.value}>
                {draft.volumeMode === 'from' ? '≥' : '≤'} {option.label.replace(/^До /, '')}
              </option>)}
            </select>
            <button type="button"
              aria-label={translatePhrase(language, draft.volumeMode === 'to' ? 'Перемкнути обсяг на Від (≥)' : 'Перемкнути обсяг на До (≤)')}
              aria-pressed={draft.volumeMode === 'from'}
              title={translatePhrase(language, draft.volumeMode === 'to' ? 'До вибраного обсягу включно (≤). Перемкнути на Від.' : 'Від вибраного обсягу включно (≥). Перемкнути на До.')}
              onClick={() => setField('volumeMode', draft.volumeMode === 'to' ? 'from' : 'to')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-cyan-300 hover:border-cyan-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500">
              {draft.volumeMode === 'to' ? <ArrowDownToLine size={16} /> : <ArrowUpToLine size={16} />}
            </button>
          </div>
          <p className="text-[11px] font-normal leading-relaxed text-slate-400">
            {draft.volumeMode === 'from' ? '≥ — від вибраної суми включно' : '≤ — до вибраної суми включно'}.
            {draft.sortBy === 'volume' ? ' Найближчі до межі монети показуються першими, якщо не змінити порядок вручну.' : ''}
          </p>
        </div>
        <div className="col-span-full space-y-4 rounded-xl border border-cyan-500/20 bg-slate-900/40 p-3 sm:p-4">
          <div>
            <h5 className="text-sm font-semibold text-cyan-200">Розширені фільтри пошуку</h5>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Порожнє поле вимикає фільтр. Для числових мінімумів 0 також означає «без обмежень»,
              але для відстані до High/Low значення 0% означає точне торкання рівня.
              Використовуються лише вже отримані котирування й кеш формацій — без окремих запитів та сканування.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={label}>Мінімальна волатильність 5m, %
              <input type="number" inputMode="decimal" min={0} max={1000} step={0.1} className={control}
                placeholder="Необмежено" value={draft.minVolatility5mPct || ''}
                onChange={event => setField('minVolatility5mPct', Number(event.target.value))}/>
              <span className="block font-normal leading-relaxed text-slate-400">
                Активні рухи за 5 хв. Для частини монет значення 5m може бути розрахунковою оцінкою.
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Ціна від, $
                <input type="number" inputMode="decimal" min={0} step="any" className={control}
                  placeholder="0,01" value={draft.minPriceUsd || ''}
                  onChange={event => setField('minPriceUsd', Number(event.target.value))}/>
              </label>
              <label className={label}>Ціна до, $
                <input type="number" inputMode="decimal" min={0} step="any" className={control}
                  placeholder="10" value={draft.maxPriceUsd || ''}
                  onChange={event => setField('maxPriceUsd', Number(event.target.value))}/>
              </label>
              {hasInvalidPriceRange && <p role="alert" className="col-span-2 text-xs text-rose-300">
                Ціна «від» не може бути більшою за «до».
              </p>}
            </div>
            <label className={label}>До 24h High, відстань %
              <input type="number" inputMode="decimal" min={0} max={100} step={0.1} className={control}
                placeholder="Необмежено" value={draft.maxDistanceToHighPct ?? ''}
                onChange={event => setField('maxDistanceToHighPct', event.target.value === '' ? null : Number(event.target.value))}/>
              <span className="block font-normal text-slate-400">Наприклад, 2 = не далі ніж 2% від максимуму 24г.</span>
            </label>
            <label className={label}>До 24h Low, відстань %
              <input type="number" inputMode="decimal" min={0} max={100} step={0.1} className={control}
                placeholder="Необмежено" value={draft.maxDistanceToLowPct ?? ''}
                onChange={event => setField('maxDistanceToLowPct', event.target.value === '' ? null : Number(event.target.value))}/>
              <span className="block font-normal text-slate-400">Якщо задані обидва рівні, повинні виконуватися обидві умови.</span>
            </label>
            <label className="col-span-full flex items-start gap-2 rounded-lg border border-slate-700/70 p-3 text-sm text-slate-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
                checked={draft.onlyWithFormations} onChange={event => setField('onlyWithFormations', event.target.checked)}/>
              <span><strong className="font-semibold">Тільки монети з формаціями</strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  Показувати монети зі знайденими формаціями з уже наявного кешу стандартного сканера.
                  Непроскановані монети не проходять цей фільтр.
                </span>
              </span>
            </label>
            <label className={label}>Open Interest (OI) від, $
              <input type="number" inputMode="decimal" min={0} step="any" className={control}
                placeholder="Необмежено" value={draft.minOpenInterestUsd || ''}
                onChange={event => setField('minOpenInterestUsd', Number(event.target.value))}/>
              <span className="block font-normal leading-relaxed text-slate-400">
                Доступні реальні OI з котирувань (зараз переважно Bybit Futures). Без даних OI монета не проходить активний фільтр.
              </span>
            </label>
            <div className="space-y-2">
              <label className={label}>Funding Rate
                <select className={control} value={draft.fundingRateDirection}
                  onChange={event => setField('fundingRateDirection', event.target.value as ScreenerSearchConfig['fundingRateDirection'])}>
                  <option value="any">Не фільтрувати</option>
                  <option value="positive">Позитивний (+)</option>
                  <option value="negative">Негативний (−)</option>
                </select>
              </label>
              <label className={label}>Мінімальний |Funding|, %
                <input type="number" inputMode="decimal" min={0} max={100} step={0.001} className={control}
                  placeholder="Необмежено" value={draft.minFundingRateAbsPct || ''}
                  onChange={event => setField('minFundingRateAbsPct', Number(event.target.value))}/>
              </label>
              <p className="text-xs leading-relaxed text-slate-400">
                Береться з наявних ф’ючерсних котирувань. Якщо Funding недоступний, увімкнений фільтр його не вигадує.
              </p>
            </div>
            <label className={label}>RVOL підтвердженого пробою, від ×
              <select className={control} value={draft.minBreakoutRvol}
                onChange={event => setField('minBreakoutRvol', Number(event.target.value))}>
                <option value={0}>Не фільтрувати</option>
                <option value={1}>Від 1×</option>
                <option value={1.2}>Від 1,2×</option>
                <option value={1.5}>Від 1,5×</option>
                <option value={2}>Від 2×</option>
                <option value={3}>Від 3×</option>
              </select>
              <span className="block font-normal leading-relaxed text-slate-400">
                Обсяг свічки підтвердженого пробою відносно попередніх 20 закритих свічок.
                Використовується лише перевірений RVOL з кешу формацій, не загальний RVOL кожної монети.
              </span>
            </label>
          </div>
          <p className="text-xs leading-relaxed text-amber-200/80">
            Важливо: OI, Funding, RVOL та формації можуть бути доступні не для всіх монет. Увімкнені
            фільтри не пропускають монети без потрібних даних; нові запити до бірж не додаються.
          </p>
        </div>
        <div className="hidden sm:block" aria-hidden="true" />
        <label className={label}>Основний показник сортування
          <select className={control} value={draft.sortBy} onChange={event => setField('sortBy', event.target.value as ScreenerSearchConfig['sortBy'])}>
            {SCREENER_SEARCH_SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{translatePhrase(language, option.label)}</option>)}
          </select>
        </label>
        <label className={label}>Порядок основного показника
          <select className={control} value={draft.sortOrder} onChange={event => setField('sortOrder', event.target.value as ScreenerSearchConfig['sortOrder'])}>
            <option value="desc">{translatePhrase(language, 'За спаданням ↓')}</option><option value="asc">{translatePhrase(language, 'За зростанням ↑')}</option>
          </select>
        </label>
        <label className={label}>Другий пріоритет (за однакових значень)
          <select className={control} value={draft.secondarySortBy} onChange={event => setField('secondarySortBy', event.target.value as ScreenerSearchConfig['secondarySortBy'])}>
            <option value="none">Без другого показника</option>
            {SCREENER_SEARCH_SORT_OPTIONS.filter(option => option.value !== draft.sortBy).map(option =>
              <option key={option.value} value={option.value}>{translatePhrase(language, option.label)}</option>)}
          </select>
        </label>
        <label className={label}>Порядок другого показника
          <select className={control} disabled={draft.secondarySortBy === 'none'} value={draft.secondarySortOrder}
            onChange={event => setField('secondarySortOrder', event.target.value as ScreenerSearchConfig['secondarySortOrder'])}>
            <option value="desc">{translatePhrase(language, 'За спаданням ↓')}</option><option value="asc">{translatePhrase(language, 'За зростанням ↑')}</option>
          </select>
        </label>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">Другий показник визначає порядок лише тоді, коли значення першого однакові. Сортування не створює нових запитів до бірж.</p>
      <button type="button" disabled={busy} onClick={saveDefault}
        className="rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
        Зберегти як налаштування за замовчуванням
      </button>
      <div className="border-t border-slate-800 pt-4">
        <label className={label}>Назва власного пресета
          <input className={control} maxLength={40} value={presetName} placeholder="Наприклад, Скальпінг"
            onChange={event => { setPresetName(event.target.value); setError(''); }} />
        </label>
        <button type="button" disabled={busy} onClick={savePreset}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2.5 text-xs font-semibold text-cyan-200 hover:border-cyan-400 disabled:opacity-50">
          <BookmarkPlus size={15} /> {editingId ? 'Оновити пресет' : 'Створити пресет'}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{translatePhrase(language, error)}</p>}
      {message && <p role="status" className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={14}/>{translatePhrase(language, message)}</p>}
    </section>

    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-white">{translatePhrase(language, 'Мої пресети')} ({stored.presets?.length ?? 0}/{MAX_SCREENER_SEARCH_PRESETS})</h4>
      {(!stored.presets || stored.presets.length === 0) && <p className="text-xs text-slate-400">Ще немає збережених пресетів. Створіть перший у редакторі вище.</p>}
      {(stored.presets || []).map(item => <div key={item.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
        <div className="min-w-0">
          <div data-no-translate className="break-words text-sm font-semibold text-slate-100">{item.name}</div>
          <p className="mt-1 text-[11px] text-slate-400">
            {translatePhrase(language, SCREENER_SEARCH_SORT_OPTIONS.find(option => option.value === item.config.sortBy)?.label ?? item.config.sortBy)}
            {stored.defaultPresetId === item.id ? translatePhrase(language, ' · За замовчуванням') : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => choosePreset(item.id)}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:border-cyan-500 disabled:opacity-50">{translatePhrase(language, 'Редагувати')}</button>
          <button type="button" disabled={busy || stored.defaultPresetId === item.id} onClick={() => defaultPreset(item.id)}
            className="rounded-lg border border-cyan-700/60 px-2.5 py-1.5 text-xs text-cyan-300 hover:border-cyan-400 disabled:opacity-50">{translatePhrase(language, 'Зробити стандартним')}</button>
          <button type="button" aria-label={translatePhrase(language, 'Видалити пресет') + ' ' + item.name} disabled={busy} onClick={() => removePreset(item.id)}
            className="rounded-lg border border-rose-900/50 p-1.5 text-rose-300 hover:bg-rose-950/50 disabled:opacity-50"><Trash2 size={15}/></button>
        </div>
      </div>)}
    </section>
  </div>;
}
