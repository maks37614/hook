import { escapeHtml } from './html.ts';
import { en } from './en.ts';
import { guideRoutes, type GuideDetailSlug, type GuideSlug } from './guideTypes.ts';
import { pl } from './pl.ts';
import { ru } from './ru.ts';
import { uk } from './uk.ts';

const origin = 'https://h00k.top';
const translations = { uk, en, pl, ru };
const languageNames = { uk: 'Українська', en: 'English', pl: 'Polski', ru: 'Русский' };
type Language = keyof typeof translations;
const languages = Object.keys(translations) as Language[];
const slugs = Object.keys(guideRoutes) as GuideSlug[];

function guidePath(language: Language, slug: GuideSlug): string {
  return `/${language}/${slug}.html`;
}

function renderGuide(language: Language, slug: GuideDetailSlug): string {
  const copy = translations[language];
  const page = copy.pages[slug];
  const url = origin + guidePath(language, slug);
  const overview = guidePath(language, 'crypto-screener');
  const name = `${page.title} | h00k`;
  const title = escapeHtml(name);
  const description = escapeHtml(page.description);
  const alternates = languages.map(lang =>
    `  <link rel="alternate" hreflang="${lang}" href="${origin + guidePath(lang, slug)}" />`).join('\n');
  const languageLinks = languages.map(lang =>
    `<a href="${guidePath(lang, slug)}" lang="${lang}" hreflang="${lang}"${lang === language ? ' aria-current="page"' : ''}>${languageNames[lang]}</a>`).join('\n');
  const sections = page.sections.map(({ heading, text }) => `
  <section class="section">
    <h2>${escapeHtml(heading)}</h2>
    <p>${escapeHtml(text)}</p>
  </section>`).join('\n');
  const related = page.related.map(target =>
    `<li><a href="${guidePath(language, target)}">${escapeHtml(copy.pages[target].label)}</a></li>`,
  ).join('\n');
  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name,
      description: page.description,
      url,
      inLanguage: language,
      isPartOf: { '@type': 'WebSite', name: 'h00k', url: `${origin}/` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: copy.screener, item: origin + overview },
        { '@type': 'ListItem', position: 2, name: page.label, item: url },
      ],
    },
  ].map(schema => `  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`).join('\n');

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <meta name="theme-color" content="#020617" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${url}" />
${alternates}
  <link rel="alternate" hreflang="x-default" href="${origin + guidePath('en', slug)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="h00k" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${origin}/pwa-512.png" />
  <meta name="twitter:card" content="summary" />
  <link rel="icon" href="/favicon.ico?v=5" />
  <link rel="stylesheet" href="/seo/landing.css" />
${schemas}
</head>
<body>
<header class="topbar">
  <div class="inner">
    <a href="/" class="brand"><img src="/h00k-robot-logo.svg" width="100" height="48" alt="" />h00k</a>
    <nav class="langs" aria-label="${escapeHtml(copy.languageNavigation)}">${languageLinks}</nav>
  </div>
</header>
<main class="inner">
  <nav class="breadcrumbs" aria-label="${escapeHtml(copy.breadcrumbNavigation)}">
    <ol><li><a href="${overview}">${escapeHtml(copy.screener)}</a></li><li aria-current="page">${escapeHtml(page.label)}</li></ol>
  </nav>
  <div class="hero">
    <h1>${escapeHtml(page.heading)}</h1>
    <p class="lead">${escapeHtml(page.lead)}</p>
    <a class="button" href="${guideRoutes[slug]}">${escapeHtml(page.open)}</a>
  </div>
  <div class="guide-body">${sections}
    <nav class="section" aria-labelledby="more-guides">
      <h2 id="more-guides">${escapeHtml(copy.moreGuides)}</h2>
      <ul class="guide-links">${related}</ul>
    </nav>
  </div>
</main>
<footer class="footer">
  <div class="inner">
    <nav>
      <a href="/#screener">${escapeHtml(copy.screener)}</a>
      <a href="/terms">${escapeHtml(copy.terms)}</a>
      <a href="/privacy">${escapeHtml(copy.privacy)}</a>
    </nav>
    <span>© 2026 h00k.top · Binance &amp; Bybit</span>
  </div>
</footer>
</body>
</html>
`;
}

export function createSeoAssets(): Map<string, string> {
  const files = new Map<string, string>();
  const paths = ['/'];
  for (const slug of slugs) {
    for (const language of languages) {
      const pathname = guidePath(language, slug);
      paths.push(pathname);
      if (slug !== 'crypto-screener') {
        files.set(pathname.slice(1), renderGuide(language, slug));
      }
    }
  }
  paths.push('/terms', '/privacy');
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(pathname => `  <url><loc>${origin + pathname}</loc></url>`).join('\n')}
</urlset>
`);
  return files;
}
