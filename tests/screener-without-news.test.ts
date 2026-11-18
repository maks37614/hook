import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Screener has no crypto news widget and Market Sentiment remains available', () => {
  const screener = source('../src/components/CoinScreenerPage.tsx');
  assert.doesNotMatch(screener, /CryptoNewsWidget|\bnews\/crypto\b|Показати ще новини/);
  assert.match(screener, /<MarketSentimentWidget coins=\{coins\}/);
  assert.doesNotMatch(screener, /xl:grid-cols-2/);
  assert.equal(existsSync(new URL('../src/components/CryptoNewsWidget.tsx', import.meta.url)), false);
});

test('Market Sentiment fills the same available Screener width on desktop and mobile', () => {
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const sentiment = source('../src/components/MarketSentimentWidget.tsx');
  assert.match(screener, /<MarketSentimentWidget coins=\{coins\}/);
  const cardClasses = sentiment.match(/className="(w-full min-w-0 rounded-2xl bg-gradient-to-r[^"]*)"/)?.[1];
  const statusClasses = sentiment.match(/className="(w-full min-w-0 rounded-2xl border border-slate-800[^"]*)"/)?.[1];
  for (const classes of [cardClasses, statusClasses]) {
    assert.ok(classes, 'the outer card must fill the available width');
    // The gauge inside the card intentionally has its own desktop width cap.
    assert.doesNotMatch(classes, /\bmax-w-/);
  }
});

test('News request, translation and server startup dependencies are removed', () => {
  const server = source('../server.ts');
  const env = source('../.env.example');
  assert.doesNotMatch(server, /installCryptoNewsRoutes|server\/cryptoNewsFeed|\/api\/news\/crypto/);
  assert.equal(existsSync(new URL('../server/cryptoNewsFeed.ts', import.meta.url)), false);
  assert.doesNotMatch(env, /MYMEMORY_CONTACT_EMAIL/);
  assert.equal(existsSync(new URL('./crypto-news-feed.test.ts', import.meta.url)), false);
});

test('News removal keeps independent market sentiment and surveillance intact', () => {
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const sentiment = source('../src/components/MarketSentimentWidget.tsx');
  const surveillance = source('../server/surveillance/macroAndNewsEngine.ts');
  assert.match(screener, /MarketSentimentWidget/);
  assert.match(sentiment, /\/api\/market\/sentiment/);
  assert.match(surveillance, /class MacroAndNewsEngine/);
});

/** Guard every runtime source/config file, not just the original Screener component. */
function runtimeTextFiles(root: URL): URL[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap(entry => {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), root);
    if (entry.isDirectory()) return runtimeTextFiles(target);
    if (!entry.isFile() || !/\.(?:ts|tsx|js|jsx|mjs|cjs|css|json|html|md|yaml|yml)$/.test(entry.name)) return [];
    return [target];
  });
}

test('no retired Crypto News or MyMemory translator references remain anywhere in source/config', () => {
  const runtimeFiles = [
    ...runtimeTextFiles(new URL('../src/', import.meta.url)),
    ...runtimeTextFiles(new URL('../server/', import.meta.url)),
    ...['../server.ts', '../.env.example', '../Dockerfile', '../compose.yaml',
      '../vite.config.ts', '../package.json', '../index.html'].map(p => new URL(p, import.meta.url)),
  ];
  const retired = /CryptoNewsWidget|cryptoNewsFeed|installCryptoNewsRoutes|\/api\/news\/crypto|cryptocurrency\.cv|mymemory(?:\.translated\.net)?|MYMEMORY_CONTACT_EMAIL|CRYPTO_VISION_SOURCES|localizeTitle|selectLatestCryptoHeadlines|mergeCryptoHeadlineBatches|normalizeHeadlineLimit/i;
  for (const file of runtimeFiles) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, retired, 'Orphaned news module / external translation dependency in ' + file.pathname);
  }
});

test('removed remote news translator does not remove the four-language local interface translations', () => {
  const context = source('../src/context/LanguageContext.tsx');
  const locale = source('../src/locales/index.ts');
  assert.match(context, /translatePhrase/);
  assert.match(context, /translateHookChartPhrase/);
  for (const lang of ['uk', 'en', 'pl', 'ru']) {
    assert.equal(existsSync(new URL('../src/locales/' + lang + '.ts', import.meta.url)), true);
  }
  assert.match(locale, /translateKey/);
  assert.doesNotMatch(context, /https?:\/\/[^\s'"]*translat/i, 'UI localization should not call external translation APIs');
});

test('compiled production assets do not contain retired Crypto News routes or remote translator', () => {
  // GitHub Actions builds the application before running the test suite.
  // Outside CI a developer may have deliberately kept older build artifacts.
  if (!process.env.CI) return;
  const distAssets = new URL('../dist/assets/', import.meta.url);
  assert.equal(existsSync(distAssets), true, 'production build must run first');
  const bundles = readdirSync(distAssets).filter(p => /\.(?:js|css)$/.test(p));
  assert.ok(bundles.length > 0);
  for (const filename of bundles) {
    const data = readFileSync(new URL(filename, distAssets), 'utf8');
    assert.doesNotMatch(data, /\/api\/news\/crypto|mymemory(?:\.translated\.net)?|cryptocurrency\.cv/i,
      'Old news dependency remains in compiled asset ' + filename);
  }
});
