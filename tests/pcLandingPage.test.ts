import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/components/PcLandingPage.tsx', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');

test('PC landing is independently reachable for guests and lazy-loaded', () => {
  assert.match(app, /hash === '#replay' \|\| hash === '#pc'/);
  assert.match(app, /page !== 'screener' && page !== 'replay' && page !== 'pc'/);
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/components\/PcLandingPage'\)\)/);
  assert.match(app, /activePage === 'pc' \? \(/);
  assert.match(header, /nav-category-pc-btn/);
  assert.ok(header.includes('border-emerald-400/70'));
  // Both the original centered wrapper and the newer responsive Terminal
  // nav tile must keep the PC badge anchored above the Terminal control.
  const centeredWrapper = header.includes('w-max max-w-full shrink-0 items-center justify-center justify-self-center');
  const responsiveWrapper = header.includes('h00k-nav-terminal-wrap relative order-2 sm:order-none flex w-full xl:w-auto max-w-full shrink-0 items-center justify-center justify-self-center');
  assert.ok(centeredWrapper || responsiveWrapper, 'PC badge must remain anchored to the Terminal tile');
  assert.match(header, /<span[^>]*>\{t\('terminal'\)\}<\/span>/);

  // This placement can be centered or right-offset depending on the header
  // layout; do not tie PC navigation to one incidental CSS expression.
  assert.match(header, /id="nav-category-pc-btn"[\s\S]*?className=\{`absolute[^`]*?border border-emerald-400\/70/);
});

test('PC page has accessible navigation, local previews, and a nonbroken installer fallback', () => {
  assert.match(page, /https:\/\/drive\.google\.com\/file\/d\/1Pfif8g7d8ginmHbklMtUffKHbuzo_F03\/view\?usp=sharing/);
  assert.match(page, /https:\/\/github\.com\/maks37614\/h00k\/actions/);
  assert.match(page, /id="pc-gallery"/);
  assert.match(page, /aria-pressed=\{selectedPreview === index\}/);
  assert.match(page, /data-no-translate/);
  for (const language of ['uk:', 'en:', 'pl:', 'ru:']) {
    assert.ok(page.includes(language), `missing landing locale ${language}`);
  }
});

test('PC hero has no Windows eyebrow badge and is centered on mobile', () => {
  assert.doesNotMatch(page, /<Monitor size=\{14\} \/> \{c\.eyebrow\}/);
  assert.match(page, /<div className="flex min-w-0 flex-col items-center text-center">/);
  assert.match(page, /<h1 className="mt-2 text-4xl/);
  assert.match(page, /px-4 pb-20 pt-4 sm:px-6 sm:pt-6/);
  assert.match(page, /mt-8 flex flex-wrap justify-center gap-3/);
});
test('PC copy distinguishes Vataga docking from unsupported ticker transfer', () => {
  assert.match(page, /Автоматичне передавання тикерів до Vataga поки не реалізоване/);
  assert.match(page, /передавання символів/);
});

test('PC first setup step is named Installation in all four supported languages', () => {
  const expected = ['Встановлення', 'Installation', 'Instalacja', 'Установка'];
  for (const title of expected) {
    assert.ok(page.includes(`['${title}',`), `missing first step title: ${title}`);
  }
  for (const legacy of ['Отримайте інсталятор', 'Get the installer', 'Pobierz instalator', 'Получите установщик']) {
    assert.ok(!page.includes(`['${legacy}',`), `legacy first step title remains: ${legacy}`);
  }
  assert.match(page, /c\.howSteps\.map/);
});

test('PC installer gallery caption is concise and localized without removing preview disclaimer', () => {
  for (const title of [
    'Просте та швидке встановлення…',
    'Simple and quick installation…',
    'Prosta i szybka instalacja…',
    'Простая и быстрая установка…',
  ]) {
    assert.ok(page.includes(title), `missing installer caption: ${title}`);
  }
  assert.match(page, /c\.galleryDescriptions\[selectedPreview\]/);
  assert.match(page, /c\.demoDisclaimer/);
  assert.ok(!page.includes('Інсталятор із вибором папки та ярлика на робочому столі.'));
});

test('PC main and final download actions use the supplied Google Drive file on every locale', () => {
  assert.ok(page.includes('const downloadUrl = GOOGLE_DRIVE_INSTALLER;'));
  assert.equal(page.split('href={downloadUrl}').length - 1, 2);
  assert.ok(page.includes('href={GITHUB_BUILDS}'));
  assert.ok(!page.includes('isDirect') && !page.includes('directHint'));
  for (const label of [
    'Завантажити h00k Desktop',
    'Download h00k Desktop',
    'Pobierz h00k Desktop',
    'Скачать h00k Desktop',
  ]) assert.ok(page.includes(label), 'missing download label: ' + label);
  assert.equal(page.split('releaseLink:').length - 1, 4);
  assert.equal(page.split('sourceHint:').length - 1, 4);
});
