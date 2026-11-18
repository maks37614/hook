import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import { useLanguage } from '../context/LanguageContext';

interface FormationCoinCopyButtonProps {
  symbol: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Clicking the visible coin name in regular/early formation cards or the
 * formation table copies its full exchange symbol, without opening the chart.
 */
export function FormationCoinCopyButton({
  symbol, children, className = '',
}: FormationCoinCopyButtonProps) {
  const { t } = useLanguage();
  const fullSymbol = symbol.trim().toUpperCase();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStatus('idle');
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, [fullSymbol]);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Parent formation rows/cards can open a chart. A name tap only copies.
    event.stopPropagation();
    const success = await copyTextToClipboard(fullSymbol);
    if (resetRef.current) clearTimeout(resetRef.current);
    setStatus(success ? 'copied' : 'failed');
    resetRef.current = setTimeout(() => setStatus('idle'), 1800);
  };

  return (
    <button
      type="button"
      onClick={(event) => { void handleCopy(event); }}
      aria-label={t('ui.copy.symbol', { symbol: fullSymbol })}
      title={status === 'copied' ? t('ui.copy.copied', { symbol: fullSymbol })
        : status === 'failed' ? t('ui.copy.failed') : t('ui.copy.symbolTitle', { symbol: fullSymbol })}
      className={`inline-flex min-h-6 min-w-0 max-w-full shrink-0 items-center rounded-md cursor-copy transition-colors hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${className}`}
    >
      <span data-no-translate className="contents">{children}</span>
      {status === 'copied'
        ? <Check aria-hidden="true" className="ml-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        : <Copy aria-hidden="true" className="ml-1 h-3 w-3 shrink-0 text-slate-500" />}
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? t('ui.copy.copiedAria', { symbol: fullSymbol })
          : status === 'failed' ? t('ui.copy.failed') : ''}
      </span>
    </button>
  );
}
