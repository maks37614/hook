import React, { useEffect } from 'react';
import { Activity, Target, X } from 'lucide-react';
import type { TerminalLiveAlert } from '../../utils/useTerminalLiveAlerts';
import { terminalAnalysisText } from '../../utils/terminalAnalysis/presentation';

export function formatTerminalAlertPrice(price: number): string {
  return price.toLocaleString('en-US', { maximumSignificantDigits: 9 });
}

const TerminalLiveAlertCard: React.FC<{
  alert: TerminalLiveAlert; language: string;
  onDismiss: (id: string) => void; onFocus: (alert: TerminalLiveAlert) => void;
}> = ({ alert, language, onDismiss, onFocus }) => {
  const copy = terminalAnalysisText(language);
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(alert.id), 12_000);
    return () => window.clearTimeout(id);
  }, [alert.id, onDismiss]);
  const isTemka = alert.scenario === 'temka1' || alert.scenario === 'temka2';
  const isCancelled = alert.stage === 'cancelled';
  const details = isCancelled ? copy.level : isTemka ? alert.stage === 'confirmed' ? copy.reclaimed : copy.heldLow : copy.level;
  return (
    <div className="pointer-events-auto w-full rounded-xl border border-cyan-500/30 bg-slate-950/95 p-2.5 text-slate-100 shadow-lg shadow-black/30"
      role="status">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true">
          {alert.stage === 'info' ? <Activity className="h-4 w-4" /> : <Target className="h-4 w-4" />}
        </div>
        <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
          onClick={() => onFocus(alert)} title={alert.symbol + ' ' + alert.triggerTf}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-mono text-xs font-semibold text-white" translate="no">{alert.symbol}</span>
            <span className="text-[10px] text-slate-400">
              {alert.exchange} · {copy[alert.marketType]} · {alert.structureTf}
              {alert.triggerTf !== alert.structureTf ? ' → ' + alert.triggerTf : ''}
              {alert.zone ? ' · Z' + alert.zone : ''}
            </span>
          </div>
          <div className="mt-1 break-words text-xs font-medium">{copy.scenarios[alert.scenario]}</div>
          <div className={'mt-0.5 text-[10px] ' + (isCancelled ? 'text-amber-300' : 'text-cyan-300')}>
            {copy[alert.stage]} {alert.side === 'up' ? '↑' : alert.side === 'down' ? '↓' : '↔'}
            {!isCancelled && alert.confirmation === 'close' && ' · ' + copy.closeBreak}
            {!isCancelled && alert.confirmation === 'wick_rebreak' && ' · ' + copy.wickRebreak}
          </div>
          <div className="mt-1 break-words text-[11px] leading-4 text-slate-300">
            {details}: {formatTerminalAlertPrice(alert.level)}
            {alert.returnMinutes !== undefined && <> · {copy.returned} {alert.returnMinutes} {copy.minutes}</>}
            {alert.zone === 5 && <span className="text-amber-300"> {copy.unreliable}</span>}
          </div>
          <div className="mt-0.5 break-words text-[10px] leading-4 text-slate-400">
            {copy.history}: {copy.regimes[alert.context.regime]} · {Math.round(alert.context.coverageMinutes)} {copy.minutes}
            {(alert.context.coverageMinutes < 1380 || alert.context.h4 === 'unavailable') && ' · ' + copy.limited}
            {alert.evidence.length > 0 && ' · ' + [...new Set(alert.evidence)].slice(0, 2).map(tag => copy.evidence[tag]).join(', ')}
          </div>
          {!isCancelled && alert.stage !== 'info' && <div className="mt-0.5 text-[10px] leading-4 text-slate-400">
            {alert.invalidateSide === 'below' ? copy.below : copy.above} {formatTerminalAlertPrice(alert.invalidateLevel)}
          </div>}
        </button>
        <button type="button" onClick={() => onDismiss(alert.id)}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
          aria-label={copy.close}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>
    </div>
  );
};

export const TerminalLiveAlertToast: React.FC<{
  alerts: readonly TerminalLiveAlert[]; language: string;
  onDismiss: (id: string) => void; onFocus: (alert: TerminalLiveAlert) => void;
  status?: string | null; onStatusDismiss?: () => void;
}> = ({ alerts, language, onDismiss, onFocus, status, onStatusDismiss }) => {
  if (!alerts.length && !status) return null;
  const copy = terminalAnalysisText(language);
  return (
    <section className="pointer-events-none absolute right-2 top-14 z-[60] flex w-[min(19rem,calc(100vw-1rem))] max-h-[calc(100dvh-5rem)] flex-col gap-2 overflow-y-auto"
      aria-live="polite" aria-label={copy.alerts}>
      {status && <div className="pointer-events-auto flex items-start gap-2 rounded-xl border border-amber-500/30 bg-slate-950 p-2.5 text-xs leading-4 text-amber-200" role="status">
        <span className="min-w-0 flex-1">{status}</span>
        <button type="button" className="rounded p-1 hover:bg-slate-800" onClick={onStatusDismiss} aria-label={copy.close}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>}
      {alerts.map(alert => <TerminalLiveAlertCard key={alert.id}
        alert={alert} language={language} onDismiss={onDismiss} onFocus={onFocus} />)}
    </section>
  );
};
