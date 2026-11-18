import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import { useLanguage } from '../context/LanguageContext';

/** Small copy action for the Screener's clickable table rows and cards. */
export function ScreenerCopySymbolButton({ symbol }: { symbol: string }) {
  const { t } = useLanguage();
  const formattedSymbol = symbol.toUpperCase();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStatus('idle');
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, [symbol]);

  const copySymbol = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Never let the parent Screener card/row navigate to a chart on copy.
    event.stopPropagation();
    const copied = await copyTextToClipboard(symbol.toUpperCase());
    if (resetRef.current) clearTimeout(resetRef.current);
    setStatus(copied ? 'copied' : 'failed');
    resetRef.current = setTimeout(() => setStatus('idle'), 1800);
  };

  return (
    <button
      type="button"
      onClick={(event) => void copySymbol(event)}
      aria-label={t('ui.copy.symbol', { symbol: formattedSymbol })}
      title={status === 'copied' ? t('ui.copy.copied', { symbol: formattedSymbol })
        : status === 'failed' ? t('ui.copy.failed') : t('ui.copy.symbolTitle', { symbol: formattedSymbol })}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
    >
      {status === 'copied'
        ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />
        : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'copied' ? t('ui.copy.copiedAria', { symbol: formattedSymbol })
          : status === 'failed' ? t('ui.copy.failed') : ''}
      </span>
    </button>
  );
}
