'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const legacyName = new RegExp(['smart', 'dock'].join('\\s+'), 'i');

function sourceFiles(folder) {
  const results = [];
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(item.name)) continue;
    const file = path.join(folder, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'build') results.push(...sourceFiles(file));
      else results.push(path.join(file, 'installer.nsh'));
    } else if (/\.(?:cjs|js|html|nsh|json|md|ps1|yml)$/i.test(item.name)) {
      results.push(file);
    }
  }
  return results;
}

test('no old product tagline in desktop UI, installer, documentation or source', () => {
  for (const filename of sourceFiles(desktopRoot)) {
    const content = fs.readFileSync(filename, 'utf8');
    assert.doesNotMatch(content, legacyName, path.relative(desktopRoot, filename));
  }
});

test('installer and settings consistently present the h00k Desktop name', () => {
  const settings = fs.readFileSync(path.join(desktopRoot, 'settings.html'), 'utf8');
  const main = fs.readFileSync(path.join(desktopRoot, 'main.cjs'), 'utf8');
  const nsis = fs.readFileSync(path.join(desktopRoot, 'build', 'installer.nsh'), 'utf8');
  const assets = fs.readFileSync(path.join(desktopRoot, 'scripts', 'generate-installer-assets.cjs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
  assert.match(settings, /h00k Desktop/);
  assert.match(settings, /Налаштування прикріплення/);
  assert.match(main, /title: 'h00k Desktop • ' \+ nativeT\('settingsTitle',settings\.uiLanguage\)/);
  assert.doesNotMatch(settings, /<h1>Desktop<\/h1>/);
  assert.match(nsis, /MUI_WELCOMEPAGE_TEXT "\$\(h00kWelcome\)"/);
  const translations = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'i18n', 'installer.json'), 'utf8'));
  for (const strings of Object.values(translations)) {
    assert.match(strings.welcome, /h00k Desktop/);
  }
  assert.match(assets, /WINDOWS<\/text>/);
  assert.equal(pkg.build.productName, 'h00k Desktop');
});
