'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('local settings page contains valid JavaScript and all required modes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline, 'settings script exists');
  assert.doesNotThrow(() => new vm.Script(inline[1], {filename:'desktop/settings.html'}));
  for (const item of ['MetaScalp', 'Tiger.Trade', 'Vataga', 'Весь h00k.top',
                      'Вибрані блоки', 'Плаваючі вікна', 'Мультивікна', 'Праворуч',
                      'Ліворуч', 'Зверху', 'Знизу']) {
    assert.ok(html.includes(item), 'missing option: ' + item);
  }
});
test('desktop remote content does not load a privileged bridge', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  const start = main.indexOf('function makeContentWindow(');
  const end = main.indexOf('function createSettingsWindow(');
  assert.ok(start >= 0 && end > start);
  const remote = main.slice(start, end);
  assert.ok(remote.includes('nodeIntegration: false'));
  assert.ok(remote.includes('contextIsolation: true'));
  assert.ok(remote.includes('sandbox: true'));
  assert.ok(!remote.includes('preload:'));
});

test('first-run welcome and branded assets are bundled for the settings window', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'settings.css'), 'utf8');
  const logo = fs.readFileSync(path.join(__dirname, '..', 'robot-logo.svg'), 'utf8');
  const pkg = require('../package.json');
  assert.match(html, /id="onboarding" hidden/);
  assert.match(html, /function drawOnboarding\(\)/);
  assert.match(html, /api\.onSnapshot\(value=>\{/);
  assert.match(html, /savedDraftMatches\(previous\)/);
  assert.match(html, /if\(changed\)render\(\); else \{drawOnboarding\(\);drawStatus\(\);\}/);
  assert.match(css, /#070d18/);
  assert.match(css, /#22d3ee/);
  assert.match(css, /@media\(max-width:690px\)/);
  assert.match(logo, /robot-eye-blink/);
  for (const file of ['settings.css','robot-logo.svg']) assert.ok(pkg.build.files.includes(file));
});

test('quick attach uses auto mode and reports actual connection status',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','settings.html'),'utf8');
  assert.match(html,/Автоприкріпити зараз/);
  assert.ok(html.includes("['auto','Автоматично · де більше місця']"));
  assert.ok(html.includes("api.save(active,{...form(),enabled:true,side:'auto'})"));
  assert.ok(html.includes("terminal?.status || 'Очікування термінала'"));
});

test('automatic side is visually separated without breaking the four manual choices',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','settings.css'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','settings.html'),'utf8');
  assert.match(css,/#sides label:first-child\{grid-column:1\/-1/);
  assert.match(html,/id="sides"/);
  assert.ok(html.includes("['right','Праворуч']") && html.includes("['left','Ліворуч']"));
  assert.ok(html.includes("['top','Зверху']") && html.includes("['bottom','Знизу']"));
});
