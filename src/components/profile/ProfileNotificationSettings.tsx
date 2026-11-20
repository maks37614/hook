import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Volume2, Play, Save, CircleHelp, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useSiteNotifications } from '../../context/SiteNotificationsContext';
import {
  NOTIFICATION_CATEGORIES, normalizeImpulseSymbol, normalizeSymbolList,
  type NotificationCategoryKey, type SiteNotificationSettings,
} from '../../utils/siteNotifications';
import { playSiteNotificationSound, stopCustomNotificationSound } from '../../utils/domSound';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import {
  getCustomNotificationSound, removeCustomNotificationSound,
  listCustomNotificationSounds, selectCustomNotificationSound, customSoundDisplayName,
} from '../../utils/customNotificationSound';

type NumberSetting = 'impulseThresholdPct' | 'levelDistancePct' | 'roundDistancePct'
  | 'oiThresholdPct' | 'flowThresholdPct' | 'minBreakoutRvol' | 'liquidationMinUsd'
  | 'minQualityScore' | 'qualityImprovement' | 'minConfirmations' | 'cooldownMinutes';

const numericOptions: Array<{ key: NumberSetting; title: string; suffix: string; hint: string; step: string }> = [
  { key: 'levelDistancePct', title: 'Відстань до рівня', suffix: '%', hint: 'Entry, SL, TP, підтримка та опір', step: '0.05' },
  { key: 'roundDistancePct', title: 'Відстань до ROUND', suffix: '%', hint: 'Максимальна відстань від круглого числа', step: '0.05' },
  { key: 'oiThresholdPct', title: 'Аномалія OI', suffix: '%', hint: 'Модуль зміни Open Interest', step: '0.5' },
  { key: 'flowThresholdPct', title: 'Delta / CVD20', suffix: '%', hint: 'Поріг дисбалансу угод', step: '1' },
  { key: 'minBreakoutRvol', title: 'Мінімальний RVOL', suffix: '×', hint: 'Відношення до середнього обсягу', step: '0.5' },
  { key: 'liquidationMinUsd', title: 'Ліквідація від', suffix: 'USD', hint: 'Мінімальний розмір однієї події', step: '1000' },
  { key: 'minQualityScore', title: 'Якість сигналу від', suffix: '/100', hint: 'Для формацій та комплексного аналізу', step: '1' },
  { key: 'qualityImprovement', title: 'Крок покращення', suffix: 'балів', hint: 'Новий рівень рейтингу якості', step: '1' },
  { key: 'minConfirmations', title: 'Комплекс: факторів від', suffix: 'із 6', hint: 'Тільки незалежні наявні підтвердження', step: '1' },
  { key: 'cooldownMinutes', title: 'Повтор не частіше', suffix: 'хв', hint: 'Для оновлюваних показників OI / Delta', step: '1' },
];

const groupText: Record<string, string> = {
  'Ціна та рівні': 'Цінові умови, пробої й психологічні рівні',
  'Стакан та потік': 'Реальні потоки угод, ліквідації й ліквідність',
  'Формації та Quant': 'Ранні та підтверджені патерни, оцінка якості',
  'Особисте та система': 'Ваші обрані монети, нагляд та стан підключення',
};
const keyFor = (key: NotificationCategoryKey): keyof SiteNotificationSettings =>
  key === 'formation' ? 'formations' : key === 'impulse' ? 'impulses' : key;

export const ProfileNotificationSettings: React.FC = () => {
  const { language, t } = useLanguage();
  const { settings, updateSettings, soundEnabled, setSoundEnabled, error } = useSiteNotifications();
  const { user } = useAuth();
  const soundUid = user?.uid || 'guest';
  const [personalSoundName, setPersonalSoundName] = useState<string | null>(null);
  const [personalTracks, setPersonalTracks] = useState<Array<{ id: string; name: string; savedAt: number }>>([]);
  const [selectedPersonalId, setSelectedPersonalId] = useState('');
  const [soundLoading, setSoundLoading] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Locale changes must not trigger another personal sound library request.
  const translateRef = useRef(t);
  translateRef.current = t;
  const [help, setHelp] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(settings.impulseSymbol.replace(/USDT$/, ''));
  const [threshold, setThreshold] = useState(String(settings.impulseThresholdPct));
  const [symbols, setSymbols] = useState(settings.scopeSymbols);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSymbol(settings.impulseSymbol.replace(/USDT$/, ''));
    setThreshold(String(settings.impulseThresholdPct));
  }, [settings.impulseSymbol, settings.impulseThresholdPct]);
  useEffect(() => setSymbols(settings.scopeSymbols), [settings.scopeSymbols]);
  useEffect(() => {
    let active = true;
    setPersonalSoundName(null);
    setPersonalTracks([]);
    setSelectedPersonalId('');
    if (soundUid === 'guest') return;
    void Promise.all([
      getCustomNotificationSound(soundUid),
      listCustomNotificationSounds(soundUid),
    ]).then(([sound, library]) => {
      if (!active) return;
      setPersonalSoundName(sound?.name ?? null);
      setPersonalTracks(library.tracks);
      setSelectedPersonalId(library.selectedId);
    }).catch(() => {
      if (active) setSoundError(translateRef.current('notifications.sound.readError'));
    });
    return () => { active = false; };
  }, [soundUid]);

  const refreshSoundLibrary = async () => {
    const [sound, library] = await Promise.all([
      getCustomNotificationSound(soundUid),
      listCustomNotificationSounds(soundUid),
    ]);
    setPersonalSoundName(sound?.name ?? null);
    setPersonalTracks(library.tracks);
    setSelectedPersonalId(library.selectedId);
    return library;
  };

  const choosePersonalSound = async (id: string) => {
    setSoundLoading(true);
    setSoundError(null);
    try {
      stopCustomNotificationSound();
      await selectCustomNotificationSound(soundUid, id);
      await refreshSoundLibrary();
      update({ sound: 'custom', soundChosen: true });
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : t('notifications.sound.selectError'));
    } finally {
      setSoundLoading(false);
    }
  };

  const deletePersonalSound = async () => {
    if (!selectedPersonalId) return;
    setSoundLoading(true);
    setSoundError(null);
    try {
      stopCustomNotificationSound();
      await removeCustomNotificationSound(soundUid, selectedPersonalId);
      const library = await refreshSoundLibrary();
      if (library.tracks.length === 0 && settingsRef.current.sound === 'custom') update({ sound: 'alert35', soundChosen: true });
      setMessage(t('notifications.sound.deleted'));
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : t('notifications.sound.deleteError'));
    } finally {
      setSoundLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof NOTIFICATION_CATEGORIES[number][]>();
    for (const item of NOTIFICATION_CATEGORIES) groups.set(item.group, [...(groups.get(item.group) || []), item]);
    return [...groups.entries()];
  }, []);

  const update = (patch: Partial<SiteNotificationSettings>) => {
    setMessage(null);
    void updateSettings(patch);
  };
  const toggle = (key: NotificationCategoryKey, checked: boolean) => {
    update({ [keyFor(key)]: checked });
  };
  const saveImpulse = () => {
    const clean = normalizeImpulseSymbol(symbol);
    const n = Number(threshold.replace(',', '.'));
    if (!clean || !Number.isFinite(n) || n < .1 || n > 50) {
      setFormError(t('notifications.impulse.invalid'));
      return;
    }
    setFormError(null);
    update({ impulseSymbol: clean, impulseThresholdPct: n, impulses: true });
    setMessage(t('notifications.impulse.saved'));
  };
  const enableBrowser = async (checked: boolean) => {
    if (!checked) { update({ browserPush: false }); return; }
    if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
      setFormError(t('notifications.browser.unsupported'));
      return;
    }
    const result = await Notification.requestPermission();
    // Permission dialogs are asynchronous. The master switch could be turned
    // off before the browser answers: never re-enable pushes after opt-out.
    if (!settingsRef.current.enabled || !settingsRef.current.optedIn) {
      setFormError(t('notifications.browser.disabled'));
      return;
    }
    if (result === 'granted') { update({ browserPush: true }); setFormError(null); }
    else setFormError(t('notifications.browser.denied'));
  };
  const reset = () => {
    const patch: Partial<SiteNotificationSettings> = { enabled: false, browserPush: false };
    for (const item of NOTIFICATION_CATEGORIES) (patch as Record<string, unknown>)[keyFor(item.key)] = false;
    update(patch);
    setMessage(t('notifications.center.reset'));
  };

  return (
    <section aria-label={translatePhrase(language, "Налаштування сповіщень")} className="space-y-4 text-slate-200">
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Bell className="h-4 w-4 text-cyan-300" /> {translatePhrase(language, 'Центр сповіщень')}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              {translatePhrase(language, 'Сповіщення обробляються у вашому браузері з уже доступних даних сайту. Додатковий повний пошук монет не запускається. Спочатку увімкніть потрібні категорії.')}
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-cyan-500/25 bg-slate-900 px-3 py-2 text-xs font-semibold">
            {translatePhrase(language, settings.enabled ? 'Увімкнено' : 'Вимкнено')}
            <input type="checkbox" checked={settings.enabled} onChange={e => update({
              enabled: e.target.checked,
              optedIn: e.target.checked || settings.optedIn,
              ...(e.target.checked ? {} : { browserPush: false }),
            })} className="h-4 w-4 accent-cyan-400" aria-label={translatePhrase(language, "Дозволити сповіщення на сайті")} />
          </label>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          {translatePhrase(language, 'Цей перемикач керує тільки сповіщеннями та звуком на відкритому h00k.top. Він не впливає на цінові алерти або персональний нагляд, налаштовані в інших розділах. Коли сайт закрито, локальні сповіщення не працюють.')}
        </p>
      </div>

      {grouped.map(([group, items]) => (
        <section key={group} className="overflow-hidden rounded-xl border border-slate-700/75 bg-slate-950/50">
          <header className="border-b border-slate-800 px-3 py-3 sm:px-4">
            <h4 className="text-sm font-bold text-slate-100">{translatePhrase(language, group)}</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{translatePhrase(language, groupText[group])}</p>
          </header>
          <div className="divide-y divide-slate-800/70">
            {items.map(item => {
              const key = keyFor(item.key);
              const checked = settings[key] === true;
              const isHelpOpen = help === item.key;
              return (
                <div key={item.key} className="px-3 py-2.5 sm:px-4">
                  <div className="flex items-center gap-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-xs sm:text-sm">
                      <input type="checkbox" checked={checked} disabled={!settings.enabled}
                        aria-label={translatePhrase(language, 'Увімкнути:') + ' ' + translatePhrase(language, item.label)}
                        onChange={e => toggle(item.key, e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-cyan-400 disabled:opacity-30" />
                      <span className={settings.enabled ? 'min-w-0 font-medium' : 'min-w-0 text-slate-500'}>{translatePhrase(language, item.label)}</span>
                    </label>
                    <button type="button" aria-label={translatePhrase(language, 'Що означає:') + ' ' + translatePhrase(language, item.label)}
                      aria-expanded={isHelpOpen} onClick={() => setHelp(isHelpOpen ? null : item.key)}
                      title={translatePhrase(language, "Опис сповіщення")} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-700/60 bg-cyan-950/25 text-sm font-bold text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-300">!</button>
                  </div>
                  {isHelpOpen && <div className="ml-6 mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-relaxed text-slate-300">
                    {translatePhrase(language, item.explanation)}
                    <div className="mt-1.5 text-[10px] text-cyan-300">{translatePhrase(language, 'Джерело даних:')} {translatePhrase(language, item.source)}</div>
                  </div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="h-4 w-4 text-cyan-300"/> {translatePhrase(language, 'Що саме відстежувати')}</h4>
        <p className="text-xs leading-relaxed text-slate-400">
          {translatePhrase(language, 'Фільтри біржі, ринку, таймфрейму та монет діють для подій із відповідними даними. Цінові алерти, ліквідації та WebSocket-імпульси не прив’язані до таймфрейму графіка. Технічні попередження можуть надходити незалежно від фільтрів монет. Решта подій без потрібної біржі, ринку або таймфрейму не надходитиме.')}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs">Біржа
            <select value={settings.scopeExchange} onChange={e => update({ scopeExchange: e.target.value as SiteNotificationSettings['scopeExchange'] })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value="all">Усі біржі</option><option value="binance">Binance</option><option value="bybit">Bybit</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">Ринок
            <select value={settings.scopeMarket} onChange={e => update({ scopeMarket: e.target.value as SiteNotificationSettings['scopeMarket'] })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value="all">{translatePhrase(language, 'Усі ринки')}</option><option value="futures">Ф'ючерси</option><option value="spot">Спот</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">Таймфрейм
            <select value={settings.scopeTimeframe} onChange={e => update({ scopeTimeframe: e.target.value as SiteNotificationSettings['scopeTimeframe'] })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value="all">Усі таймфрейми</option>
              {['1m','5m','15m','1h','4h','1d'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={settings.onlyFavorites} onChange={e => update({ onlyFavorites: e.target.checked })} className="accent-cyan-400"/>
          Лише мої обрані монети
        </label>
        <div className="block space-y-1 text-xs">
          <input aria-label="Монети для сповіщень" value={symbols} onChange={e => setSymbols(e.target.value)} onBlur={() => update({ scopeSymbols: normalizeSymbolList(symbols) })}
            placeholder="BTC, ETH, SOL — пусто означає всі" maxLength={250}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">Використовуються лише вже доступні котирування. Увімкнення сповіщень не запускає додатковий повний скан усіх бірж.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold"><CircleHelp className="h-4 w-4 text-cyan-300"/> Пороги спрацювання</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numericOptions.map(option => (
            <label key={option.key} className="space-y-1 text-[11px] text-slate-300">
              <span className="block font-semibold">{translatePhrase(language, option.title)} ({translatePhrase(language, option.suffix)})</span>
              <input type="number" defaultValue={settings[option.key]} key={option.key + ':' + settings[option.key]}
                onBlur={e => update({ [option.key]: Number(e.target.value) })}
                step={option.step} min="0"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>
              <span className="block text-slate-500">{translatePhrase(language, option.hint)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-cyan-700/30 bg-slate-950/60 p-3 sm:p-4">
        <h4 className="text-sm font-bold">{translatePhrase(language, 'Імпульси та ліквідації — монета')}</h4>
        <p className="text-xs leading-relaxed text-slate-400">{translatePhrase(language, 'Виберіть одну монету для WebSocket-потоків. Немає зайвих запитів, поки обидва перемикачі вимкнені.')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">{translatePhrase(language, 'Назва монети')}
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="BTC або BTCUSDT" maxLength={30}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>
          </label>
          <label className="space-y-1 text-xs">{translatePhrase(language, 'Зміна ціни (%)')}
            <input value={threshold} onChange={e => setThreshold(e.target.value)} inputMode="decimal"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>
          </label>
          <label className="space-y-1 text-xs">Біржа
            <select value={settings.impulseExchange} onChange={e => update({ impulseExchange: e.target.value as SiteNotificationSettings['impulseExchange'] })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value="binance">Binance</option><option value="bybit">Bybit</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">{translatePhrase(language, 'Ринок (імпульси)')}
            <select value={settings.impulseMarket} onChange={e => update({ impulseMarket: e.target.value as SiteNotificationSettings['impulseMarket'] })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value="futures">Ф'ючерси</option><option value="spot">Спот</option>
            </select>
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">{translatePhrase(language, 'Тривалість вікна')}
            <select value={settings.impulseWindowMinutes}
              onChange={e => update({ impulseWindowMinutes: Number(e.target.value) as 1 | 5 | 15 })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value={1}>{translatePhrase(language, '1 хвилина')}</option><option value={5}>{translatePhrase(language, '5 хвилин')}</option><option value={15}>{translatePhrase(language, '15 хвилин')}</option>
            </select>
          </label>
        </div>
        <button type="button" onClick={saveImpulse} disabled={!settings.enabled}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          <Save className="h-4 w-4"/> {translatePhrase(language, 'Зберегти монету й увімкнути імпульси')}
        </button>
        <p className="text-xs leading-relaxed text-slate-400">{translatePhrase(language, 'Імпульси та великі ліквідації працюють лише з відкритою сторінкою. Для ліквідацій використовується ф’ючерсний потік обраної біржі.')}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold"><Volume2 className="h-4 w-4 text-cyan-300"/> Як отримувати</h4>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-xs">Звук
            <select value={settings.sound} onChange={e => update({ sound: e.target.value as SiteNotificationSettings['sound'], soundChosen: true })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white">
              <option value="alert35">{translatePhrase(language, 'Стандартний звук h00k')}</option>
              <option value="chime">{translatePhrase(language, 'Дзвін')}</option><option value="soft">{translatePhrase(language, 'М’який')}</option><option value="pulse">{translatePhrase(language, 'Подвійний імпульс')}</option>
              {(personalSoundName || settings.sound === 'custom') && <option value="custom">{translatePhrase(language, 'Моя мелодія')}</option>}
            </select>
          </label>
          <button type="button" onClick={() => playSiteNotificationSound(settings.sound, soundUid)}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-700 px-3 py-2 text-xs text-cyan-300">
            <Play className="h-4 w-4" /> {translatePhrase(language, 'Прослухати')}
          </button>
        </div>
        {/* Existing personal MP3s remain playable and removable, but uploads
            are deliberately no longer exposed to any user. */}
        {personalTracks.length > 0 && (
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-300">{translatePhrase(language, 'Раніше збережені мелодії')} ({personalTracks.length})</span>
              <button type="button" disabled={soundLoading}
                onClick={() => void deletePersonalSound()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-2 text-xs text-slate-300 hover:text-rose-300 disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" /> {translatePhrase(language, 'Видалити вибрану')}
              </button>
            </div>
            <select
              aria-label={translatePhrase(language, "Вибрати одну зі своїх мелодій")}
              disabled={soundLoading}
              value={selectedPersonalId}
              onChange={event => void choosePersonalSound(event.target.value)}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white sm:text-sm"
            >
              {personalTracks.map(track => (
                <option data-no-translate key={track.id} value={track.id}>{customSoundDisplayName(track.name)}</option>
              ))}
            </select>
          </div>
        )}
        {settings.sound === 'custom' && !personalSoundName && (
          <p role="status" className="text-xs text-amber-300">
            {translatePhrase(language, 'На цьому пристрої раніше вибраної мелодії немає. Оберіть один із вбудованих сигналів.')}
          </p>
        )}
        {soundError && <p role="alert" className="text-xs text-rose-300">{translatePhrase(language, soundError)}</p>}
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>Звукове сповіщення</span>
          <input type="checkbox" checked={soundEnabled} disabled={!settings.enabled}
            onChange={e => void setSoundEnabled(e.target.checked)} className="h-4 w-4 accent-cyan-400"/>
        </label>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>{translatePhrase(language, 'Сповіщення браузера, якщо вкладка згорнута')}</span>
          <input type="checkbox" checked={settings.browserPush} disabled={!settings.enabled}
            onChange={e => void enableBrowser(e.target.checked)} className="h-4 w-4 accent-cyan-400"/>
        </label>
        <p className="text-xs leading-relaxed text-slate-500">
          {translatePhrase(language, 'Звук і браузерні повідомлення вимагають відкритого сайту. У фонових вкладках Android та iOS сповіщення можуть призупинятися.')}
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-rose-700/50 px-3 py-2 text-xs text-rose-300">
          <BellOff className="h-4 w-4"/> {translatePhrase(language, 'Вимкнути всі сповіщення сайту')}
        </button>
        <span className="text-sm font-medium text-slate-300">{translatePhrase(language, 'Зміни зберігаються автоматично')}</span>
      </div>
      {formError && <p role="alert" className="rounded-lg border border-rose-500/40 p-3 text-xs text-rose-300"><ShieldAlert className="mr-1 inline h-4 w-4" />{translatePhrase(language, formError)}</p>}
      {message && <p role="status" className="text-xs text-emerald-300">{translatePhrase(language, message)}</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{translatePhrase(language, error)}</p>}
    </section>
  );
};
