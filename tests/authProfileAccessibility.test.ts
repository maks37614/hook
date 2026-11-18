import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../src/components/AuthModal.tsx');
const profile = read('../src/components/UserProfileModal.tsx');
const css = read('../src/styles/accessibilityControls.css');

test('authentication dialog uses translated names and exposes password visibility', () => {
  assert.match(auth, /data-ui-a11y="auth-modal" role="dialog" aria-modal="true" aria-label=\{localizedTitle\}/);
  assert.match(auth, /onClick=\{onClose\} aria-label=\{translatePhrase\(language, "Закрити"\)\}/);
  assert.match(auth, /role="tablist" aria-label=\{translatePhrase\(language, "Авторизація"\)\}/);
  assert.match(auth, /aria-label=\{translatePhrase\(language, showPassword \? 'Приховати пароль' : 'Показати пароль'\)\} aria-pressed=\{showPassword\}/);
  assert.match(auth, /onClick=\{\(\) => setShowPassword\(value => !value\)\}/);
});

test('profile dialog keeps chart editor separate from account focus region', () => {
  assert.match(profile, /data-ui-a11y="profile-modal" role="dialog" aria-modal="true" aria-label=\{translatePhrase\(language, "Особистий профіль"\)\}/);
  assert.match(profile, /: <div data-ui-a11y="profile-account" className="space-y-5">/);
  assert.match(profile, /activeProfileSection === 'chart' \? \([\s\S]*?<ProfileHookChartSettings \/>/);
  assert.doesNotMatch(css, /\[data-ui-a11y="profile-modal"\] :is\(/);
});

test('account fields have visible associated HTML labels', () => {
  for (const id of [
    'profile-display-name',
    'profile-email',
    'profile-default-exchange',
    'profile-default-market',
    'profile-default-timeframe',
  ]) {
    assert.ok(profile.includes('htmlFor="' + id + '"'), 'missing label for ' + id);
    assert.ok(profile.includes('id="' + id + '"'), 'missing control id for ' + id);
  }
  assert.match(profile, /htmlFor="profile-time-zone"/);
  assert.match(profile, /id="profile-time-zone"/);
});

test('profile metric cards are keyboard-operable buttons without extra handlers', () => {
  const start = profile.indexOf('{/* Quick Metrics Bar */}');
  const end = profile.indexOf('{/* Privacy & Data Isolation Banner */}', start);
  assert.ok(start >= 0 && end > start);
  const metrics = profile.slice(start, end);
  assert.equal((metrics.match(/<button\s+type="button"/g) || []).length, 2);
  assert.match(metrics, /<button[\s\S]*?onOpenAlerts\?\.\(\);[\s\S]*?Мої сповіщення[\s\S]*?<\/button>/);
  assert.match(metrics, /<button[\s\S]*?onOpenArchive\?\.\(\);[\s\S]*?Мій архів формацій[\s\S]*?<\/button>/);
  assert.doesNotMatch(metrics, /<div\s+onClick=/);
});

test('account feedback is announced and session revoke names the device', () => {
  assert.match(profile, /role="status" className="p-3 rounded-xl bg-emerald-500\/15/);
  assert.match(profile, /role="alert" className="p-3 rounded-xl bg-rose-500\/15/);
  assert.match(profile, /aria-expanded=\{sessionsOpen\}/);
  assert.match(profile, /aria-label=\{.*'Завершити сеанс'.*session\.userAgent.*\}/);
});

test('auth and account focus CSS is keyboard-only and excludes charts', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const selectors = rules.slice(0, rules.indexOf('{')).trim().split(',\n').map(s => s.trim());
  for (const scope of ['auth-modal', 'profile-account']) {
    assert.ok(selectors.some(s => s.includes('[data-ui-a11y="' + scope + '"]') && s.endsWith(':focus-visible')),
      'missing keyboard-only scope for ' + scope);
  }
  assert.ok(selectors.every(s => !/hookchart|canvas|replay|terminal-chart/i.test(s)));
  assert.doesNotMatch(rules, /(?:^|[;{}\s])(?:animation|transition|transform|filter|backdrop-filter|width|height|padding|margin|font-size|will-change)\s*:/i);
});
