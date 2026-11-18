import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../src/context/LanguageContext';
import { LegalPage } from '../src/components/LegalPage';
import { SiteFooter } from '../src/components/SiteFooter';
import { getLegalCopy } from '../src/legal/content';

for (const language of ['uk', 'en', 'pl', 'ru'] as const) {
  test('complete legal documents exist for ' + language, () => {
    const copy = getLegalCopy(language);
    assert.equal(copy.terms.sections.length, 13);
    assert.equal(copy.privacy.sections.length, 14);
    assert.ok(copy.terms.title);
    assert.ok(copy.privacy.title);
    assert.match(copy.copyright, /© 2026\./);
    for (const document of [copy.terms, copy.privacy]) {
      assert.ok(document.intro.length > 40);
      for (const section of document.sections) {
        assert.ok(section.heading.length > 4);
        assert.ok(section.paragraphs.length > 0);
        assert.ok(section.paragraphs.every(p => p.length > 15));
      }
    }
  });
}

for (const page of ['terms', 'privacy'] as const) {
  test('public ' + page + ' page renders for guest without authentication', () => {
    const html = renderToStaticMarkup(
      React.createElement(LanguageProvider, { children: React.createElement(LegalPage, { page }) }),
    );
    assert.match(html, /h00k\.top/);
    assert.match(html, /info@h00k\.top/);
    assert.match(html, /src="\/h00k-robot-logo\.svg"/);
    assert.match(html, /Binance &amp; Bybit/);
    assert.doesNotMatch(html, /github\.com\/maks37614\/h00k/);
    assert.match(html, /href="\/terms"/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /© 2026\./);
    assert.match(html, /option value="pl"/);
    assert.match(html, /data-legal-brand-row/, 'legal header has centered logo grid');
    assert.match(html, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
    assert.match(html, /aria-label="На весь екран"/, 'fullscreen follows centered legal logo');
    assert.match(html, /class="block h-8 w-auto"/, 'legal logo has original displayed height');
  });
}

test('footer places email above exchanges beside the logo, with copyright last', () => {
  const html = renderToStaticMarkup(React.createElement(LanguageProvider, {
    children: React.createElement(SiteFooter),
  }));
  assert.match(html, /src="\/h00k-logo\.svg"/);
  assert.match(html, /Binance &amp; Bybit/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
  assert.doesNotMatch(html, /github\.com\/maks37614\/h00k/);
  assert.doesNotMatch(html, /Made in/);
  const logo = html.indexOf('src="/h00k-logo.svg"');
  const email = html.indexOf('mailto:info@h00k.top');
  const brand = html.indexOf('Binance &amp; Bybit');
  const terms = html.indexOf('href="/terms"');
  const privacy = html.indexOf('href="/privacy"');
  const copyright = html.indexOf('© 2026.');
  assert.ok(logo >= 0 && logo < email && email < brand && brand < terms && terms < privacy && privacy < copyright);
  assert.match(html, /class="flex flex-col items-center justify-center gap-1"/);
  assert.match(html, /class="block h-10 w-auto sm:h-12"/);
});
