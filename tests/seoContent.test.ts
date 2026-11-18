import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { JSDOM } from 'jsdom';
import { createSeoAssets } from '../seo/guideAssets';
import { installProductionAssets } from '../server/productionAssets';
import { legalPages, renderLegalHtml } from '../seo/legalAssets';
import { getLegalCopy } from '../src/legal/content';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const origin = 'https://h00k.top';
const languages = ['uk', 'en', 'pl', 'ru'];
const sections = [
  'crypto-screener', 'scalping', 'day-trading', 'hookchart', 'crypto-patterns', 'terminal', 'alerts',
  'market-replay', 'liquidations',
];
const landingPath = (lang: string, section: string) => `/${lang}/${section}.html`;
const landingPaths = new Set(languages.flatMap(lang => sections.map(section => landingPath(lang, section))));
const assets = createSeoAssets();
const readLanding = (pathname: string) => assets.get(pathname.slice(1)) ?? read(`public${pathname}`);
const documentFrom = (html: string) => new JSDOM(html).window.document;

test('homepage and legal pages have independent canonical metadata', () => {
  const homepage = read('index.html');
  assert.match(homepage, /<link rel="canonical" href="https:\/\/h00k\.top\/"\s*\/>/);
  assert.match(homepage, /<meta property="og:image" /);
  const fallback = homepage.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
  assert.ok(fallback);
  assert.match(fallback, /<h1>.*Binance і Bybit<\/h1>/);
  for (const lang of languages) {
    assert.ok(fallback.includes(`href="${landingPath(lang, 'crypto-screener')}" lang="${lang}"`));
  }
  const shell = process.env.CI ? read('dist/index.html') : homepage;
  const shellDocument = documentFrom(shell);
  const scriptSource = shellDocument.querySelector('script[type="module"]')?.getAttribute('src');
  shellDocument.defaultView?.close();
  assert.ok(scriptSource);
  for (const page of legalPages) {
    const html = renderLegalHtml(shell, page);
    if (process.env.CI) assert.equal(read(`dist/${page}.html`), html);
    const document = documentFrom(html);
    const copy = getLegalCopy('uk')[page];
    const url = `${origin}/${page}`;
    assert.deepEqual([...document.querySelectorAll('link[rel="canonical"]')].map(link => link.getAttribute('href')), [url]);
    assert.equal(document.querySelector('meta[property="og:url"]')?.getAttribute('content'), url);
    assert.equal(document.querySelector('meta[name="description"]')?.getAttribute('content'), copy.intro);
    assert.equal(document.title, copy.title + ' — h00k.top');
    assert.equal(document.querySelector('#root main h1')?.textContent, copy.title);
    const sections = [...document.querySelectorAll('#root main section')];
    assert.deepEqual(sections.map(section => ({
      heading: section.querySelector('h2')?.textContent,
      paragraphs: [...section.querySelectorAll('p')].map(p => p.textContent),
      bullets: [...section.querySelectorAll('li')].map(li => li.textContent),
    })), copy.sections.map(section => ({ ...section, bullets: section.bullets ?? [] })));
    assert.equal(document.querySelector('#root nav a[aria-current="page"]')?.getAttribute('href'), '/' + page);
    assert.equal(document.querySelector('noscript'), null);
    assert.equal(document.querySelector('script[type="module"]')?.getAttribute('src'), scriptSource);
    document.defaultView?.close();
  }
});

test('robots and sitemap reference all canonical landing pages and legal pages', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /^User-agent: \*\r?\nAllow: \/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/h00k\.top\/sitemap\.xml$/m);

  const sitemap = assets.get('sitemap.xml');
  assert.ok(sitemap);
  const xml = new JSDOM(sitemap, { contentType: 'application/xml' }).window.document;
  assert.equal(xml.documentElement.namespaceURI, 'http://www.sitemaps.org/schemas/sitemap/0.9');
  const urls = [...xml.querySelectorAll('url > loc')].map(loc => loc.textContent);
  assert.equal(urls.length, 39);
  assert.deepEqual(new Set(urls), new Set(['/', '/terms', '/privacy', ...landingPaths].map(p => origin + p)));
  if (process.env.CI) assert.equal(read('dist/sitemap.xml'), sitemap);
});

test('each language has static, interlinked pages with unique metadata and reciprocal hreflang', () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const lang of languages) {
    for (const section of sections) {
      const pathname = landingPath(lang, section);
      const url = origin + pathname;
      const html = readLanding(pathname);
      if (process.env.CI) assert.equal(read(`dist${pathname}`), html);
      const document = documentFrom(html);
      assert.equal(document.documentElement.lang, lang, pathname);
      assert.deepEqual(
        [...document.head.querySelectorAll('link[rel="canonical"]')].map(link => link.getAttribute('href')),
        [url],
      );
      assert.match(document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '', /^index, follow/);
      assert.equal(document.querySelectorAll('h1').length, 1);
      assert.ok(document.querySelector('main h1')?.textContent?.trim(), pathname);
      assert.ok(document.querySelector('main p')?.textContent?.trim(), pathname);
      assert.ok(document.querySelector('link[rel="stylesheet"][href="/seo/landing.css"]'));
      assert.equal(document.querySelector('script:not([type="application/ld+json"])'), null, pathname);
      assert.equal(document.querySelector('iframe, link[rel~="prefetch"], link[rel~="prerender"], link[rel~="modulepreload"]'), null, pathname);
      const alternateLinks = document.head.querySelectorAll('link[rel="alternate"][hreflang]');
      assert.equal(alternateLinks.length, 5);
      for (const altLang of [...languages, 'x-default']) {
        const altPath = landingPath(altLang === 'x-default' ? 'en' : altLang, section);
        assert.equal(document.head.querySelector(`[hreflang="${altLang}"]`)?.getAttribute('href'), origin + altPath);
      }
      for (const switchLang of languages) {
        assert.ok(document.querySelector(`header nav a[href="${landingPath(switchLang, section)}"]`));
      }
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
      assert.ok(description);
      titles.add(document.title);
      descriptions.add(description);
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(script => JSON.parse(script.textContent ?? ''));
      const schema = schemas.find(item => item['@type'] === 'WebPage');
      assert.ok(schema);
      assert.equal(schema.url, url);
      assert.equal(schema.name, document.title);
      assert.equal(schema.description, description);
      assert.equal(schema.inLanguage, lang);
      assert.equal(document.querySelector('meta[property="og:url"]')?.getAttribute('content'), url);
      assert.equal(document.querySelector('meta[property="og:title"]')?.getAttribute('content'), document.title);
      assert.equal(document.querySelector('meta[property="og:description"]')?.getAttribute('content'), description);

      const guideLinks = [...document.querySelectorAll('main a[href$=".html"]')].map(link => link.getAttribute('href')!);
      assert.ok(guideLinks.length > 0);
      for (const link of guideLinks) {
        assert.ok(landingPaths.has(link) && link.startsWith(`/${lang}/`), link);
      }
      if (section === 'crypto-screener') {
        assert.deepEqual(new Set(guideLinks), new Set(sections.slice(1).map(slug => landingPath(lang, slug))));
      } else {
        const parent = landingPath(lang, 'crypto-screener');
        const breadcrumb = schemas.find(item => item['@type'] === 'BreadcrumbList');
        const parentLink = document.querySelector('nav.breadcrumbs a');
        const currentItem = document.querySelector('nav.breadcrumbs [aria-current="page"]');
        assert.ok(parentLink?.textContent && currentItem?.textContent, pathname);
        assert.equal(parentLink.getAttribute('href'), parent);
        assert.deepEqual(breadcrumb?.itemListElement, [
          { '@type': 'ListItem', position: 1, name: parentLink.textContent, item: origin + parent },
          { '@type': 'ListItem', position: 2, name: currentItem.textContent, item: url },
        ]);
      }
      const appPath = {
        'crypto-patterns': '/#patterns', terminal: '/#terminal', 'day-trading': '/#replay', 'market-replay': '/#replay',
      }[section] ?? '/#screener';
      assert.ok(document.querySelector(`main .button[href="${appPath}"]`), pathname);
      document.defaultView?.close();
    }
  }
  assert.equal(titles.size, landingPaths.size);
  assert.equal(descriptions.size, landingPaths.size);
  assert.match(read('src/components/SiteFooter.tsx'), /crypto-screener\.html/);
});

test('production serves canonical pages, keeps account links functional and returns real 404s', async t => {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'h00k-seo-'));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const files = new Map(assets);
  const shell = read('index.html');
  files.set('index.html', shell);
  for (const page of legalPages) files.set(`${page}.html`, renderLegalHtml(shell, page));
  files.set('robots.txt', read('public/robots.txt'));
  files.set('seo/landing.css', read('public/seo/landing.css'));
  files.set('uk/crypto-screener.html', read('public/uk/crypto-screener.html'));
  files.set('assets/test.js', 'export {};');
  for (const [name, source] of files) {
    const filename = path.join(dist, name);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, source);
  }
  const app = express();
  app.set('trust proxy', 'loopback');
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  installProductionAssets(app, dist);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>(resolve => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (pathname: string, options?: RequestInit) =>
    fetch(base + pathname, { redirect: 'manual', ...options });

  for (const pathname of ['/', '/#terminal', '/#/chart/binance/futures/BTCUSDT/15m', '/?h00kDesktop=1#replay']) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(await response.text(), /id="root"/);
  }
  for (const pathname of ['/replay', '/terminal', '/welcome']) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.match(await response.text(), /id="root"/);
  }
  for (const pathname of ['/?resetPassword=example', '/?verifyEmail=example']) {
    const response = await request(pathname);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /id="root"/);
  }
  for (const [pathname, mime] of [
    ['/pl/scalping.html', 'text/html'],
    ['/en/market-replay.html', 'text/html'],
    ['/uk/liquidations.html', 'text/html'],
    ['/uk/crypto-screener.html', 'text/html'],
    ['/seo/landing.css', 'text/css'],
    ['/robots.txt', 'text/plain'],
    ['/sitemap.xml', 'application/xml'],
  ]) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.ok(response.headers.get('content-type')?.startsWith(mime));
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
    const etag = response.headers.get('etag');
    assert.ok(etag);
    assert.ok(response.headers.get('last-modified'));
    await response.arrayBuffer();
    const reused = await request(pathname, { cache: 'force-cache', headers: { 'If-None-Match': etag } });
    assert.equal(reused.status, 304, pathname);
    assert.equal(await reused.text(), '');
  }
  for (const pathname of ['/terms', '/privacy']) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(await response.text(), /<main class=.*?>[\s\S]*?<h1/);
    const alias = await request(pathname + '.html?lang=pl', { method: 'HEAD' });
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get('location'), pathname + '?lang=pl');
  }

  const canonical = await request('/index.html?h00kDesktop=1', { method: 'HEAD' });
  assert.equal(canonical.status, 308);
  assert.equal(canonical.headers.get('location'), '/?h00kDesktop=1');
  const wwwHeaders = { 'X-Forwarded-Host': 'www.h00k.top' };
  const www = await request('/pl/scalping.html?q=1', { headers: wwwHeaders });
  assert.equal(www.status, 308);
  assert.equal(www.headers.get('location'), `${origin}/pl/scalping.html?q=1`);
  await www.arrayBuffer();
  const termsAlias = await request('/terms/?lang=pl', { method: 'HEAD' });
  assert.equal(termsAlias.status, 308);
  assert.equal(termsAlias.headers.get('location'), '/terms?lang=pl');
  const wwwPrivacyAlias = await request('/privacy/', { method: 'HEAD', headers: wwwHeaders });
  assert.equal(wwwPrivacyAlias.status, 308);
  assert.equal(wwwPrivacyAlias.headers.get('location'), `${origin}/privacy`);

  const api = await request('/api/health', { headers: wwwHeaders });
  assert.deepEqual(await api.json(), { status: 'ok' });
  const bundle = await request('/assets/test.js');
  assert.match(bundle.headers.get('cache-control') ?? '', /immutable/);
  await bundle.arrayBuffer();
  for (const pathname of ['/missing-path', '/en/missing-page.html', '/assets/missing.js', '/api/missing']) {
    const response = await request(pathname);
    assert.equal(response.status, 404, pathname);
    assert.doesNotMatch(await response.text(), /id="root"/);
  }
});

test('API-only server startup must not require frontend dist/index.html', () => {
  const emptyDist = mkdtempSync(path.join(os.tmpdir(), 'h00k-seo-'));
  try {
    const app = express();
    assert.doesNotThrow(() => installProductionAssets(app, emptyDist));
  } finally {
    rmSync(emptyDist, { recursive: true, force: true });
  }
});
