import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import {
  REGISTRATION_CONFIRMATION_KEY,
  registrationMailbox,
  rememberRegistrationEmail,
  pendingRegistrationEmail,
} from '../src/utils/registrationConfirmation';
import { RegistrationConfirmationPage } from '../src/components/RegistrationConfirmationPage';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Gmail and common mailbox domains open only well-known HTTPS inbox destinations', () => {
  assert.deepEqual(registrationMailbox('sample@gmail.com'),
    { name: 'Gmail', href: 'https://mail.google.com/' });
  assert.equal(registrationMailbox('MAIL@GOOGLEMAIL.COM')?.name, 'Gmail');
  assert.equal(registrationMailbox('user@outlook.com')?.href, 'https://outlook.live.com/mail/');
  assert.equal(registrationMailbox('user@icloud.com')?.href, 'https://www.icloud.com/mail/');
  assert.equal(registrationMailbox('user@proton.me')?.href, 'https://mail.proton.me/');
  assert.equal(registrationMailbox('user@unknown.example'), null,
    'Never construct an unsafe inbox URL from an arbitrary email domain');
  assert.equal(registrationMailbox('not-an-email'), null);
});

test('successful signup hands off only the email in tab-local storage for a limited time', () => {
  const values = new Map<string, string>();
  const store = {
    setItem: (key: string, value: string) => { values.set(key, value); },
    getItem: (key: string) => values.get(key) ?? null,
  };
  rememberRegistrationEmail(' person@gmail.com ', store, 1000);
  assert.equal(pendingRegistrationEmail(store, 1001), 'person@gmail.com');
  assert.equal(pendingRegistrationEmail(store, 1000 + 31 * 60 * 1000), null);
  assert.equal(pendingRegistrationEmail(store, 999), null);
  const serialized = values.get(REGISTRATION_CONFIRMATION_KEY) || '';
  assert.doesNotMatch(serialized, /password|captcha|token/i);
  assert.ok(serialized.includes('person@gmail.com'));
});

test('registration confirmation is a separate, noindex SPA page without trading providers', () => {
  const auth = read('src/components/AuthModal.tsx');
  const context = read('src/context/AuthContext.tsx');
  const main = read('src/main.tsx');
  const production = read('server/productionAssets.ts');
  const page = read('src/components/RegistrationConfirmationPage.tsx');

  assert.match(auth, /await registerWithEmail\(email\.trim\(\), password, displayName, captchaToken \|\| ''\)/);
  assert.match(auth, /rememberRegistrationEmail\(email\.trim\(\)\);\s*window\.location\.assign\('\/check-email'\)/);
  assert.doesNotMatch(context, /setAuthNotice\('Якщо адресу можна зареєструвати, на неї буде надіслано лист підтвердження/);
  assert.match(main, /registrationConfirmationPage \? \(/);
  assert.match(main, /<RegistrationConfirmationPage \/>/);
  assert.match(production, /'\/check-email'/);
  assert.match(production, /if \(isAccountLink \|\| pathname !== '\/'\)/, 'Public confirmation route remains noindex');
  assert.doesNotMatch(page, /window\.location\.search|new URLSearchParams\(|WebSocket|fetch\(/);
  assert.match(page, /rel="noopener noreferrer"/);
  const html = renderToStaticMarkup(React.createElement(RegistrationConfirmationPage));
  assert.match(html, /Підтвердьте електронну пошту/);
  assert.match(html, /data-registration-confirmation-page/);
  assert.match(html, /href="\/", /);
  assert.doesNotMatch(html, /mailto:/, 'A compose-mailto link is not a mailbox inbox');
});
