import React, { useEffect } from 'react';
import { ArrowLeft, ShieldCheck, FileText, Maximize2 } from 'lucide-react';
import { toggleFullscreenSafe } from '../utils/fullscreenUtils';
import { useLanguage, type SupportedLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { getLegalCopy, type LegalDocumentType, SITE_URL } from '../legal/content';
import { SiteFooter } from './SiteFooter';

interface LegalPageProps {
  page: LegalDocumentType;
}

/** Direct public routes /terms and /privacy; no account is needed to read them. */
export const LegalPage: React.FC<LegalPageProps> = ({ page }) => {
  const { language, setLanguage } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const copy = getLegalCopy(language);
  const legalDocument = copy[page];

  useEffect(() => {
    window.document.title = legalDocument.title + ' — h00k.top';
    const description = legalDocument.intro;
    const meta = window.document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = description;
    const ogTitle = window.document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = window.document.title;
    const ogDescription = window.document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = description;
    let canonical = window.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = window.document.createElement('link');
      canonical.rel = 'canonical';
      window.document.head.appendChild(canonical);
    }
    canonical.href = SITE_URL + '/' + page;
  }, [page, legalDocument.title, legalDocument.intro]);

  return (
    <div className="flex min-h-screen flex-col bg-[#070a12] text-slate-100">
      <header data-no-translate className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
        <div data-legal-brand-row className="mx-auto grid min-h-9 w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 px-3 py-2 sm:min-h-10 sm:gap-x-2 sm:px-4">
          <a href="/" className="inline-flex min-w-0 items-center justify-start gap-1 text-[11px] font-semibold text-slate-300 transition-colors hover:text-cyan-300 sm:text-xs">
            <ArrowLeft size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{copy.home}</span>
          </a>
          <a href="/" className="flex shrink-0 items-center justify-center" aria-label="h00k">
            <img src="/h00k-robot-logo.svg" alt="h00k" width={100} height={48} className="block h-8 w-auto" />
          </a>
          <div className="flex min-w-0 items-center justify-start gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => { void toggleFullscreenSafe(); }}
              className="shrink-0 rounded border-0 bg-transparent p-1 text-slate-400 transition-colors hover:text-white"
              aria-label={tr("На весь екран")}
              title={tr("На весь екран (Fullscreen)")}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <label className="sr-only" htmlFor="legal-language">{tr("Language / Мова")}</label>
            <select
              id="legal-language"
              value={language}
              onChange={event => setLanguage(event.target.value as SupportedLanguage)}
              aria-label={tr("Language / Мова")}
              className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:px-2"
            >
              <option value="uk">🇺🇦 UA</option>
              <option value="en">🇬🇧 EN</option>
              <option value="ru">🇷🇺 RU</option>
              <option value="pl">🇵🇱 PL</option>
            </select>
          </div>
        </div>
      </header>

      <main data-no-translate className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-700/40 bg-cyan-950/30 px-3 py-1.5 text-xs font-semibold text-cyan-300">
          {page === 'terms' ? <FileText size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
          h00k — {copy.tagline}
        </div>
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-white sm:text-4xl">{legalDocument.title}</h1>
        <p className="mb-8 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">{legalDocument.intro}</p>

        <div className="space-y-7 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:p-8">
          {legalDocument.sections.map((section, index) => (
            <section key={index} className="space-y-3">
              <h2 className="text-base font-bold text-slate-100 sm:text-lg">{section.heading}</h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="text-sm leading-7 text-slate-300">{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="list-disc space-y-1 pl-6 text-sm leading-7 text-slate-300">
                  {section.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
        <nav data-no-translate className="mt-8 flex flex-wrap gap-5 text-sm">
          <a href="/terms" aria-current={page === 'terms' ? 'page' : undefined} className="text-cyan-300 hover:underline">{copy.termsLink}</a>
          <a href="/privacy" aria-current={page === 'privacy' ? 'page' : undefined} className="text-cyan-300 hover:underline">{copy.privacyLink}</a>
          <a href="mailto:info@h00k.top" className="text-cyan-300 hover:underline">info@h00k.top</a>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
};
