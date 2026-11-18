import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getLegalCopy } from '../legal/content';

/** Shared, automatically localized footer for the screener and public legal pages. */
export const SiteFooter: React.FC = () => {
  const { language } = useLanguage();
  const copy = getLegalCopy(language);
  const guideLabels = {
    uk: 'Можливості h00k',
    en: 'About h00k',
    pl: 'Możliwości h00k',
    ru: 'Возможности h00k',
  } as const;

  return (
    <footer data-no-translate className="mt-auto border-t border-slate-800/80 bg-slate-950/90 px-4 py-5 text-center text-slate-400 sm:py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <a href="/" className="inline-flex items-center" aria-label="h00k.top">
            <img src="/h00k-logo.svg" alt="h00k.top" width={194} height={48} className="block h-10 w-auto sm:h-12" />
          </a>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-base text-slate-600">•</span>
            <div className="flex flex-col items-center justify-center gap-1">
              <a href="mailto:info@h00k.top" className="text-xs font-semibold leading-5 text-cyan-300 transition-colors hover:text-cyan-200">
                info@h00k.top
              </a>
              <span className="font-mono text-sm leading-5 tracking-wide text-slate-400 sm:text-base">Binance &amp; Bybit</span>
            </div>
          </div>
        </div>
        <nav aria-label={copy.termsLink + ' / ' + copy.privacyLink} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400 sm:text-sm">
          <a href={`/${language}/crypto-screener.html`} className="transition-colors hover:text-cyan-300">{guideLabels[language]}</a>
          <span aria-hidden="true" className="text-slate-600">•</span>
          <a href="/terms" className="transition-colors hover:text-cyan-300">{copy.termsLink}</a>
          <span aria-hidden="true" className="text-slate-600">•</span>
          <a href="/privacy" className="transition-colors hover:text-cyan-300">{copy.privacyLink}</a>
        </nav>
        <p className="text-xs leading-relaxed text-slate-400">{copy.copyright}</p>
      </div>
    </footer>
  );
};
