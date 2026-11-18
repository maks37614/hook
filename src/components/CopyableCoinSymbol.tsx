import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import { useLanguage } from '../context/LanguageContext';

/** Chart title stays visually unchanged until tapped. Copies the displayed pair. */
export function CopyableCoinSymbol({ baseAsset, quoteAsset }: {
  baseAsset: string;
  quoteAsset: string;
}) {
  const { t } = useLanguage();
  const pair = `${baseAsset}/${quoteAsset}`;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCopyStatus('idle');
    return () => {
      if (resetTimeout.current) clearTimeout(resetTimeout.current);
    };
  }, [pair]);

  const handleCopy = async () => {
    // Invoked from the actual button click to preserve mobile clipboard permissions.
    const success = await copyTextToClipboard(pair);
    if (resetTimeout.current) clearTimeout(resetTimeout.current);
    setCopyStatus(success ? 'copied' : 'failed');
    resetTimeout.current = setTimeout(() => setCopyStatus('idle'), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={t('ui.copy.symbol', { symbol: pair })}
        title={copyStatus === 'copied' ? t('ui.copy.copied', { symbol: pair }) : copyStatus === 'failed' ? t('ui.copy.failed') : t('ui.copy.symbolTitle', { symbol: pair })}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm cursor-copy transition-colors hover:text-cyan-300 active:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <span data-no-translate>{pair}</span>
        {copyStatus === 'copied' && <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copyStatus === 'copied' ? t('ui.copy.copiedAria', { symbol: pair }) : copyStatus === 'failed' ? t('ui.copy.failed') : ''}
      </span>
    </>
  );
}
