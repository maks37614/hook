import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Trash2, X, Settings2, TrendingUp, TrendingDown, ShieldAlert, Target, Activity, Copy, Check, Link2 } from 'lucide-react';
import { useOptionalSiteNotifications } from '../context/SiteNotificationsContext';
import type { SiteNotificationItem } from '../utils/siteNotifications';
import { notificationCoinTitleParts } from '../utils/notificationChartLink';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import { useLanguage } from '../context/LanguageContext';
import { localizeNotificationLabel, localizeNotificationDescription } from '../utils/siteNotificationLocalization';

const iconFor = (item: SiteNotificationItem) => item.kind === 'volatility'
  ? <Activity className="h-4 w-4 text-amber-300" />
  : item.kind === 'impulse'
  ? item.changePct !== undefined && item.changePct < 0 ? <TrendingDown className="h-4 w-4 text-rose-400" /> : <TrendingUp className="h-4 w-4 text-emerald-400" />
  : item.kind === 'price' ? <Target className="h-4 w-4 text-cyan-400" />
  : item.kind === 'surveillance' ? <ShieldAlert className="h-4 w-4 text-violet-400" />
  : <Activity className="h-4 w-4 text-amber-300" />;

export const SiteNotificationBell: React.FC<{
  onOpenSettings?: () => void;
  onOpenChart?: (item: SiteNotificationItem) => void;
  onLinkNotification?: (item: SiteNotificationItem) => void;
  canLinkNotification?: (item: SiteNotificationItem) => boolean;
}> = ({ onOpenSettings, onOpenChart, onLinkNotification, canLinkNotification }) => {
  const { t, language } = useLanguage();
  const context = useOptionalSiteNotifications();
  const items = context?.items ?? [];
  const unreadCount = context?.unreadCount ?? 0;
  const settings = context?.settings ?? { enabled: true };
  const markAllRead = () => context?.markAllRead();
  const clear = () => context?.clear();
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{ id: string; success: boolean } | null>(null);
  const copyReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyReset.current) clearTimeout(copyReset.current); }, []);
  const copySymbol = async (item: SiteNotificationItem, symbol: string) => {
    const success = await copyTextToClipboard(symbol);
    if (copyReset.current) clearTimeout(copyReset.current);
    setCopyStatus({ id: item.id, success });
    copyReset.current = setTimeout(() => setCopyStatus(null), 1800);
  };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" id="open-site-notifications-btn"
        onClick={() => setOpen(true)}
        aria-label={t('ui.notifications.unread', { count: unreadCount })}
        title={t("i18n.siteCenter.title")}
        className="relative inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-cyan-400 transition-colors hover:bg-slate-800 sm:p-2">
        <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[110] flex items-start justify-center bg-slate-950/75 p-3 pt-[max(5vh,20px)] backdrop-blur-sm sm:justify-end sm:p-6"
          role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label={t("i18n.siteCenter.title")}
            className="flex max-h-[85dvh] w-full max-w-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0e1728] text-slate-100 shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-700/80 p-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Bell className="h-4 w-4 text-cyan-300" /> {t("i18n.siteCenter.heading")}
                  {unreadCount > 0 && <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-300">{unreadCount}</span>}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {t(settings.enabled ? 'i18n.siteCenter.enabled' : 'i18n.siteCenter.paused')}
                </p>
              </div>
              <button type="button" aria-label={t("i18n.siteCenter.close")} onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex flex-wrap gap-2 border-b border-slate-800 p-3 text-[11px]">
              <button type="button" onClick={markAllRead} disabled={!unreadCount}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-cyan-300 disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" /> {t("i18n.siteCenter.read")}</button>
              <button type="button" onClick={clear} disabled={!items.length}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-rose-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> {t("i18n.siteCenter.clear")}</button>
              {onOpenSettings && <button type="button" onClick={() => { setOpen(false); onOpenSettings(); }}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-cyan-700/60 px-2.5 py-1.5 text-cyan-300"><Settings2 className="h-3.5 w-3.5" /> {t("i18n.siteCenter.settings")}</button>}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {!items.length ? <div className="px-3 py-12 text-center text-sm text-slate-400">
                {t('i18n.siteCenter.empty')}
              </div> : items.map(item => {
                const { label, symbol } = notificationCoinTitleParts(item);
                return (
                <article key={item.id} className={'flex gap-2.5 rounded-xl border p-3 ' +
                  (!item.read ? 'border-cyan-600/30 bg-cyan-950/25' : 'border-transparent bg-slate-900/50')}>
                  <div className="mt-0.5 shrink-0">{iconFor(item)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-1">
                      <h3 className="flex flex-wrap items-center gap-x-1 gap-y-1 break-words text-xs font-semibold text-slate-100">
                        <span>{localizeNotificationLabel(language, label)}</span>
                        {symbol && (
                          <span className="inline-flex max-w-full items-center gap-1">
                            {onOpenChart ? (
                              <button type="button"
                                onClick={() => { setOpen(false); onOpenChart(item); }}
                                aria-label={t('ui.chart.openFull', { symbol })}
                                title={t('ui.chart.open', { symbol })}
                                className="min-h-7 rounded px-1 font-mono text-sm font-extrabold tracking-wide text-cyan-200 underline decoration-cyan-600/50 underline-offset-2 hover:bg-cyan-950/60 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 sm:text-base">
                                <span data-no-translate>{symbol}</span>
                              </button>
                            ) : (
                              <span data-no-translate className="font-mono text-sm font-extrabold tracking-wide text-cyan-200 sm:text-base">{symbol}</span>
                            )}
                            <button type="button"
                              onClick={event => { event.stopPropagation(); void copySymbol(item, symbol); }}
                              aria-label={t('ui.copy.symbol', { symbol })}
                              title={t('ui.copy.only', { symbol })}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700/70 text-slate-400 hover:border-cyan-600/70 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                              {copyStatus?.id === item.id && copyStatus.success
                                ? <Check aria-hidden="true" className="h-3 w-3 text-emerald-400" />
                                : <Copy aria-hidden="true" className="h-3 w-3" />}
                            </button>
                            {copyStatus?.id === item.id && (
                              <span role="status" className="sr-only">
                                {copyStatus.success ? t('ui.copy.copiedAria', { symbol }) : t('ui.copy.failedSymbol', { symbol })}
                              </span>
                            )}
                          </span>
                        )}
                      </h3>
                      <time className="whitespace-nowrap text-[10px] text-slate-500">
                        {new Date(item.timestamp).toLocaleString({ uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU', pl: 'pl-PL' }[language], { dateStyle: 'short', timeStyle: 'short' })}
                      </time>
                    </div>
                    <p className="mt-1 break-words text-[11px] leading-relaxed text-slate-300">{localizeNotificationDescription(language, item.kind, item.description)}</p>
                    {onLinkNotification && item.symbol && (
                      <button type="button" onClick={() => { onLinkNotification(item); setOpen(false); }}
                        disabled={!canLinkNotification?.(item)}
                        title={!canLinkNotification?.(item)
                          ? t('i18n.siteCenter.linkUnavailable')
                          : t('i18n.siteCenter.linkReady')}
                        className="mt-2 inline-flex items-center gap-1 rounded-md border border-cyan-600/40 bg-cyan-950/40 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-40">
                        <Link2 size={12}/> {t("i18n.siteCenter.link")}
                      </button>
                    )}
                    {item.kind === 'impulse' && Number.isFinite(item.changePct) &&
                      <span className={'mt-1 inline-block rounded-md px-2 py-0.5 font-mono text-xs font-bold ' +
                        ((item.changePct || 0) >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>
                        {(item.changePct || 0) > 0 ? '+' : ''}{item.changePct?.toFixed(2)}%
                      </span>}
                    {item.kind === 'volatility' && Number.isFinite(item.rangePct) &&
                      <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-bold text-amber-300">
                        {t('ui.notifications.range', { percent: item.rangePct?.toFixed(2) ?? '' })}
                      </span>}
                  </div>
                </article>
                );
              })}
            </div>
            <footer className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
              {t('i18n.siteCenter.footer')}
            </footer>
          </section>
        </div>, document.body)}
    </>
  );
};
