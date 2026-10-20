import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'hook2-reset-'));
process.env.DATA_DIR = directory;
after(() => rmSync(directory, { recursive: true, force: true }));
const {
  authenticateLocal,
  createLocalPasswordReset,
  confirmLocalPasswordReset,
  revokeLocalPasswordReset,
  hasLocalEmailAccount,
  verifyUserToken,
} = await import('../server/authService');

test('password reset: secure token, new password, revoked old sessions and single use', async () => {
  {
    const account = await authenticateLocal('reset-example@unit.test', 'BeforePassword123!', true, 'Test');
    assert.equal(hasLocalEmailAccount('RESET-EXAMPLE@unit.test'), true);
    assert.equal(createLocalPasswordReset('not-existing@unit.test'), null);
    const token = createLocalPasswordReset('reset-example@unit.test');
    const secondEmailToken = createLocalPasswordReset('reset-example@unit.test');
    assert.notEqual(secondEmailToken, token, 'reset requests use independent tokens');
    assert.match(token!, /^[A-Za-z0-9_-]{43}$/);
    const disk = readFileSync(path.join(directory, 'accounts.json'), 'utf8');
    assert.ok(!disk.includes(token!), 'the email reset bearer token must not be stored in plaintext');
    await confirmLocalPasswordReset(token!, 'NewStrongPassword456!');
    await assert.rejects(confirmLocalPasswordReset(secondEmailToken!, 'AnotherPassword234!'), /недійсне/);
    await assert.rejects(verifyUserToken(account.accessToken), /Session expired/);
    await assert.rejects(authenticateLocal('reset-example@unit.test', 'BeforePassword123!'), /Невірний/);
    await assert.rejects(confirmLocalPasswordReset(token!, 'AnotherPassword234!'), /недійсне/);
    const freshLogin = await authenticateLocal('reset-example@unit.test', 'NewStrongPassword456!');
    assert.equal(freshLogin.user.uid, account.user.uid);
  }
});

test('password reset: invalid and revoked links rejected', async () => {
  await assert.rejects(confirmLocalPasswordReset('invalid', 'validPassword123'), /недійсне/);
  assert.equal(createLocalPasswordReset('missing@unit.test'), null);
  const token = createLocalPasswordReset('reset-example@unit.test');
  // Revocation should make a link unusable even if it has never been opened.
  if (token) {
    revokeLocalPasswordReset(token);
    await assert.rejects(confirmLocalPasswordReset(token, 'ChangePassword789!'), /недійсне/);
  }
});
