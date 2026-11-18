'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const locales = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'installer.json'), 'utf8'));
const nsis = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const generated = fs.readFileSync(path.join(root, 'build', 'installer-locales.nsh'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const LCIDS = {en:1033,pl:1045,ru:1049,uk:1058};

test('four complete installer languages share a single translated text schema', () => {
  assert.deepEqual(Object.keys(locales), ['en', 'pl', 'ru', 'uk']);
  const keys = Object.keys(locales.en);
  assert.ok(keys.length >= 25, 'all screens and help pages are translated');
  for (const [lang, lcid] of Object.entries(LCIDS)) {
    assert.deepEqual(Object.keys(locales[lang]).sort(), keys.slice().sort(), 'missing translations for ' + lang);
    for(const key of keys) {
      const str = locales[lang][key];
      assert.equal(typeof str, 'string');
      assert.ok(str.trim(), 'blank translation '+lang+'.'+key);
      assert.ok(!/[\r\n]/.test(str), 'NSIS text must use escaped line breaks');
      const id = 'h00k' + key[0].toUpperCase() + key.slice(1);
      assert.ok(generated.includes('LangString ' + id + ' ' + lcid + ' "'),
        'missing NSIS LangString for ' + lang + '.' + key);
    }
  }
  assert.equal((generated.match(/^LangString /gm) || []).length,
    keys.length * Object.keys(LCIDS).length, 'no partial or extra language strings');
});

test('English is default with a visible native-language selector preceding welcome', () => {
  assert.equal(config.build.nsis.language, '1033');
  assert.deepEqual(config.build.nsis.installerLanguages, ['en_US','pl_PL','ru_RU','uk_UA']);
  assert.equal(config.build.nsis.multiLanguageInstaller, true);
  assert.equal(config.build.nsis.displayLanguageSelector, false, 'use explicit user choice, not Windows auto-selection');
  assert.ok(nsis.includes('StrCpy $LANGUAGE 1033'), 'English is set before pages');
  assert.ok(nsis.indexOf('Page custom h00kLanguagePageCreate') < nsis.indexOf('MUI_PAGE_WELCOME'),
    'language selector comes before the first content page');
  for(const lang of ['"English"', '"Polski"', '"Русский"', '"Українська"']) {
    assert.ok(nsis.includes(lang), 'missing visible language: ' + lang);
  }
  assert.ok(nsis.includes('h00kLanguagePageLeave'), 'switcher must save the language');
});

test('every custom page renders translations and guide contains practical, accurate API instructions', () => {
  for (const key of [
    'Welcome','LanguageTitle','ShortcutPrompt','ShortcutOption',
    'GuideTitle','Guide1','Guide2','Guide3','Guide4','Guide5',
    'Api1','Api2','Api3','Api4','Api5','GuideFooter'
  ]) {
    assert.ok(nsis.includes('$(h00k'+key+')'), 'custom wizard page misses '+key);
  }
  assert.ok(nsis.includes('customFinishPage'), 'post-install help is built into the installer');
  assert.ok(nsis.includes('h00kGuideBasicsCreate') && nsis.includes('h00kGuideLayoutCreate')
    && nsis.includes('h00kGuideApiCreate'));
  for (const lang of Object.keys(LCIDS)) {
    assert.match(locales[lang].api3,/Vataga/, 'Vataga API limitations must be disclosed in '+lang);
    assert.match(locales[lang].api4,/API|key|klucz|ключ/i,
      'read-only API guidance must exist in '+lang);
    assert.match(locales[lang].guideFooter,/h00k\.top/);
  }
  assert.ok(nsis.includes('H00kInstallerLanguage'), 'user selection persists across reinstalls');
  assert.ok(nsis.includes('customUnInit'), 'uninstaller language follows selection');
});

test('existing shortcut opt-in logic and icon packaging are preserved',()=>{
  assert.ok(nsis.includes('H00kDesktopShortcutChoice'));
  assert.ok(nsis.includes('NO_DESKTOP_SHORTCUT'));
  assert.ok(nsis.includes('DESKTOP_SHORTCUT'));
  assert.ok(nsis.includes('WinShell::SetLnkAUMI'));
  assert.equal(config.build.win.icon, 'build/h00k.ico');
  assert.equal(config.build.nsis.installerIcon,'build/h00k-installer.ico');
});

test('onboarding text is scrollable and language selector fits standard Windows wizard', () => {
  assert.equal((nsis.match(/nsDialogs::CreateControl EDIT/g)||[]).length, 3);
  assert.equal((nsis.match(/ES_MULTILINE/g)||[]).length, 3);
  assert.equal((nsis.match(/ES_READONLY/g)||[]).length, 3);
  assert.equal((nsis.match(/WS_VSCROLL/g)||[]).length, 3);
  const radios=[...nsis.matchAll(/NSD_CreateRadioButton\} 0 (\d+)u 100% (\d+)u/g)];
  assert.equal(radios.length,4);
  for(const [,y,h] of radios)assert.ok(Number(y)+Number(h)<=140,
    'the installer language switch must remain visible on standard NSIS page');
});

test('language radio buttons form exactly one exclusive Windows group',()=>{
  assert.equal((nsis.match(/NSD_CreateRadioButton/g)||[]).length,4);
  assert.equal((nsis.match(/NSD_AddStyle\} \$h00kRadioEn \$\{WS_GROUP\}/g)||[]).length,1);
  assert.equal((nsis.match(/WS_GROUP/g)||[]).length,2); // comment + macro: one exclusive group
  assert.ok(nsis.indexOf('NSD_AddStyle') > nsis.indexOf('Pop $h00kRadioEn'));
  assert.ok(nsis.indexOf('NSD_AddStyle') < nsis.indexOf('Pop $h00kRadioPl'));
});
