import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Clock3, Globe2, X } from 'lucide-react';
import { TRADING_SESSIONS, formatSessionCountdown, formatTimeZoneOffset, formatZonedTime, getSessionWindow, resolveTimeZone, sessionDateLabel } from '../../utils/tradingSessions';

interface Props {
  timeZone?: string;
  open: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onOpen: () => void;
}

export function TerminalClock({ timeZone: selectedTimeZone, open, buttonRef, onOpenChange, onOpen }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [position, setPosition] = useState<React.CSSProperties>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const timeZone = resolveTimeZone(selectedTimeZone);
  const rows = open ? TRADING_SESSIONS.map(session => ({ session, ...getSessionWindow(session, now) })) : [];

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

  return <div className="terminal-header-clock justify-self-center min-w-0">
    <button ref={buttonRef} type="button" aria-label="Годинник — торгові сесії" aria-expanded={open}
      aria-controls="terminal-trading-sessions" title={`Торгові сесії · ${timeZone}`}
      onClick={() => { if (open) close(); else { onOpen(); onOpenChange(true); } }}
      className={`flex items-center gap-2 rounded-xl border-0 px-3 py-1.5 transition-colors ${open
        ? 'bg-cyan-500/10 text-cyan-300' : 'bg-slate-900 text-slate-200 hover:text-cyan-300'}`}>
      <Clock3 className="h-5 w-5 shrink-0 text-cyan-400" />
      <time dateTime={now.toISOString()} className="font-mono text-xl font-bold leading-6 tabular-nums sm:text-2xl sm:leading-7">{formatZonedTime(now, timeZone, true)}</time>
      <ChevronDown className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div ref={panelRef} id="terminal-trading-sessions" role="region" aria-label="Світові торгові сесії" tabIndex={-1}
      style={position} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
      className="fixed z-50 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs shadow-2xl outline-none animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-white"><Globe2 className="h-4 w-4 text-cyan-400" />Світові торгові сесії</h2>
          <p className="mt-1 truncate text-[11px] text-slate-400" title={timeZone}>{timeZone} · {formatTimeZoneOffset(now, timeZone)}</p>
        </div>
        <button type="button" onClick={close} aria-label="Закрити торгові сесії"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Крипторинок · 24/7</span>
        <span className="text-[10px] text-slate-400">Активних сесій: {rows.filter(row => row.active).length}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ session, startsAt, endsAt, active, nextChangeAt, progress }) => <div key={session.id} data-session={session.id}
          className={`rounded-lg border p-2.5 ${active ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200"><span aria-hidden="true">{session.flag}</span>{session.city}</div>
              <p className="mt-0.5 text-[10px] text-slate-500">{session.country} · {session.region}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-xs text-slate-200 tabular-nums">{formatZonedTime(startsAt, timeZone)} — {formatZonedTime(endsAt, timeZone)}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{sessionDateLabel(startsAt, endsAt, timeZone)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
            <span className={active ? 'text-cyan-300' : 'text-slate-400'}>{active ? 'Активна · до завершення' : 'До початку'} {formatSessionCountdown(nextChangeAt.getTime() - now.getTime())}</span>
            <span className="font-mono text-slate-500">Місцевий час {formatZonedTime(now, session.timeZone)}</span>
          </div>
          {active && <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress * 100}%` }} /></div>}
        </div>)}
      </div>
      <p className="mt-2.5 text-[10px] leading-4 text-slate-500">Типові сесії світових фінансових центрів у будні, без урахування свят. Орієнтир регіональної активності; криптовалюти торгуються цілодобово.</p>
    </div>}
  </div>;
}
