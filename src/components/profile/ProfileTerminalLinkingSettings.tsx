import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, Save, PlugZap, RefreshCw, BookOpen, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DesktopRemoteLinkSettings } from './DesktopRemoteLinkSettings';
import { desktopRemoteLinkEnabled, desktopRemoteLinkStatus } from '../../utils/desktopRemoteLink';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import { findActiveMetaScalpPort, getUserMetaScalpSettings, type MetaScalpSettings } from '../../utils/metaScalpService';
import {
  getUserTerminalLinkSettings, LINK_SOURCES,
  normalizeMetaScalpGroup, normalizeTigerGroup, normalizeTerminalLinkSettings, testTigerConnection, sendToSelectedTerminal,
  type TerminalLinkSettings, type TerminalProvider, type TerminalLinkSource,
} from '../../utils/terminalLinkService';

const inputClass = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none';
const GROUP_SOURCES: TerminalLinkSource[] = LINK_SOURCES.map(source => source.id);
const REMOTE_TEST_LABELS = {
  uk: {
    ready: 'h00k Desktop підключено до вашого акаунта. Для перевірки MetaScalp натисніть «Тест BTCUSDT».',
    offline: 'h00k Desktop не підключено. Запустіть програму, увійдіть у той самий акаунт і ввімкніть приймання команд.',
    error: 'Не вдалося перевірити з’єднання з h00k Desktop.',
  },
  en: {
    ready: 'h00k Desktop is connected to your account. Use “Test BTCUSDT” to verify MetaScalp.',
    offline: 'h00k Desktop is offline. Start it, sign into the same account and enable incoming ticker commands.',
    error: 'Could not check the connection to h00k Desktop.',
  },
  pl: {
    ready: 'h00k Desktop jest połączony z Twoim kontem. Użyj „Test BTCUSDT”, aby sprawdzić MetaScalp.',
    offline: 'h00k Desktop jest odłączony. Uruchom go, zaloguj się na to samo konto i włącz odbiór poleceń.',
    error: 'Nie udało się sprawdzić połączenia z h00k Desktop.',
  },
  ru: {
    ready: 'h00k Desktop подключён к аккаунту. Нажмите «Тест BTCUSDT», чтобы проверить MetaScalp.',
    offline: 'h00k Desktop отключён. Запустите его, войдите в тот же аккаунт и включите приём команд.',
    error: 'Не удалось проверить соединение с h00k Desktop.',
  },
} as const;


export const ProfileTerminalLinkingSettings: React.FC = () => {
  const { user, profile, updateProfileData } = useAuth();
  const { language } = useLanguage();
  const [draft, setDraft] = useState<TerminalLinkSettings>(() => getUserTerminalLinkSettings(user?.uid, profile));
  const [meta, setMeta] = useState<MetaScalpSettings>(() => getUserMetaScalpSettings(user?.uid, profile));
  // Keep source templates in state so visible statuses follow subsequent language switches.
  const [message, setMessage] = useState<{ ok: boolean; text: string; port?: number; sourceLabel?: string; copied?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  useEffect(() => {
    setGuideOpen(true);
  }, [draft.provider]);

  useEffect(() => {
    setDraft(getUserTerminalLinkSettings(user?.uid, profile));
    setMeta(getUserMetaScalpSettings(user?.uid, profile));
    setMessage(null);
  }, [user?.uid, profile?.uid]);

  const change = (patch: Partial<TerminalLinkSettings>) => {
    setDraft(previous => ({ ...previous, ...patch }));
    setMessage(null);
  };
  const setSource = (id: TerminalLinkSource, checked: boolean) =>
    change({ sources: { ...draft.sources, [id]: checked } });
  const setGroup = (id: TerminalLinkSource, value: string) => {
    if (draft.provider === 'metascalp') change({ metaScalpGroups: { ...draft.metaScalpGroups, [id]: value } });
    if (draft.provider === 'tiger') change({ tigerGroups: { ...draft.tigerGroups, [id]: value } });
  };
  const chooseProvider = (provider: TerminalProvider) => change({ provider, enabled: provider !== 'none' });

  const save = async () => {
    if (!user || busy) return;
    const next = normalizeTerminalLinkSettings(draft);
    if (draft.provider === 'metascalp' && !normalizeMetaScalpGroup(meta.binding)) {
      setMessage({ ok: false, text: 'Група MetaScalp має містити число від 001 до 500.' });
      return;
    }
    if (draft.provider === 'metascalp' && (!Number.isInteger(meta.port) || meta.port < 1 || meta.port > 65535)) {
      setMessage({ ok: false, text: 'Порт MetaScalp має бути цілим числом від 1 до 65535.' });
      return;
    }
    if (draft.provider === 'tiger' && !normalizeTigerGroup(draft.tigerGroup)) {
      setMessage({ ok: false, text: 'Група Tiger: вкажіть A–Z або 0–18.' });
      return;
    }
    if (draft.provider === 'tiger' && (!Number.isInteger(draft.tigerPort) || draft.tigerPort < 1 || draft.tigerPort > 65535)) {
      setMessage({ ok: false, text: 'Порт Tiger має бути цілим числом від 1 до 65535.' });
      return;
    }
    for (const id of GROUP_SOURCES) {
      const entry = draft.provider === 'tiger' ? draft.tigerGroups[id] : draft.metaScalpGroups[id];
      if (!entry) continue;
      if (draft.provider === 'tiger' && !normalizeTigerGroup(entry) || draft.provider === 'metascalp' && !normalizeMetaScalpGroup(entry)) {
        setMessage({ ok: false, text: 'Неправильний формат групи для:', sourceLabel: LINK_SOURCES.find(x => x.id === id)?.label || id });
        return;
      }
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateProfileData({
        terminalLinkSettings: next,
        metaScalpSettings: { ...meta,
          enabled: next.provider === 'metascalp' ? next.enabled : meta.enabled,
          autoSwitchOnClick: next.switchOnChartOpen,
          binding: normalizeMetaScalpGroup(meta.binding) || '001',
        },
      });
      setDraft(next);
      setMessage({ ok: true, text: 'Налаштування лінковки збережено в профілі.' });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Не вдалося зберегти налаштування.' });
    } finally { setBusy(false); }
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    setMessage(null);
    try {
      if (draft.provider === 'metascalp' && desktopRemoteLinkEnabled(user?.uid)) {
        const labels = REMOTE_TEST_LABELS[language as keyof typeof REMOTE_TEST_LABELS] ?? REMOTE_TEST_LABELS.uk;
        const online = await desktopRemoteLinkStatus();
        setMessage({ ok: online, text: online ? labels.ready : labels.offline });
      } else if (draft.provider === 'metascalp') {
        const port = await findActiveMetaScalpPort(meta.port);
        setMessage(port !== null
          ? { ok: true, text: 'MetaScalp знайдено на локальному порту {port}. Це перевірка з’єднання без перемикання монети.', port }
          : { ok: false, text: 'MetaScalp не знайдено. Запустіть програму й дозвольте локальний доступ.' });
      } else if (draft.provider === 'tiger') {
        const result = await testTigerConnection(draft.tigerPort);
        setMessage({ ok: result.ok, text: result.message });
      } else {
        setMessage({ ok: false, text: 'Для Vataga перевірка API поки недоступна. Потрібна офіційна специфікація локального протоколу.' });
      }
    } catch {
      const labels = REMOTE_TEST_LABELS[language as keyof typeof REMOTE_TEST_LABELS] ?? REMOTE_TEST_LABELS.uk;
      setMessage({ ok: false, text: labels.error });
    } finally { setTesting(false); }
  };

  const testTicker = async () => {
    if (testing) return;
    setTesting(true);
    setMessage(null);
    try {
      const result = await sendToSelectedTerminal(
        'BTCUSDT', 'binance', 'futures', 'screener',
        // A deliberate connection test is not a trading signal: no quality score is invented.
        normalizeTerminalLinkSettings({ ...draft, minQuality: 0 }),
        { ...meta, enabled: draft.provider === 'metascalp' ? draft.enabled : meta.enabled }
      );
      setMessage({ ok: result.success, text: result.message, copied: result.copiedToClipboard });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Помилка тестової передачі монети.' });
    } finally { setTesting(false); }
  };

  const selected = draft.provider;
  const ready = selected === 'metascalp' || selected === 'tiger';
  return (
    <div className="space-y-5 pb-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-white"><PlugZap size={19} className="text-cyan-400" /> Лінковка з торговими терміналами</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Вкажіть один термінал для відкриття монет з h00k. Дані надсилаються в локальну програму або через h00k Desktop, залежно від вибраного режиму.
          Торгові заявки, паролі, API-ключі й рівні Entry/SL/TP не передаються.
        </p>
      </div>
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <h4 className="text-sm font-semibold text-slate-100">1. Вибір термінала</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {([
            ['metascalp', 'MetaScalp'], ['tiger', 'Tiger'], ['none', 'Без лінковки'],
          ] as Array<[TerminalProvider, string]>).map(([id, label]) => (
            <button key={id} type="button" onClick={() => chooseProvider(id)}
              aria-pressed={selected === id}
              className={`min-h-12 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${selected === id
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}>
              {translatePhrase(language, label)}
            </button>
          ))}
        </div>
        {selected !== 'none' && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
            <input type="checkbox" className="accent-cyan-500" checked={draft.enabled} onChange={e => change({ enabled: e.target.checked })}/>
            {translatePhrase(language, 'Увімкнути лінковку')}
          </label>
        )}
      </section>

      {selected === 'metascalp' && <DesktopRemoteLinkSettings uid={user?.uid} language={language} />}

      {selected !== 'none' && (
        <>
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-slate-100">{translatePhrase(language, '2. Параметри')} {selected === 'metascalp' ? 'MetaScalp' : selected === 'tiger' ? 'Tiger' : 'Vataga'}</h4>
            {selected === 'metascalp' ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-slate-300">Локальний HTTP-порт
                    <input type="number" min="1" max="65535" className={inputClass + ' w-full'} value={meta.port}
                      onChange={e => setMeta(old => ({ ...old, port: Number(e.target.value) }))} />
                  </label>
                  <label className="space-y-1 text-xs text-slate-300">Група лінковки (001–500)
                    <input type="text" maxLength={3} inputMode="numeric" className={inputClass + ' w-full'} value={meta.binding}
                      onChange={e => setMeta(old => ({ ...old, binding: e.target.value }))} />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">Пошук працює на вибраному порту та портах 17845–17855. Наявна лінковка MetaScalp збережеться.</p>
              </>
            ) : selected === 'tiger' ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-slate-300">Локальний WebSocket-порт
                    <input type="number" min="1" max="65535" className={inputClass + ' w-full'} value={draft.tigerPort}
                      onChange={e => change({ tigerPort: Number(e.target.value) })} />
                  </label>
                  <label className="space-y-1 text-xs text-slate-300">Група за замовчуванням (A–Z, 0–18)
                    <input type="text" maxLength={2} className={inputClass + ' w-full'} value={draft.tigerGroup}
                      onChange={e => change({ tigerGroup: e.target.value.toUpperCase() })} />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">У Tiger потрібно увімкнути локальний сервер сигналів. Покрокова інструкція нижче.</p>
              </>
            ) : (
              <div className="flex gap-2 rounded-lg border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-200">
                <Info size={16} className="shrink-0" />
                <p>Vataga підтримує інтеграцію зі скрінерами, але формат локальних команд не оприлюднений. Поки що можливе тільки копіювання тикера. У Vataga увімкніть Налаштування → Загальні → Інше → Інтеграція застосунків і прив’яжіть стакан до скрінера.</p>
              </div>
            )}
            {ready && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={testing} onClick={test}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
                  <RefreshCw size={14} className={testing ? 'animate-spin' : ''}/>
                  {translatePhrase(language, testing ? 'Перевіряємо...' : 'Перевірити з’єднання')}
                </button>
                <button type="button" disabled={testing || !draft.enabled || !draft.sources.screener} onClick={testTicker}
                  title={translatePhrase(language, !draft.sources.screener ? 'Увімкніть джерело Скрінер для тестової передачі' : 'Надіслати BTCUSDT Binance Futures у вибраний термінал')}
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-600/50 bg-cyan-950/50 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/60 disabled:opacity-40">
                  <PlugZap size={14}/> Тест BTCUSDT
                </button>
              </div>
            )}
          </section>

          {ready && (
            <details key={selected} open={guideOpen} onToggle={event => setGuideOpen(event.currentTarget.open)}
              className="group rounded-xl border border-cyan-800/40 bg-slate-950/60 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-cyan-200 [&::-webkit-details-marker]:hidden">
                <BookOpen size={17} className="shrink-0" />
                <span className="flex-1">{translatePhrase(language, 'Як підключити')} {selected === 'tiger' ? 'Tiger' : 'MetaScalp'} {translatePhrase(language, 'до h00k.top')}</span>
                <span className="text-[11px] font-normal text-slate-400 group-open:hidden">Показати кроки</span>
                <span className="hidden text-[11px] font-normal text-slate-400 group-open:inline">Згорнути</span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                {selected === 'metascalp' ? (
                  <>
                    <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-300 marker:font-semibold marker:text-cyan-400">
                      <li>Запустіть MetaScalp на тому самому комп'ютері, де відкрито h00k.top, та підключіть потрібну біржу (Binance або Bybit).</li>
                      <li>У MetaScalp призначте стакану або графіку групу лінковки, наприклад 001 (доступні групи 001–500).</li>
                      <li>У h00k.top виберіть MetaScalp, введіть ту саму групу та залиште порт 17845, якщо його не змінювали. API запускається разом із MetaScalp; h00k шукає активний порт у діапазоні 17845–17855.</li>
                      <li>Увімкніть лінковку та натисніть «Перевірити з'єднання», потім «Тест BTCUSDT». Переконайтеся, що інструмент змінився у вікнах потрібної групи.</li>
                    </ol>
                    <a href="https://download.metascalp.io/MetaScalp-Api.html" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 underline underline-offset-2 hover:text-cyan-100">
                      Офіційна документація MetaScalp API <ExternalLink size={12}/>
                    </a>
                  </>
                ) : (
                  <>
                    <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-300 marker:font-semibold marker:text-cyan-400">
                      <li>Запустіть Tiger.com Windows на тому самому комп'ютері, де відкрито h00k.top, та переконайтеся, що потрібні ринки доступні в терміналі.</li>
                      <li>У Tiger відкрийте «Настройки» → «Локальный сервер сигналов» → увімкніть «Включить сервер сигналов» → натисніть «Сохранить».</li>
                      <li>Залиште стандартний порт 7819 або вкажіть однаковий власний порт у Tiger та h00k.top. Опцію «Разрешить торговлю» для лінковки вмикати не потрібно.</li>
                      <li>У стакані та/або графіку Tiger виберіть групу лінковки (кольорову літеру A–Z або число 0–18), наприклад A. У h00k.top виберіть ту саму групу.</li>
                      <li>Увімкніть лінковку, натисніть «Перевірити з'єднання», потім «Тест BTCUSDT» і перевірте зміну інструмента в прив'язаних вікнах Tiger.</li>
                    </ol>
                    <a href="https://support.tiger.com/razrabotka-dlya-tiger.trade-windows/tiger-api" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 underline underline-offset-2 hover:text-cyan-100">
                      Офіційна документація Tiger API <ExternalLink size={12}/>
                    </a>
                  </>
                )}
                <p className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
                  Якщо з'єднання не знайдено, перевірте, чи запущений термінал, чи збігаються порт і група та чи браузер дозволив локальне підключення. Для прямої лінковки браузер і термінал мають працювати на одному комп'ютері.
                </p>
              </div>
            </details>
          )}

          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-slate-100">3. Що дозволено передавати</h4>
            <p className="text-[11px] text-slate-400">Натискання кнопок у вибраних розділах надсилатиме тільки монету, біржу й тип ринку (якщо підтримує термінал). Вимкнені джерела блокуються.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LINK_SOURCES.map(({ id, label, description }) => {
                return (
                  <label key={id} className="flex cursor-pointer gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                    <input type="checkbox" className="mt-0.5 accent-cyan-500" checked={draft.sources[id]}
                      onChange={e => setSource(id, e.target.checked)}/>
                    <span className="min-w-0"><span className="block text-xs font-medium text-slate-100">{translatePhrase(language, label)}</span>
                      <span className="block text-[11px] text-slate-400">{translatePhrase(language, description)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {ready && (
            <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h4 className="text-sm font-semibold text-slate-100">4. Групи для різних розділів</h4>
              <p className="text-[11px] text-slate-400">Необов’язково. Порожнє поле означає основну групу термінала.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {GROUP_SOURCES.map(id => (
                  <label key={id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span>{translatePhrase(language, LINK_SOURCES.find(x => x.id === id)?.label || id)}</span>
                    <input type="text" maxLength={selected === 'tiger' ? 2 : 3}
                      placeholder={selected === 'tiger' ? draft.tigerGroup : meta.binding}
                      value={selected === 'tiger' ? draft.tigerGroups[id] || '' : draft.metaScalpGroups[id] || ''}
                      onChange={e => setGroup(id, e.target.value)}
                      className={inputClass + ' w-20 text-center font-mono'} />
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-slate-100">5. Автоматизація та захист від випадкових перемикань</h4>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-200">
              <input type="checkbox" className="mt-0.5 accent-cyan-500" checked={draft.switchOnChartOpen}
                onChange={e => change({ switchOnChartOpen: e.target.checked })}/>
              <span>Перемикати інструмент під час відкриття графіка з h00k
                <span className="mt-0.5 block text-[11px] text-slate-400">Якщо вимкнути, працюватимуть тільки кнопки ручної лінковки.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-200">
              <input type="checkbox" checked={draft.autoSignals && selected !== 'vataga'}
                disabled={selected === 'vataga'} className="mt-0.5 accent-cyan-500"
                onChange={e => change({ autoSignals: e.target.checked })}/>
              <span>Автоматично перемикати за новими сповіщеннями
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  Вимкнено за замовчуванням. Лише нові події з увімкненого Центру сповіщень, які мають тикер, біржу та ринок.
                  Може перемкнути стакан під час вашої роботи — використовуйте обережно.
                  {selected === 'vataga' && ' ' + translatePhrase(language, 'Автоматизація Vataga недоступна до реалізації прямого API.')}
                </span>
              </span>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-300">Захисний інтервал між командами
                <select className={inputClass + ' w-full'} value={draft.cooldownMs} onChange={e => change({ cooldownMs: Number(e.target.value) })}>
                  <option value={0}>Без затримки</option><option value={500}>0,5 секунди</option>
                  <option value={1200}>1,2 секунди</option><option value={3000}>3 секунди</option><option value={5000}>5 секунд</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-300">Мінімальна якість сигналу (0 = вимкнено)
                <input type="number" min="0" max="100" step="5" className={inputClass + ' w-full'}
                  value={draft.minQuality} onChange={e => change({ minQuality: Number(e.target.value) })} />
              </label>
            </div>
            <p className="text-[11px] text-slate-400">Якщо поріг якості вищий за 0, сигнали без достовірного бала блокуються. Жодні ордери не відкриваються.</p>
            {(
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" className="accent-cyan-500" checked={meta.soundFeedback ?? true}
                  onChange={e => setMeta(old => ({ ...old, soundFeedback: e.target.checked }))}/>
                Звук після успішної лінковки в обраному терміналі
              </label>
            )}
          </section>
        </>
      )}

      {message && (
        <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${message.ok
          ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-200'
          : 'border-rose-500/35 bg-rose-950/30 text-rose-200'}`}>
          {message.ok ? <CheckCircle2 size={16} className="shrink-0"/> : <AlertCircle size={16} className="shrink-0"/>}
          <span>
             {translatePhrase(language, message.text).replace('{port}', message.port === undefined ? '{port}' : String(message.port))}
             {message.sourceLabel ? ' ' + translatePhrase(language, message.sourceLabel) : ''}
             {message.copied ? ' · ' + translatePhrase(language, 'Скопійовано до буфера.') : ''}
           </span>
        </div>
      )}
      <button type="button" onClick={save} disabled={busy || !user}
        className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50">
        <Save size={15}/>{translatePhrase(language, busy ? 'Збереження…' : 'Зберегти налаштування')}
      </button>
    </div>
  );
};
