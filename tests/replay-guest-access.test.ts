import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const header = read('../src/components/Header.tsx');
const phrases = read('../src/locales/extraPhrases.ts');

test('Replay navigation requires an authenticated user, including direct hashes', () => {
  // #pc is public, but #replay must pass the same guest guard as Terminal.
  assert.match(app, /if \(hash === '#pc'\) \{/);
  assert.doesNotMatch(app, /hash === '#replay' \|\| hash === '#pc'/);
  assert.match(app, /if \(!user\) \{[\s\S]*?handleOpenAuthModal\('signin', 'general'\);[\s\S]*?window\.location\.hash = 'screener';/);
  assert.match(app, /if \(!user && page !== 'screener' && page !== 'pc'\)/);
});

test('Replay history and simulator components never mount for a guest', () => {
  assert.match(app, /activePage === 'replay' \? \(\s*user \? \(\s*<ReplayPage/);
  assert.match(app, /<ReplayPage[\s\S]*?onNavigateToScreener=\{\(\) => handlePageChange\('screener'\)\}/);
  assert.match(app, /Увійдіть у свій акаунт, щоб відкрити сторінку «Відтворення»\./);
});

test('Replay tab displays a lock for guests and all four languages have explanations', () => {
  assert.match(header, /title=\{!user \? tr\("Відтворення \(доступно після реєстрації\)"\)/);
  assert.match(header, /!user && <Lock className="w-3 h-3 text-slate-500" aria-hidden="true" \/>/);
  for (const message of [
    'Replay (available after registration)',
    'Воспроизведение (доступно после регистрации)',
    'Odtwarzanie (dostępne po rejestracji)',
    'Sign in to your account to open Replay.',
  ]) {
    assert.ok(phrases.includes(message), 'missing translated access text: ' + message);
  }
});
