import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import {
  X,
  User,
  Send,
  Sliders,
  Bell,
  Clock3,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  Shield,
  MonitorSmartphone,
  Target,
  ChartCandlestick,
  Search,
  PlugZap,
  Palette,
} from 'lucide-react';
import { FormationArchiveIcon } from './FormationArchiveIcon';
import { useTelegram } from '../context/TelegramContext';
import { InstallAppButton } from './InstallAppButton';
import { TelegramConnectionCard } from './TelegramConnectionCard';
import { ProfileNotificationSettings } from './profile/ProfileNotificationSettings';
import { ProfileNotificationsErrorBoundary } from './profile/ProfileNotificationsErrorBoundary';
import { ProfileTerminalLinkingSettings } from './profile/ProfileTerminalLinkingSettings';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { useArchive } from '../context/ArchiveContext';
import { ExchangeId, MarketType, Timeframe } from '../types';
import { DEFAULT_APP_PREFERENCES } from '../utils/userPreferences';
import { buildProfileAccountPatch, emptyProfileAccountDirtyFields } from '../utils/profileAccountPatch';
import { getTimeZoneChoices } from '../utils/tradingSessions';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
const TpSlConstructorModal = React.lazy(() => import('./TpSlConstructorModal'));
const ProfileHookChartSettings = React.lazy(() => import('./profile/ProfileHookChartSettings').then(module => ({ default: module.ProfileHookChartSettings })));
const ProfileScreenerSearchSettings = React.lazy(() => import('./profile/ProfileScreenerSearchSettings').then(module => ({ default: module.ProfileScreenerSearchSettings })));
const ProfileInterfaceSettings = React.lazy(() => import('./profile/ProfileInterfaceSettings').then(module => ({ default: module.ProfileInterfaceSettings })));

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAlerts?: () => void;
  onOpenArchive?: () => void;
  initialSection?: 'account' | 'interface' | 'chart' | 'search' | 'notifications' | 'linking';
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onOpenAlerts,
  onOpenArchive,
  initialSection = 'account',
}) => {
  const { user, profile, updateProfileData, logout, logoutAll, listSessions, revokeSession } = useAuth();
  const { status: telegramStatus } = useTelegram();
  const { alerts, activeAlertsCount } = useAlerts();
  const { archiveCount } = useArchive();
  const { language } = useLanguage();
  const dateLocale = { uk: 'uk-UA', en: 'en-US', ru: 'ru-RU', pl: 'pl-PL' }[language];

  const [displayName, setDisplayName] = useState('');
  const [defaultExchange, setDefaultExchange] = useState<'all' | ExchangeId>('all');
  const [defaultMarketType, setDefaultMarketType] = useState<'all' | MarketType>(DEFAULT_APP_PREFERENCES.defaultMarketType);
  const [defaultTimeframe, setDefaultTimeframe] = useState<Timeframe>(DEFAULT_APP_PREFERENCES.defaultTimeframe);
  const [isTpSlOpen, setIsTpSlOpen] = useState(false);
  const [activeProfileSection, setActiveProfileSection] = useState<'account' | 'interface' | 'chart' | 'search' | 'notifications' | 'linking'>(initialSection);

  useEffect(() => {
    if (isOpen) setActiveProfileSection(initialSection);
  }, [isOpen, user?.uid, initialSection]);
  const [timeZone, setTimeZone] = useState('auto');
  const timeZoneChoices = useMemo(() => getTimeZoneChoices(timeZone, language), [timeZone, language]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{id:string;userAgent:string;createdAt:string;expiresAt:string}>>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const initializedAccount = useRef<string | null>(null);
  const newTouchedFields = emptyProfileAccountDirtyFields;
  const touchedFields = useRef(newTouchedFields());
  const markTouched = (field: keyof ReturnType<typeof newTouchedFields>) => {
    touchedFields.current[field] = true;
  };

  useEffect(() => {
    if (!isOpen) {
      initializedAccount.current = null;
      touchedFields.current = newTouchedFields();
      return;
    }
    if (!profile || !user || profile.uid !== user.uid) return;
    const isNewAccount = initializedAccount.current !== user.uid;
    if (isNewAccount) {
      initializedAccount.current = user.uid;
      touchedFields.current = newTouchedFields();
    }
    // Changes saved in another tab/device refresh untouched fields only.
    // Never discard draft edits the user is typing in this open dialog.
    if (isNewAccount || !touchedFields.current.displayName)
      setDisplayName(profile.displayName || user.displayName || '');
    if (isNewAccount || !touchedFields.current.defaultExchange)
      setDefaultExchange(profile.defaultExchange ?? DEFAULT_APP_PREFERENCES.defaultExchange);
    if (isNewAccount || !touchedFields.current.defaultMarketType)
      setDefaultMarketType(profile.defaultMarketType ?? DEFAULT_APP_PREFERENCES.defaultMarketType);
    if (isNewAccount || !touchedFields.current.defaultTimeframe)
      setDefaultTimeframe(profile.defaultTimeframe ?? DEFAULT_APP_PREFERENCES.defaultTimeframe);
    if (isNewAccount || !touchedFields.current.timeZone)
      setTimeZone(profile.timeZone || 'auto');
  }, [profile, user?.uid, isOpen]);

  if (!isOpen || !user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      // Only edited inputs belong in this PATCH. Unchanged fields might already
      // have been updated from another tab/device after this modal was opened.
      const patch = buildProfileAccountPatch({
        displayName, defaultExchange, defaultMarketType, defaultTimeframe, timeZone,
      }, touchedFields.current, user.email?.split('@')[0] || 'Користувач');
      if (Object.keys(patch).length === 0) return;
      await updateProfileData(patch);

      // updateProfileData already publishes the server-confirmed defaults.
      // Do not overwrite them with a potentially stale browser-only copy.
      touchedFields.current = newTouchedFields();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Не вдалося зберегти профіль');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try { await logout(); onClose(); }
    catch (error: any) { setErrorMessage(error?.message || 'Не вдалося завершити сесію.'); }
  };

  const loadSessions = async () => {
    setSessionsBusy(true);
    setSessionsError(null);
    try { setSessions(await listSessions()); }
    catch (error: any) { setSessionsError(error?.message || 'Не вдалося отримати сесії.'); }
    finally { setSessionsBusy(false); }
  };
  const toggleSessions = () => {
    const next = !sessionsOpen;
    setSessionsOpen(next);
    if (next) void loadSessions();
  };
  const revokeAccountSession = async (id: string) => {
    setSessionsBusy(true);
    setSessionsError(null);
    try { await revokeSession(id); await loadSessions(); }
    catch (error: any) { setSessionsError(error?.message || 'Не вдалося завершити сесію.'); }
    finally { setSessionsBusy(false); }
  };
  const logoutEverywhere = async () => {
    setSessionsBusy(true);
    setSessionsError(null);
    try { await logoutAll(); onClose(); }
    catch (error: any) { setSessionsError(error?.message || 'Не вдалося завершити сесії.'); }
    finally { setSessionsBusy(false); }
  };

  const initialLetter = (displayName || user.email || 'U')[0].toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div data-ui-a11y="profile-modal" role="dialog" aria-modal="true" aria-label={translatePhrase(language, "Особистий профіль")} className={`vq-modal-shell relative w-full max-w-[850px] min-h-0 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-cyan-950/20 overflow-hidden flex flex-col ${
        activeProfileSection === 'chart'
          ? 'h-[min(92dvh,1000px)] max-h-[calc(100dvh-32px)]'
          : 'max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="vq-modal-header flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-cyan-950/30">
              {initialLetter}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 data-no-translate className="text-sm font-bold text-white tracking-wide">
                  {displayName || translatePhrase(language, 'Особистий профіль')}
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {translatePhrase(language, 'Профіль')}
                </span>
              </div>
              <p data-no-translate className="text-[11px] text-slate-400">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={translatePhrase(language, 'Закрити профіль')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account and chart share a stable top-level profile navigation. */}
        <div className="vq-modal-controls flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/65 px-4 py-2 sm:px-6" role="tablist" aria-label={translatePhrase(language, 'Розділи профілю')}>
          <button type="button" role="tab" aria-selected={activeProfileSection === 'account'} onClick={() => setActiveProfileSection('account')}
            className={activeProfileSection === 'account' ? 'rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 text-xs font-bold text-cyan-200' : 'rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white'}>
            <User size={15} className="mr-1.5 inline-block" /> {translatePhrase(language, 'Профіль')}
          </button>
          <button type="button" role="tab" aria-selected={activeProfileSection === 'interface'} onClick={() => setActiveProfileSection('interface')}
            className={activeProfileSection === 'interface' ? 'rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 text-xs font-bold text-cyan-200' : 'rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white'}>
            <Palette size={15} className="mr-1.5 inline-block" /> {translatePhrase(language, 'Інтерфейс')}
          </button>
          <button type="button" role="tab" aria-selected={activeProfileSection === 'chart'} onClick={() => setActiveProfileSection('chart')}
            className={activeProfileSection === 'chart' ? 'rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 text-xs font-bold text-cyan-200' : 'rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white'}>
            <ChartCandlestick size={15} className="mr-1.5 inline-block" /> {translatePhrase(language, 'Графік')}
          </button>
          <button type="button" role="tab" aria-selected={activeProfileSection === 'search'} onClick={() => setActiveProfileSection('search')}
            className={activeProfileSection === 'search' ? 'rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 text-xs font-bold text-cyan-200' : 'rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white'}>
            <Search size={15} className="mr-1.5 inline-block" /> {translatePhrase(language, 'Пошук')}
          </button>
          <button type="button" role="tab" aria-selected={activeProfileSection === 'linking'}
            onClick={() => setActiveProfileSection('linking')}
            className={activeProfileSection === 'linking'
              ? 'rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 text-xs font-bold text-cyan-200'
              : 'rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white'}>
            <PlugZap size={15} className="mr-1.5 inline-block" /> {translatePhrase(language, 'Лінковка')}
          </button>
          <button type="button" role="tab" aria-selected={activeProfileSection === 'notifications'}
            onClick={() => setActiveProfileSection('notifications')}
            className={activeProfileSection === 'notifications'
              ? 'rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 text-xs font-bold text-cyan-200'
              : 'rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white'}>
            <Bell size={15} className="mr-1.5 inline-block" /> {translatePhrase(language, 'Сповіщення')}
          </button>
        </div>

        {/* Chart editor mounts only when selected; it does not mount a chart or open market sockets. */}
        <div className={activeProfileSection === 'chart'
          ? 'min-h-0 flex-1 overflow-hidden p-0'
          : 'min-h-0 overflow-y-auto p-3 sm:p-6'}>
          {activeProfileSection === 'chart' ? (
            <Suspense fallback={<div role="status" className="p-5 text-sm text-cyan-300">{translatePhrase(language, 'Завантаження налаштувань графіка…')}</div>}>
              <ProfileHookChartSettings />
            </Suspense>
          ) : activeProfileSection === 'search' ? (
            <Suspense fallback={<div role="status" className="p-5 text-sm text-cyan-300">{translatePhrase(language, 'Завантаження налаштувань пошуку…')}</div>}>
              <ProfileScreenerSearchSettings />
            </Suspense>
          ) : activeProfileSection === 'interface' ? (
            <Suspense fallback={<div role="status" className="p-5 text-sm text-cyan-300">{translatePhrase(language, 'Завантаження налаштувань інтерфейсу…')}</div>}>
              <ProfileInterfaceSettings />
            </Suspense>
          ) : activeProfileSection === 'linking' ? (
            <ProfileTerminalLinkingSettings />
          ) : activeProfileSection === 'notifications' ? (
            <ProfileNotificationsErrorBoundary onClose={onClose}>
              <div className="space-y-4">
                <TelegramConnectionCard />
                <ProfileNotificationSettings />
              </div>
            </ProfileNotificationsErrorBoundary>
          ) : <div data-ui-a11y="profile-account" className="space-y-5">
          {/* Install guide lives in the user's profile, not in the main header. */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-slate-950/70 p-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-cyan-200">Програма h00k</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Встановіть H00K на Windows, Android, iPhone, Mac або Linux прямо із сайту.
              </p>
            </div>
            <InstallAppButton />
          </section>

          {/* The editor is lazy-loaded; closed profiles do not fetch candles or mount charts. */}
          <button type="button" onClick={() => setIsTpSlOpen(true)}
            className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-cyan-500/25 bg-slate-950/80 hover:border-cyan-400/60 p-3">
            <span className="flex items-center gap-3">
              <Target size={19} className="text-cyan-400"/>
              <span>
                <span className="block font-bold text-sm text-slate-100">Конструктор TP/SL</span>
                <span className="text-[11px] text-slate-400">Особисті правила формацій, дотики максимумів/мінімумів свічок, візуальний графік</span>
              </span>
            </span>
            <span className="text-[11px] font-bold text-cyan-300">
              {translatePhrase(language, profile?.tpSlConstructorSettings?.enabled ? 'Увімкнено' : 'Вимкнено').toLocaleUpperCase(dateLocale)} →
            </span>
          </button>
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAlerts?.();
              }}
              className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Мої сповіщення</span>
                <Bell className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-white">
                  {alerts.length}
                </span>
                <span className="text-[11px] text-emerald-400">
                  ({activeAlertsCount} {translatePhrase(language, 'активних')})
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenArchive?.();
              }}
              className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Мій архів формацій</span>
                <FormationArchiveIcon className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-white">
                  {archiveCount}
                </span>
                <span className="text-[11px] text-purple-400">
                  збережено
                </span>
              </div>
            </button>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Статус Telegram</span>
                <Send className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {telegramStatus?.isConfigured ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">
                      Підключено
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">
                      Не налаштовано
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Privacy & Data Isolation Banner */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300 block mb-0.5">
                Індивідуальна ізоляція профілю
              </span>
              <span>
                Ваш архів збережених формацій, індивідуальні Telegram-сповіщення, лінковка торгових терміналів та список обраних монет надійно закріплені виключно за вашим обліковим записом.
              </span>
            </div>
          </div>

          {/* Feedback messages */}
          {saveSuccess && (
            <div role="status" className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Зміни профілю та налаштування збережено успішно!</span>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{translatePhrase(language, errorMessage)}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Section 1: User Identity */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Дані профілю</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-display-name" className="block text-xs font-medium text-slate-300 mb-1">
                    Ім'я або позивний
                  </label>
                  <input
                    id="profile-display-name"
                    type="text"
                    disabled={isSaving}
                    value={displayName}
                    onChange={(e) => { markTouched('displayName'); setDisplayName(e.target.value); }}
                    placeholder="Ваше ім'я"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="profile-email" className="block text-xs font-medium text-slate-300 mb-1">
                    Електронна пошта
                  </label>
                  <input
                    id="profile-email"
                    type="text"
                    disabled
                    value={user.email || ''}
                    className="w-full bg-slate-950/50 border border-slate-800/60 rounded-xl px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: User Default Preferences */}
            <div className="space-y-3">
              <div className="flex flex-col gap-0.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Індивідуальні налаштування інтерфейсу</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Застосовуються на всіх сторінках сайту як значення за замовчуванням та зберігаються у профілі
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="profile-default-exchange" className="block text-xs font-medium text-slate-300 mb-1">
                    Біржа за замовчуванням
                  </label>
                  <select
                    id="profile-default-exchange"
                    value={defaultExchange}
                    disabled={isSaving}
                    onChange={(e) => { markTouched('defaultExchange'); setDefaultExchange(e.target.value as any); }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">Всі біржі</option>
                    <option value="binance">Binance</option>
                    <option value="bybit">Bybit</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="profile-default-market" className="block text-xs font-medium text-slate-300 mb-1">
                    Ринок за замовчуванням
                  </label>
                  <select
                    id="profile-default-market"
                    value={defaultMarketType}
                    disabled={isSaving}
                    onChange={(e) => { markTouched('defaultMarketType'); setDefaultMarketType(e.target.value as any); }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">Всі ринки</option>
                    <option value="futures">Ф'ючерси</option>
                    <option value="spot">Спот</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="profile-default-timeframe" className="block text-xs font-medium text-slate-300 mb-1">
                    Таймфрейм за замовчуванням
                  </label>
                  <select
                    id="profile-default-timeframe"
                    value={defaultTimeframe}
                    disabled={isSaving}
                    onChange={(e) => { markTouched('defaultTimeframe'); setDefaultTimeframe(e.target.value as any); }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="5m">5 хвилин</option>
                    <option value="15m">15 хвилин</option>
                    <option value="1h">1 година</option>
                    <option value="4h">4 години</option>
                    <option value="1d">1 день</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="profile-time-zone" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Clock3 className="h-3.5 w-3.5 text-cyan-400" />Часовий пояс
                </label>
                <select id="profile-time-zone" value={timeZone}
                    disabled={isSaving} onChange={event => { markTouched('timeZone'); setTimeZone(event.target.value); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none">
                  <option value="auto">Часовий пояс пристрою</option>
                  {timeZoneChoices.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Годинник і розклад торгових сесій у Терміналі. Літній час враховується автоматично.</p>
              </div>

            </div>

            {/* Sessions are loaded only when the user opens this section. */}
            <section className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-3 text-xs">
              <button type="button" onClick={toggleSessions} aria-expanded={sessionsOpen}
                className="flex w-full items-center justify-between gap-2 text-left font-semibold text-cyan-200">
                <span className="inline-flex items-center gap-2"><MonitorSmartphone size={16}/> Безпека та активні сеанси</span>
                <span>{translatePhrase(language, sessionsOpen ? 'Згорнути' : 'Переглянути')}</span>
              </button>
              {sessionsOpen && (
                <div className="mt-3 space-y-2">
                  <p className="text-slate-400">Завершуйте невідомі сеанси. Список завантажується тільки під час відкриття.</p>
                  {sessionsError && <p role="alert" className="text-rose-300">{translatePhrase(language, sessionsError)}</p>}
                  {sessionsBusy && <p className="text-cyan-300">Завантаження…</p>}
                  {!sessionsBusy && sessions.map(session => (
                    <div key={session.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 p-2">
                      <div className="min-w-0">
                        <div data-no-translate className="truncate text-slate-200">{session.userAgent || translatePhrase(language, 'Невідомий пристрій')}</div>
                        <div className="mt-1 text-slate-500">
                          {translatePhrase(language, 'Створено:')} {new Date(session.createdAt).toLocaleDateString(dateLocale)} {translatePhrase(language, '· До')} {new Date(session.expiresAt).toLocaleDateString(dateLocale)}
                        </div>
                      </div>
                      <button type="button" disabled={sessionsBusy} onClick={() => void revokeAccountSession(session.id)}
                        aria-label={`${translatePhrase(language, 'Завершити сеанс')}: ${session.userAgent || translatePhrase(language, 'Невідомий пристрій')}`}
                        className="shrink-0 rounded-lg border border-rose-900/60 px-2 py-1.5 text-rose-300 hover:bg-rose-950/50 disabled:opacity-50">
                        Завершити
                      </button>
                    </div>
                  ))}
                  <button type="button" disabled={sessionsBusy} onClick={() => void logoutEverywhere()}
                    className="rounded-lg border border-rose-500/40 px-3 py-2 font-semibold text-rose-300 hover:bg-rose-950/30 disabled:opacity-50">
                    Завершити всі сеанси
                  </button>
                </div>
              )}
            </section>

            {/* Save Buttons */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900 text-slate-400 hover:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Вийти з акаунту</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-semibold transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-950/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{translatePhrase(language, isSaving ? 'Збереження...' : 'Зберегти зміни')}</span>
                </button>
              </div>
            </div>
          </form>
          </div>}
        </div>
      </div>
      {isTpSlOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 text-cyan-300">Завантаження конструктора…</div>}>
          <TpSlConstructorModal onClose={() => setIsTpSlOpen(false)}/>
        </Suspense>
      )}
    </div>
  );
};

