'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(dir,'settings-i18n.js'),'utf8');
const html = fs.readFileSync(path.join(dir,'settings.html'),'utf8');
const context = {};
vm.runInNewContext(source, context, {filename:'settings-i18n.js'});
const i18n = context.h00kSettingsI18n;

test('the settings language selector and its dictionaries are packaged', () => {
  const pkg = require('../package.json');
  assert.ok(pkg.build.files.includes('settings-i18n.js'));
  assert.match(html, /<script src="\.\/settings-i18n\.js"><\/script>/);
  for (const lang of ['en','uk','ru','pl']) {
    assert.match(html, new RegExp('<option value="' + lang + '">'));
  }
  assert.equal(i18n.languages.length, 4);
  assert.ok(i18n.keys.length >= 70);
  for (const lang of ['en','pl','ru']) {
    for (const key of i18n.keys) {
      assert.equal(typeof i18n.translate(key,lang),'string');
      assert.ok(i18n.translate(key,lang).length > 0, 'empty translation: ' + lang + ' ' + key);
    }
  }
  assert.equal(i18n.translate('Мова','en'),'Language');
  assert.equal(i18n.translate('Мова','pl'),'Język');
  assert.equal(i18n.translate('Мова','ru'),'Язык');
  assert.equal(i18n.translate('Мова','uk'),'Мова');
});

test('all visible original settings copy has translations', () => {
  const staticHtml = html.split('<script src="./settings-i18n.js">')[0];
  const visible = staticHtml.replace(/<[^>]*>/g, '\u0001').split('\u0001')
    .map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);
  const productNames = new Set([
    'h00k Desktop · Налаштування прикріплення', // document.title changes separately
    'Desktop','01','02','03','English','Українська','Русский','Polski',
  ]);
  for (const phrase of visible) {
    assert.ok(productNames.has(phrase) || i18n.keys.includes(phrase),
      'Untranslated settings text: ' + phrase);
  }
  for (const phrase of [
    'Весь h00k.top','Плаваючі вікна','Раннє виявлення',
    'Автоматично · де більше місця','Очікування термінала','Збережено',
    'Термінал не знайдено: запустіть його або виберіть вікно вручну',
    'Немає достатньо місця навколо термінала; звільніть простір або зменшіть його вікно',
  ]) assert.ok(i18n.keys.includes(phrase));
});

test('provider status is translated without changing window titles', () => {
  assert.equal(
    i18n.translateStatus('Прикріплено автоматично праворуч до BTC USD','en'),
    'Attached automatically on the right to BTC USD');
  assert.equal(
    i18n.translateStatus('Прикріплено ліворуч до Мій термінал','pl'),
    'Przypięto po lewej do Мій термінал');
  assert.equal(
    i18n.translateStatus('Термінал згорнуто','ru'),
    'Терминал свёрнут');
  assert.equal(
    i18n.translateStatus('Прикріплено автоматично знизу до Binance','uk'),
    'Прикріплено автоматично знизу до Binance');
});

test('language changes persist without discarding unsaved docking changes', () => {
  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline);
  assert.doesNotThrow(()=>new vm.Script(inline[1]));
  assert.match(html,/localStorage\.getItem\(LANGUAGE_KEY\)/);
  assert.match(html,/localStorage\.setItem\(LANGUAGE_KEY,language\)/);
  assert.match(html,/applyLanguage\(\); \/\/ Do not render\(\)/);
  assert.match(html,/i18n\.translateStatus\(terminal\?\.status\|\|'Очікування',language\)/);
});
