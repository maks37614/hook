import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const captcha = readFileSync(new URL('../src/components/AuthCaptcha.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/AuthModal.tsx', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../server/authCaptcha.ts', import.meta.url), 'utf8');

test('CAPTCHA script failures cannot leave the login dialog waiting indefinitely', () => {
  assert.match(captcha, /SCRIPT_TIMEOUT_MS = 10_000/);
  assert.match(captcha, /window\.setTimeout\(\(\) => finish\(undefined, new Error\('Turnstile script timed out'\)\), SCRIPT_TIMEOUT_MS\)/);
  assert.match(captcha, /window\.clearTimeout\(timeout\)/);
  assert.match(captcha, /script\.remove\(\)/);
  assert.match(captcha, /loader = null/, 'failed script loads must be retryable');
});

test('CAPTCHA challenge stalls and Cloudflare callbacks expose recovery without bypassing verification', () => {
  assert.match(captcha, /CHALLENGE_NOTICE_MS = 15_000/);
  assert.match(captcha, /'before-interactive-callback'/, 'do not warn while a human is solving a challenge');
  assert.match(captcha, /'expired-callback'/);
  assert.match(captcha, /'timeout-callback'/);
  assert.match(captcha, /'error-callback'/);
  assert.match(captcha, /'refresh-expired': 'auto'/);
  assert.match(captcha, /setRetry\(value => value \+ 1\)/);
  assert.match(captcha, /onChangeRef\.current\(null\)/, 'failed or expired CAPTCHA must invalidate the token');
  assert.match(captcha, /api\.remove\(widgetId\)/, 'old widgets must be removed on retry');
});

test('auth config fetch has a deadline, safe retry, and localized failure messages', () => {
  assert.match(modal, /CAPTCHA_CONFIG_TIMEOUT_MS = 8_000/);
  assert.match(modal, /const controller = new AbortController\(\)/);
  assert.match(modal, /controller\.abort\(\)/);
  assert.match(modal, /signal: controller\.signal/);
  assert.match(modal, /setCaptchaConfigRetry\(value => value \+ 1\)/);
  assert.match(modal, /'unconfigured' \| 'unavailable'/);
  for (const locale of ['uk', 'en', 'pl', 'ru']) {
    assert.match(modal, new RegExp('\\b' + locale + ': \\{'));
    assert.match(captcha, new RegExp('\\b' + locale + ': \\{'));
  }
  assert.match(modal, /disabled=\{busy \|\| \(mode !== 'reset' && !captchaToken\)\}/);
  assert.match(verifier, /verifyAuthCaptcha/);
  assert.match(verifier, /result\.success !== true \|\| result\.hostname !== expectedHost \|\| result\.action !== AUTH_CAPTCHA_ACTION/);
});
