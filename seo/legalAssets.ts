import { getLegalCopy, LEGAL_EMAIL, SITE_URL } from '../src/legal/content.ts';
import { escapeHtml } from './html.ts';

export const legalPages = ['terms', 'privacy'] as const;

export function renderLegalHtml(shell: string, page: typeof legalPages[number]): string {
  const copy = getLegalCopy('uk');
  const legalDocument = copy[page];
  const title = escapeHtml(legalDocument.title + ' — h00k.top');
  const description = escapeHtml(legalDocument.intro);
  const url = SITE_URL + '/' + page;
  const sections = legalDocument.sections.map(section => {
    const paragraphs = section.paragraphs.map(p =>
      `<p class="text-sm leading-7 text-slate-300 sm:text-base">${escapeHtml(p)}</p>`).join('\n');
    const list = section.bullets?.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('\n');
    return `<section class="space-y-3">
      <h2 class="text-base font-bold text-slate-100 sm:text-lg">${escapeHtml(section.heading)}</h2>
      ${paragraphs}
      ${list ? `<ul class="list-disc space-y-1 pl-6 text-sm leading-7 text-slate-300">${list}</ul>` : ''}
    </section>`;
  }).join('\n');

  return shell
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/i, () => `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/i, () => `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/i, () => `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/i, () => `<meta property="og:url" content="${url}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, () => `<link rel="canonical" href="${url}" />`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/i, '')
    .replace('<div id="root"></div>', () => `<div id="root">
    <main class="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <nav class="mb-5 flex flex-wrap gap-5 text-sm" aria-label="Навігація">
        <a href="/" class="text-cyan-300 hover:underline">${escapeHtml(copy.home)}</a>
        <a href="/terms" class="text-cyan-300 hover:underline"${page === 'terms' ? ' aria-current="page"' : ''}>${escapeHtml(copy.termsLink)}</a>
        <a href="/privacy" class="text-cyan-300 hover:underline"${page === 'privacy' ? ' aria-current="page"' : ''}>${escapeHtml(copy.privacyLink)}</a>
      </nav>
      <h1 class="mb-4 text-2xl font-bold tracking-tight text-white sm:text-4xl">${escapeHtml(legalDocument.title)}</h1>
      <p class="mb-8 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">${description}</p>
      <div class="space-y-7 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:p-8">
        ${sections}
      </div>
      <p class="mt-8 text-sm"><a href="mailto:${LEGAL_EMAIL}" class="text-cyan-300 hover:underline">${LEGAL_EMAIL}</a></p>
    </main>
  </div>`);
}
