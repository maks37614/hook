import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateEmail, validatePassword, hashPassword, checkPassword,
  csrfForSession, cookieToken, COOKIE_NAME,
} from '../server/pgIdentity';

test('PostgreSQL identity rejects malformed emails and short passwords', () => {
  assert.equal(validateEmail('  Alice@Example.Com  '), 'alice@example.com');
  for (const value of ['', 'alice', 'a@', '@example.com']) {
    assert.throws(() => validateEmail(value));
  }
  assert.equal(validatePassword('correct-horse-battery'), 'correct-horse-battery');
  for (const value of ['', '123456', 'abcdefghijk', null]) {
    assert.throws(() => validatePassword(value));
  }
});

test('registration password scrypt hashes are salted, verified and never equal plaintext', async () => {
  const password = 'unique-correct-horse-battery';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt\$32768\$/);
  assert.notEqual(first, second);
  assert.equal(await checkPassword(password, first), true);
  assert.equal(await checkPassword(password + '!', first), false);
  assert.equal(await checkPassword(password, 'scrypt$32768$invalid$invalid'), false);
});

test('cookie parsing is exact, and request proof is bound to an opaque session secret', () => {
  const token = 'a'.repeat(43);
  const req = { get(key: string) { return key === 'Cookie' ? 'other=foo; ' + COOKIE_NAME + '=' + token + '; x=bar' : undefined; } };
  assert.equal(cookieToken(req as any), token);
  assert.notEqual(csrfForSession('A'), csrfForSession('B'));
  assert.equal(csrfForSession('A'), csrfForSession('A'));
  assert.equal(cookieToken({ get: () => COOKIE_NAME + '=bad' } as any), null);
});

test('account schema isolates user archives and sessions', () => {
  const schema = readFileSync(new URL('../server/migrations/001_identity.sql', import.meta.url), 'utf8');
  assert.match(schema, /id TEXT PRIMARY KEY/);
  assert.match(schema, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(schema, /PRIMARY KEY \(user_id, id\)/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS auth_archives_recent_idx/);
});


test('new account bootstrap never destroys legacy browser accounts before migration', () => {
  const source = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage\.removeItem\(['"]signalhook_local_accounts/);
  assert.doesNotMatch(source, /localStorage\.removeItem\(['"]signalhook_local_session/);
  assert.doesNotMatch(source, /localStorage\.removeItem\(['"]signalhook_tg_token/);
});
