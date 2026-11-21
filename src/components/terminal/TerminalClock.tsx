import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import { ChevronDown, Clock3, Globe2, X } from 'lucide-react';
import { TRADING_SESSIONS, formatSessionCountdown, formatTimeZoneOffset, formatZonedTime, getSessionWindow, getUsEquitiesPremarketWindow, getUsPreopenActivityReference, resolveTimeZone, sessionDateLabel } from '../../utils/tradingSessions';

interface Props {
  timeZone?: string;
  open: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onOpen: () => void;
}

export function TerminalClock({ timeZone: selectedTimeZone, open, buttonRef, onOpenChange, onOpen }: Props) {
  const { language, t } = useLanguage();
  const [now, setNow] = useState(() => new Date());
  const [position, setPosition] = useState<React.CSSProperties>({});
  const [preMarketExpanded, setPreMarketExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const timeZone = resolveTimeZone(selectedTimeZone);
  const rows = open ? TRADING_SESSIONS.map(session => ({ session, ...getSessionWindow(session, now) })) : [];
  // No extra browser/server polling: reuse the existing clock tick and the
  // already selected profile time zone for all displayed pre-market hours.
  const preMarket = open && preMarketExpanded ? getUsEquitiesPremarketWindow(now) : null;
  const preOpenReference = preMarket ? getUsPreopenActivityReference(now) : null;

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const anchor = button.getBoundingClientRect();
      const top = (button.closest('header')?.getBoundingClientRect().bottom ?? anchor.bottom) + 6;
      const width = Math.min(430, Math.max(0, window.innerWidth - 24));
      const left = anchor.left + (anchor.width - width) / 2;
      setPosition({ top, left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), width,
        maxHeight: Math.max(0, window.innerHeight - top - 12) });
    };
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && !panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) onOpenChange(false);
    };
    const onScroll = (event: Event) => {
      if (event.target === window || !panelRef.current?.contains(event.target as Node)) reposition();
    };
    const onBlur = () => onOpenChange(false);
    reposition();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, buttonRef, onOpenChange]);

  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

  const close = () => { onOpenChange(false); buttonRef.current?.focus(); };

  return <div className="justify-self-center">
    <button ref={buttonRef} type="button" aria-label={translatePhrase(language, 'Годинник — торгові сесії')} aria-expanded={open}
      aria-controls="terminal-trading-sessions" title={t("terminal.clock.zone", { zone: timeZone })}
      onClick={() => { if (open) close(); else { onOpen(); onOpenChange(true); } }}
      className={`flex items-center gap-2 rounded-xl border-0 px-3 py-1.5 transition-colors max-[374px]:gap-1 max-[374px]:px-1.5 min-[720px]:gap-1 min-[720px]:px-1.5 min-[720px]:py-1 lg:gap-2 lg:px-3 lg:py-1.5 ${open
        ? 'bg-cyan-500/10 text-cyan-300' : 'bg-slate-900 text-slate-200 hover:text-cyan-300'}`}>
      <Clock3 className="h-5 w-5 shrink-0 text-cyan-400 max-[374px]:h-3.5 max-[374px]:w-3.5 min-[720px]:h-4 min-[720px]:w-4 lg:h-5 lg:w-5" />
      <time dateTime={now.toISOString()} className="font-mono text-lg font-bold leading-6 tabular-nums max-[374px]:text-base sm:text-2xl sm:leading-7 min-[720px]:text-base min-[720px]:leading-6 lg:text-2xl lg:leading-7">{formatZonedTime(now, timeZone, true)}</time>
      <ChevronDown className={`h-3 w-3 shrink-0 text-slate-500 transition-transform max-[374px]:h-2.5 max-[374px]:w-2.5 ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div ref={panelRef} id="terminal-trading-sessions" role="region" aria-label={translatePhrase(language, 'Світові торгові сесії')} tabIndex={-1}
      style={position} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
      className="fixed z-50 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs shadow-2xl outline-none animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-white"><Globe2 className="h-4 w-4 text-cyan-400" />{translatePhrase(language, 'Світові торгові сесії')}</h2>
          <p className="mt-1 truncate text-[11px] text-slate-400" title={timeZone}>{timeZone} · {formatTimeZoneOffset(now, timeZone)}</p>
        </div>
        <button type="button" onClick={close} aria-label={translatePhrase(language, 'Закрити торгові сесії')}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{translatePhrase(language, 'Крипторинок · 24/7')}</span>
        <span className="text-[10px] text-slate-400">{t('terminal.clock.activeCount', { count: rows.filter(row => row.active).length })}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ session, startsAt, endsAt, active, nextChangeAt, progress }) => <div key={session.id} data-session={session.id}
          className={`rounded-lg border p-2.5 ${active ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200"><span aria-hidden="true">{session.flag}</span>{translatePhrase(language, session.city)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                <span className="text-slate-500">{translatePhrase(language, session.country)} · {translatePhrase(language, session.region)}</span>
                {session.id === 'new-york' && <button type="button"
                  aria-expanded={preMarketExpanded}
                  aria-controls="terminal-us-equities-premarket"
                  aria-label={translatePhrase(language, preMarketExpanded ? 'Згорнути премаркет США' : 'Розгорнути премаркет США')}
                  onClick={() => setPreMarketExpanded(current => !current)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-cyan-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                  {translatePhrase(language, 'Премаркет')}
                  <ChevronDown aria-hidden="true" className={`h-3 w-3 transition-transform ${preMarketExpanded ? 'rotate-180' : ''}`} />
                </button>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-xs text-slate-200 tabular-nums">{formatZonedTime(startsAt, timeZone)} — {formatZonedTime(endsAt, timeZone)}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{sessionDateLabel(startsAt, endsAt, timeZone, language)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
            <span className={active ? 'text-cyan-300' : 'text-slate-400'}>{translatePhrase(language, active ? 'Активна · до завершення' : 'До початку')} {formatSessionCountdown(nextChangeAt.getTime() - now.getTime(), language)}</span>
            <span className="font-mono text-slate-500">{t('terminal.clock.localTime', { time: formatZonedTime(now, session.timeZone) })}</span>
          </div>
          {active && <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress * 100}%` }} /></div>}
          {session.id === 'new-york' && preMarketExpanded && preMarket && (
            <div id="terminal-us-equities-premarket" data-us-premarket
              className="mt-2 rounded-md border border-cyan-500/20 bg-slate-950/70 p-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <strong className="text-[11px] font-semibold text-cyan-200">{translatePhrase(language, 'Премаркет акцій США · Nasdaq')}</strong>
                <span className={`text-[10px] ${preMarket.active ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {translatePhrase(language, preMarket.active ? 'Премаркет триває' : 'Наступний премаркет')}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div className="min-w-0">
                  <span className="text-slate-400">{translatePhrase(language, 'Відкриття')}</span>
                  <p className="font-mono font-semibold text-slate-100 tabular-nums">{formatZonedTime(preMarket.startsAt, timeZone)}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-slate-400">{translatePhrase(language, 'Закриття')}</span>
                  <p className="font-mono font-semibold text-slate-100 tabular-nums">{formatZonedTime(preMarket.endsAt, timeZone)}</p>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{sessionDateLabel(preMarket.startsAt, preMarket.endsAt, timeZone, language)} · {timeZone}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{translatePhrase(language, 'Премаркет Nasdaq: 04:00–09:30 за Нью-Йорком у торгові будні; свята не враховано. Це акції США, не криптобіржа.')}</p>
              {preOpenReference && (
                <div data-us-preopen-reference className="mt-2 border-t border-slate-700/80 pt-2">
                  <p className="text-[11px] font-semibold text-cyan-200">
                    {translatePhrase(language, 'Орієнтир активності перед відкриттям США')}
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                    {formatZonedTime(preOpenReference.startsAt, timeZone)} — {formatZonedTime(preOpenReference.endsAt, timeZone)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {sessionDateLabel(preOpenReference.startsAt, preOpenReference.endsAt, timeZone, language)} · {timeZone}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    {translatePhrase(language, '07:30–09:30 за Нью-Йорком: орієнтир для спостереження за ринком, не офіційне відкриття та не гарантія підвищеної активності.')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>)}
      </div>
      <p className="mt-2.5 text-[10px] leading-4 text-slate-500">{translatePhrase(language, 'Типові сесії світових фінансових центрів у будні, без урахування свят. Орієнтир регіональної активності; криптовалюти торгуються цілодобово.')}</p>
    </div>}
  </div>;
}
