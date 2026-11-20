import React from 'react';
import { MonitoringMenuIcon } from './MonitoringIcon';
import { ScreenerIcon, FormationsIcon, TerminalIcon } from './PageIcons';
import {
  Bookmark,
  BookOpen,
  Zap,
  Send,
  User,
  UserPlus,
  BarChart2,
  Globe,
  Lock,
  History,
  Maximize2,
  CircleHelp,
} from 'lucide-react';
import { FormationArchiveIcon } from './FormationArchiveIcon';
import { SiteNotificationBell } from './SiteNotificationBell';
import type { SiteNotificationItem } from '../utils/siteNotifications';
import { MetaScalpSettings } from '../utils/metaScalpService';
import type { TerminalLinkSettings } from '../utils/terminalLinkService';
import { useAuth } from '../context/AuthContext';
import { ActivePageType } from '../types';
import { useLanguage, SupportedLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { toggleFullscreenSafe } from '../utils/fullscreenUtils';

// Only load the animated Screener tour when a visitor taps the help icon.
const LazyScreenerGuide = React.lazy(() => import('./ScreenerGuide'));

interface HeaderProps {
  isLoading: boolean;
  totalCoins: number;
  formationsCount: number;
  bullishCount: number;
  bearishCount: number;
  watchlistCount: number;
  archiveCount?: number;
  /** Legacy external callers may still pass these; the bell now opens the notification center. */
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onRefresh: () => void;
  onOpenWatchlist: () => void;
  onOpenArchive?: () => void;
  onOpenGuide: () => void;
  onOpenMetaScalp: () => void;
  metaScalpSettings?: MetaScalpSettings;
  terminalLinkSettings?: TerminalLinkSettings;
  lastUpdated: number | null;
  telegramAlertsCount?: number;
  surveillanceCount?: number;
  onOpenTelegramAlerts: () => void;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
  onOpenNotificationSettings?: () => void;
  onLinkNotification?: (item: SiteNotificationItem) => void;
  canLinkNotification?: (item: SiteNotificationItem) => boolean;
  onOpenNotificationChart?: (item: SiteNotificationItem) => void;
  activePage: ActivePageType;
  onPageChange: (page: ActivePageType) => void;
}

export const Header: React.FC<HeaderProps> = ({
  totalCoins,
  formationsCount,
  watchlistCount,
  archiveCount = 0,
  onOpenWatchlist,
  onOpenArchive,
  onOpenGuide,
  onOpenMetaScalp,
  metaScalpSettings,
  terminalLinkSettings,
  lastUpdated,
  telegramAlertsCount = 0,
  surveillanceCount = 0,
  onOpenTelegramAlerts,
  onOpenAuth,
  onOpenProfile,
  onOpenNotificationSettings,
  onLinkNotification,
  canLinkNotification,
  onOpenNotificationChart,
  activePage,
  onPageChange,
}) => {
  const { user, profile, updateProfileData } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [screenerGuideOpen, setScreenerGuideOpen] = React.useState(false);
  const closeScreenerGuide = React.useCallback(() => setScreenerGuideOpen(false), []);
  React.useEffect(() => { setScreenerGuideOpen(false); }, [activePage]);
  const tr = (source: string) => translatePhrase(language, source);
  const pageGuideCopy = {
    uk: { open: 'Відкрити гайд по сторінках сайту', title: 'Гайд по сторінках сайту' },
    en: { open: 'Open site pages guide', title: 'Site pages guide' },
    pl: { open: 'Otwórz przewodnik po stronach serwisu', title: 'Przewodnik po stronach serwisu' },
    ru: { open: 'Открыть гид по страницам сайта', title: 'Гид по страницам сайта' },
  }[language];

  const changeSiteLanguage = (nextLanguage: SupportedLanguage) => {
    setLanguage(nextLanguage);
    if (user) {
      void updateProfileData({ hookChartPreferences: {
        language: nextLanguage,
        siteLanguageAtSelection: nextLanguage,
      } }).catch((error) => console.error('Could not synchronize chart language', error));
    }
  };

  const toggleFullScreen = () => {
    toggleFullscreenSafe();
  };

  const selectedTerminal = terminalLinkSettings?.provider || 'metascalp';
  const isLinkingEnabled = Boolean(user && (terminalLinkSettings?.enabled ?? true)
    && selectedTerminal !== 'none' && selectedTerminal !== 'vataga'
    && (selectedTerminal !== 'metascalp' || (metaScalpSettings?.enabled ?? true)));
  const terminalName = selectedTerminal === 'tiger' ? 'Tiger' : selectedTerminal === 'vataga' ? 'Vataga'
    : selectedTerminal === 'none' ? t('header.terminalNone') : 'MetaScalp';
  const linkingStatus = isLinkingEnabled ? t('header.linking.enabled') : t('header.linking.disabled');
  return (
    <header className="app-header min-w-0 border-b border-slate-800/80 bg-slate-950 sticky top-0 z-40" data-page={activePage}>
      <div className="max-w-[1720px] mx-auto px-2.5 sm:px-4 lg:px-6 py-1.5 sm:py-2">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:gap-3 xl:relative xl:justify-between xl:gap-2">
          <div className="flex w-full min-w-0 flex-col items-center gap-2 sm:gap-3 xl:w-auto xl:shrink-0 xl:flex-row xl:gap-2">
            {/* Only the logo occupies the center grid track, so language, help
                and fullscreen can never move the h00k mark away from 50%.
                Desktop overlay ignores pointer events except on real controls. */}
            <div data-header-brand-row className="grid min-h-9 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 sm:min-h-10 sm:gap-x-2 xl:pointer-events-none xl:absolute xl:inset-x-0 xl:top-1/2 xl:z-10 xl:-translate-y-1/2">
              <span aria-hidden="true" className="min-w-0" />
              <button
                type="button"
                onClick={() => onPageChange('screener')}
                className="flex shrink-0 justify-self-center items-center justify-center cursor-pointer select-none bg-transparent border-0 p-0 focus:outline-none xl:pointer-events-auto"
                title={tr("Головна сторінка: Скрінер")}
                aria-label={tr("Головна сторінка: Скрінер")}
              >
                <img
                  src="/h00k-robot-logo.svg"
                  alt="h00k"
                  width={100}
                  height={48}
                  className="block h-7 w-auto max-w-none shrink-0 sm:h-8"
                />
              </button>

              {/* All utilities are to the RIGHT of the centered mark. */}
              <div className="flex min-w-0 shrink-0 items-center justify-start gap-0.5 sm:gap-1 xl:w-max xl:justify-self-start xl:pointer-events-auto">
              <button
                  type="button"
                  id="screener-help-btn"
                  onClick={() => setScreenerGuideOpen(true)}
                  aria-label={pageGuideCopy.open}
                  title={pageGuideCopy.title}
                  aria-haspopup="dialog"
                  aria-expanded={screenerGuideOpen}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent p-1 text-cyan-300 shadow-none transition-colors hover:bg-transparent hover:text-white focus-visible:bg-transparent focus-visible:text-white focus-visible:outline-none"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                </button>
                <select
                  value={language}
                  onChange={(e) => changeSiteLanguage(e.target.value as SupportedLanguage)}
                  className="min-w-0 cursor-pointer appearance-none rounded-none border-0 bg-transparent px-0.5 py-1 text-xs font-mono font-bold text-slate-200 shadow-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  style={{ backgroundColor: 'transparent', WebkitAppearance: 'none', appearance: 'none', boxShadow: 'none' }}
                  title={t('language')}
                  aria-label={t('language')}
                >
                  <option value="uk">🇺🇦 UA</option>
                  <option value="en">🇬🇧 EN</option>
                  <option value="ru">🇷🇺 RU</option>
                  <option value="pl">🇵🇱 PL</option>
                </select>
                <button
                  data-screener-guide="fullscreen"
                  type="button"
                  onClick={toggleFullScreen}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border-0 bg-transparent p-1 text-slate-400 transition-colors cursor-pointer hover:text-white"
                  title={tr("На весь екран (Fullscreen)")}
                  aria-label={tr("На весь екран")}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Navigation Category Tabs */}
            <nav aria-label={tr("Основна навігація")} className="grid w-full min-w-0 grid-cols-2 items-center gap-0.5 p-0.5 sm:flex sm:w-auto sm:flex-wrap sm:p-1 xl:shrink-0 xl:flex-nowrap xl:gap-0 xl:p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-xs shadow-inner">
              <button
                id="nav-category-screener-btn"
                aria-current={activePage === 'screener' ? 'page' : undefined}
                onClick={() => onPageChange('screener')}
                className={`flex min-w-0 items-center justify-center order-1 sm:order-none gap-1 sm:gap-1.5 xl:gap-1 px-2 sm:px-3 xl:px-1.5 py-1 sm:py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activePage === 'screener'
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm shadow-indigo-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <ScreenerIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[13px] sm:text-sm">{t('screener')}</span>
              </button>

              <button
                id="nav-category-patterns-btn"
                aria-current={activePage === 'patterns' ? 'page' : undefined}
                onClick={() => onPageChange('patterns')}
                className={`flex min-w-0 items-center justify-center order-3 sm:order-none gap-1 sm:gap-1.5 xl:gap-1 px-2 sm:px-3 xl:px-1.5 py-1 sm:py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activePage === 'patterns'
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-sm shadow-cyan-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
                title={!user ? tr("Формації та патерни (доступно після реєстрації)") : undefined}
              >
                <FormationsIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[13px] sm:text-sm">{t('patterns')}</span>
                {!user ? (
                  <Lock className="w-3 h-3 text-slate-500" />
                ) : formationsCount > 0 ? (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      activePage === 'patterns'
                        ? 'bg-cyan-950/70 text-cyan-200'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {formationsCount}
                  </span>
                ) : null}
              </button>

              <button
                id="nav-category-replay-btn"
                aria-current={activePage === 'replay' ? 'page' : undefined}
                onClick={() => onPageChange('replay')}
                className={`flex min-w-0 items-center justify-center order-4 sm:order-none gap-1 sm:gap-1.5 xl:gap-1 px-2 sm:px-3 xl:px-1.5 py-1 sm:py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activePage === 'replay'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-sm shadow-amber-900/40 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
                title={!user ? tr("Відтворення (доступно після реєстрації)") : tr("Market Replay: симулятор ринку та відтворення історії свічка за свічкою")}
              >
                <History className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="text-[13px] sm:text-sm">{t('replay')}</span>
                {!user && <Lock className="w-3 h-3 text-slate-500" aria-hidden="true" />}
                <span className={`px-1 py-0.2 rounded text-[9px] font-mono font-extrabold ${
                  activePage === 'replay' ? 'bg-amber-950/30 text-amber-950' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  SIM
                </span>
              </button>

              <div className="relative order-2 sm:order-none flex w-max max-w-full shrink-0 items-center justify-center justify-self-center pt-1.5">
                <button
                  id="nav-category-pc-btn"
                  type="button"
                  aria-label="PC"
                  aria-current={activePage === 'pc' ? 'page' : undefined}
                  title="PC"
                  onClick={() => onPageChange('pc')}
                  className={`absolute -top-1.5 z-10 rounded-md border border-emerald-400/70 bg-emerald-950/95 px-1 py-0.5 text-[8px] font-extrabold leading-none tracking-wide text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.55)] transition-all hover:border-emerald-300 hover:bg-emerald-800/80 hover:text-white hover:shadow-[0_0_16px_rgba(52,211,153,0.85)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${user ? 'right-0 sm:right-1' : 'right-4 sm:right-5'} xl:right-auto xl:left-1 ${activePage === 'pc' ? 'border-emerald-300 bg-emerald-600/70 text-white shadow-[0_0_18px_rgba(52,211,153,0.9)]' : ''}`}
                >
                  PC
                </button>
              <button
                id="nav-category-terminal-btn"
                aria-current={activePage === 'terminal' ? 'page' : undefined}
                onClick={() => onPageChange('terminal')}
                className={`flex min-w-0 items-center justify-center gap-1 sm:gap-1.5 xl:gap-1 px-2 sm:px-3 xl:px-1.5 py-1 sm:py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activePage === 'terminal'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm shadow-emerald-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
                title={!user ? tr("Торговий термінал (доступно після реєстрації)") : tr("Термінал")}
              >
                <TerminalIcon className="w-4 h-4 shrink-0" />
                <span className="text-[13px] sm:text-sm">{t('terminal')}</span>
                {!user && <Lock className="w-3 h-3 text-slate-500" />}
              </button>
              </div>
            </nav>
          </div>



          <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2 xl:relative xl:z-20 xl:w-auto xl:flex-nowrap xl:gap-1.5 [&>button]:shrink-0">
            <SiteNotificationBell onOpenSettings={onOpenNotificationSettings} onOpenChart={onOpenNotificationChart} onLinkNotification={onLinkNotification} canLinkNotification={canLinkNotification} />

            <button
              id="open-metascalp-btn"
              onClick={onOpenMetaScalp}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs border transition-all relative ${
                isLinkingEnabled
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-800 border-slate-800 text-slate-400'
              }`}
              title={!user ? t('header.linking.guest') : t('header.linking.title', { terminal: terminalName, status: linkingStatus })}
              aria-label={!user ? t('header.linking.guest') : t('header.linking.aria', { terminal: terminalName, status: linkingStatus })}
            >
              <Zap className={`w-3.5 h-3.5 ${isLinkingEnabled ? 'text-amber-400 fill-amber-400/20' : 'text-slate-500'}`} />
              {!user ? (
                <Lock className="w-2.5 h-2.5 text-amber-400/80" />
              ) : (
                <span
                  aria-hidden="true"
                  data-link-status={isLinkingEnabled ? 'on' : 'off'}
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${isLinkingEnabled ? 'bg-emerald-400/70' : 'bg-slate-600/70'}`}
                />
              )}
            </button>

            <button
              id="open-watchlist-btn"
              onClick={onOpenWatchlist}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors relative"
              title={!user ? tr("Список обраних монет (тільки для зареєстрованих)") : tr("Список обраних монет")}
               aria-label={!user ? tr("Список обраних монет (тільки для зареєстрованих)") : tr("Список обраних монет")}
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              {!user ? (
                <Lock className="w-2.5 h-2.5 text-amber-400/80" />
              ) : watchlistCount > 0 ? (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {watchlistCount}
                </span>
              ) : null}
            </button>

            <button
              id="open-telegram-btn"
              onClick={onOpenTelegramAlerts}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 transition-all shadow-sm cursor-pointer relative"
              title={!user ? tr("Сповіщення ціни в Telegram (тільки для зареєстрованих)") : tr("Сповіщення ціни в Telegram")}
               aria-label={!user ? tr("Сповіщення ціни в Telegram (тільки для зареєстрованих)") : tr("Сповіщення ціни в Telegram")}
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              {!user ? (
                <Lock className="w-2.5 h-2.5 text-sky-400/80" />
              ) : telegramAlertsCount > 0 ? (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-sky-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {telegramAlertsCount}
                </span>
              ) : null}
            </button>

            <button
              id="open-surveillance-btn"
              onClick={() => onPageChange('surveillance')}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs border transition-all shadow-sm cursor-pointer relative ${
                activePage === 'surveillance'
                  ? 'bg-gradient-to-r from-sky-600 to-teal-600 border-cyan-400/60 text-white shadow-cyan-950/40'
                  : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-400/40 text-sky-200'
              }`}
              title={!user ? tr("Системний нагляд (тільки для зареєстрованих)") : tr("Стеження за Монетою (Системний нагляд SignalHook)")}
               aria-label={!user ? tr("Системний нагляд (тільки для зареєстрованих)") : tr("Стеження за Монетою (Системний нагляд SignalHook)")}
            >
              <MonitoringMenuIcon
                className="w-3.5 h-3.5 scale-[1.5] origin-center text-sky-300"
                active={activePage === 'surveillance'}
              />
              {!user ? (
                <Lock className="w-2.5 h-2.5 text-cyan-400/80" />
              ) : surveillanceCount > 0 ? (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {surveillanceCount}
                </span>
              ) : null}
            </button>

            <button
              id="open-archive-btn"
              onClick={onOpenArchive}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 transition-all shadow-sm cursor-pointer relative"
              title={!user ? tr("Архів збережених формацій (тільки для зареєстрованих)") : tr("Архів збережених формацій та графіків")}
               aria-label={!user ? tr("Архів збережених формацій (тільки для зареєстрованих)") : tr("Архів збережених формацій та графіків")}
            >
              <FormationArchiveIcon className="w-3.5 h-3.5 text-purple-400" />
              {!user ? (
                <Lock className="w-2.5 h-2.5 text-purple-400/80" />
              ) : archiveCount > 0 ? (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-purple-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {archiveCount}
                </span>
              ) : null}
            </button>

            <button
              id="open-guide-btn"
              onClick={onOpenGuide}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              title={tr("Довідник формацій")}
              aria-label={tr("Довідник формацій")}
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            </button>

            {/* Profile / Auth Button */}
            {user ? (
              <button
                id="user-profile-btn"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-200 transition-colors cursor-pointer"
                title={tr("Особистий профіль та налаштування")}
              >
                <div className="w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-300 font-bold text-[9px] flex items-center justify-center border border-cyan-400/40">
                  {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
                <span className="hidden sm:inline font-medium max-w-[90px] truncate">
                  {profile?.displayName || user.email?.split('@')[0]}
                </span>
              </button>
            ) : (
              <button
                id="auth-login-btn"
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 transition-colors cursor-pointer font-medium"
                title={tr("Увійти або створити профіль")}
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">{tr("Увійти")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {screenerGuideOpen && (
        <React.Suspense fallback={null}>
          <LazyScreenerGuide language={language} navigationOnly={activePage !== 'screener'} onClose={closeScreenerGuide} />
        </React.Suspense>
      )}
    </header>
  );
};
