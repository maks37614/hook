import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import nodemailer from 'nodemailer';
import { installPostgresIdentityRoutes } from '../server/pgIdentityRoutes';
import { identityPool, COOKIE_NAME, processAuthMailJobs, sendReset } from '../server/pgIdentity';

type CapturedMail = { from: string; to: string; subject: string; text: string };
function tokenFrom(message: CapturedMail, param: 'verifyEmail' | 'resetPassword'): string {
  const match = message.text.match(/https:\/\/[^\s]+/);
  assert.ok(match, 'email contains an absolute HTTPS action link');
  const url = new URL(match[0]);
  assert.equal(url.origin, 'https://h00k.top');
  const token = url.searchParams.get(param);
  assert.match(token || '', /^[A-Za-z0-9_-]{40,80}$/);
  return token!;
}

test('real PostgreSQL and captured SMTP: register, verify, login, recover, resend and revoke', {
  skip: process.env.H00K_PG_INTEGRATION_TEST !== '1',
}, async t => {
  const old = {
    host: process.env.SMTP_HOST,
    from: process.env.SMTP_FROM,
    port: process.env.SMTP_PORT,
    base: process.env.PUBLIC_BASE_URL,
    captchaSite: process.env.TURNSTILE_SITE_KEY,
    captchaSecret: process.env.TURNSTILE_SECRET_KEY,
  };
  const id1 = randomUUID(), id2 = randomUUID();
  const email = 'auth-mail-' + id1 + '@example.invalid';
  const email2 = 'auth-resend-' + id2 + '@example.invalid';
  let mailFails = false;
  let beforeMailDelivery: ((item: CapturedMail) => Promise<void>) | null = null;
  const mail: CapturedMail[] = [];

  // Replace only the transport, not the auth or SQL logic. Never send external mail in CI.
  t.mock.method(nodemailer, 'createTransport', () => ({
    async sendMail(item: CapturedMail) {
      // Simulate a password reset, verification or worker takeover mid-SMTP.
      const hook = beforeMailDelivery;
      beforeMailDelivery = null;
      if (hook) await hook(item);
      if (mailFails) throw new Error('Simulated SMTP transport outage');
      mail.push(item);
      return { accepted: [item.to] };
    },
  }));
  // Test the real HTTP routes without contacting the external Turnstile API.
  const nativeFetch = globalThis.fetch;
  const validatedTokens = new Set<string>();
  t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    if (String(args[0]) !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return nativeFetch(...args);
    }
    const body = new URLSearchParams(String(args[1]?.body || ''));
    const token = body.get('response') || '';
    const valid = body.get('secret') === 'unit-test-captcha-secret' &&
      token.startsWith('valid-' + id1) && !validatedTokens.has(token);
    if (valid) validatedTokens.add(token);
    return new Response(JSON.stringify({
      success: valid, hostname: 'h00k.top', action: 'h00k_auth',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  let server: Server | undefined;
  let db: ReturnType<typeof identityPool> | undefined;
  try {
    process.env.SMTP_HOST = '';
    process.env.SMTP_FROM = '';
    process.env.PUBLIC_BASE_URL = 'https://h00k.top';
    process.env.SMTP_PORT = '587';
    process.env.TURNSTILE_SITE_KEY = 'unit-test-captcha-site';
    process.env.TURNSTILE_SECRET_KEY = 'unit-test-captcha-secret';

    const app = express();
    app.use(express.json());
    installPostgresIdentityRoutes(app);
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const protectedRoutes = new Set(['/api/auth/register', '/api/auth/login',
      '/api/auth/forgot-password', '/api/auth/resend-verification']);
    const post = (route: string, data: unknown, credentials?: { cookie: string; csrf: string }) => fetch(origin + route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(credentials ? { Cookie: credentials.cookie, 'X-CSRF-Token': credentials.csrf } : {}),
      },
      body: JSON.stringify(protectedRoutes.has(route)
        ? { ...(data as Record<string, unknown>), captchaToken: 'valid-' + id1 + '-' + randomUUID() }
        : data),
    });
    db = identityPool();

    const noMail = await post('/api/auth/register', { email, password: 'strong-password-with-12-chars' });
    assert.equal(noMail.status, 503);
    assert.equal((await noMail.json()).code, 'MAIL_NOT_CONFIGURED');
    const noAccount = await db.query('SELECT id FROM auth_users WHERE email = $1', [email]);
    assert.equal(noAccount.rows.length, 0, 'do not create accounts with no configured mail sender');

    process.env.SMTP_HOST = 'smtp.example.invalid';
    process.env.SMTP_FROM = 'h00k <auth@example.invalid>';
    const register = await post('/api/auth/register', {
      email, password: 'strong-password-with-12-chars', displayName: 'New Trader',
    });
    assert.equal(register.status, 202, await register.text());
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, email);
    assert.match(mail[0].subject, /підтвердження/);
    const duplicate = await post('/api/auth/register', {
      email, password: 'some-other-12-char-password',
    });
    assert.equal(duplicate.status, 202, 'registration must not expose whether an email exists');
    assert.equal((await duplicate.json()).success, true);
    assert.equal(mail.length, 1, 'a duplicate registration must not send an additional mail');
    const verifyToken = tokenFrom(mail[0], 'verifyEmail');

    const beforeVerification = await post('/api/auth/login', {
      email, password: 'strong-password-with-12-chars',
    });
    assert.equal(beforeVerification.status, 403);
    assert.equal((await beforeVerification.json()).code, 'EMAIL_UNVERIFIED');

    const verify = await post('/api/auth/verify-email', { token: verifyToken });
    const verifyBody = await verify.json();
    assert.equal(verify.status, 200, JSON.stringify(verifyBody));
    assert.equal(verifyBody.user.emailVerified, true);
    const verifyAgain = await post('/api/auth/verify-email', { token: verifyToken });
    assert.equal(verifyAgain.status, 400, 'email action links are one-use');

    const login = await post('/api/auth/login', {
      email, password: 'strong-password-with-12-chars', remember: true,
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie || '', new RegExp('^' + COOKIE_NAME + '='));
    const body = await login.json();
    assert.equal(body.profile.displayName, 'New Trader');
    const credentials = { cookie: cookie!, csrf: String(body.csrf) };
    const session = await fetch(origin + '/api/auth/session', { headers: { Cookie: cookie! } });
    assert.equal(session.status, 200, 'session survives a page reload');
    assert.equal((await session.json()).user.email, email);

    const unknown = await post('/api/auth/forgot-password', { email: 'nobody@example.invalid' });
    assert.equal(unknown.status, 200, 'password reset does not reveal non-existent emails');
    assert.equal((await processAuthMailJobs()).processed, 0, 'unknown accounts have no mail job');
    assert.equal(mail.length, 1, 'unknown emails produce no outgoing message');
    const forgot = await post('/api/auth/forgot-password', { email });
    assert.equal(forgot.status, 200);
    assert.deepEqual(await forgot.json(), await unknown.json(),
      'registered and unknown recovery requests must return the same public response');
    assert.equal(mail.length, 1, 'a public recovery request must not wait for SMTP');
    await sendReset(email); // A concurrent request must reuse the pending queue job.
    const pending = await db.query(`
      SELECT count(*)::int AS count FROM auth_mail_outbox
      WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
        AND purpose = 'reset-password' AND completed_at IS NULL
    `, [email]);
    assert.equal(pending.rows[0].count, 1, 'one pending queue job per account/purpose');
    assert.deepEqual(await processAuthMailJobs(), { processed: 1, delivered: 1 });
    assert.equal(mail.length, 2);
    assert.match(mail[1].subject, /пароля/);
    const resetToken = tokenFrom(mail[1], 'resetPassword');

    // A duplicate scheduled request inside the 60-second mailbox cooldown
    // must not enqueue another mail (without burning a production HTTP quota).
    await sendReset(email);
    assert.equal((await processAuthMailJobs()).processed, 0);
    await db.query(`
      UPDATE auth_mail_outbox SET completed_at = now() - interval '2 minutes'
      WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
        AND purpose = 'reset-password' AND completed_at IS NOT NULL
    `, [email]);

    // Simulate background SMTP failure: HTTP must still return the same
    // status/body, and the previously delivered reset link remains usable.
    mailFails = true;
    const failedResetMail = await post('/api/auth/forgot-password', { email });
    const failedBody = await failedResetMail.json();
    assert.deepEqual(await processAuthMailJobs(), { processed: 1, delivered: 0 });
    assert.equal(failedResetMail.status, 200,
      'a failing SMTP transport must not reveal a registered recovery email');
    const unknownDuringOutage = await post('/api/auth/forgot-password', { email: 'unknown-' + id1 + '@example.invalid' });
    assert.equal(unknownDuringOutage.status, 200);
    assert.deepEqual(await unknownDuringOutage.json(), failedBody,
      'SMTP failures must not distinguish registered and unknown email addresses');
    mailFails = false;

    const invalidReset = await post('/api/auth/reset-password', {
      token: 'not-a-token', password: 'new-password-with-12-chars',
    });
    assert.equal(invalidReset.status, 400);
    const reset = await post('/api/auth/reset-password', {
      token: resetToken, password: 'new-password-with-12-chars',
    });
    assert.equal(reset.status, 200, await reset.text());
    assert.equal((await post('/api/auth/reset-password', {
      token: resetToken, password: 'another-password-with-12-chars',
    })).status, 400);
    assert.equal((await post('/api/auth/login', {
      email, password: 'strong-password-with-12-chars',
    })).status, 401, 'original password is invalidated');
    assert.equal((await post('/api/auth/login', {
      email, password: 'new-password-with-12-chars',
    })).status, 200);
    assert.equal((await fetch(origin + '/api/auth/session', {
      headers: { Cookie: credentials.cookie },
    })).status, 401, 'a password reset revokes remembered sessions');
    // The earlier retry belongs to the now-reset account. Retire it so this
    // test does not race against the separate verification-resend queue job.
    await db.query(`
      UPDATE auth_mail_outbox SET completed_at = now()
      WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
        AND purpose = 'reset-password' AND completed_at IS NULL
    `, [email]);

    // If registration email delivery failed, the user can resend without losing the account.
    mailFails = true;
    const failedRegistration = await post('/api/auth/register', {
      email: email2, password: 'fresh-registration-12-chars',
    });
    assert.equal(failedRegistration.status, 503);
    assert.equal((await failedRegistration.json()).code, 'MAIL_DELIVERY_FAILED');
    mailFails = false;
    mailFails = true;
    const failedResend = await post('/api/auth/resend-verification', { email: email2 });
    const unknownResend = await post('/api/auth/resend-verification', { email: 'unknown-resend-' + id2 + '@example.invalid' });
    assert.equal(failedResend.status, 200);
    assert.equal(unknownResend.status, 200);
    assert.deepEqual(await failedResend.json(), await unknownResend.json(),
      'verification resend must not reveal which emails are registered when SMTP fails');
    assert.deepEqual(await processAuthMailJobs(), { processed: 1, delivered: 0 });
    mailFails = false;
    // The pending queue row is durable and retryable after a crash. Advance its
    // retry date instead of creating duplicate requests/tokens.
    await db.query(`
      UPDATE auth_mail_outbox SET available_at = now(), claimed_until = NULL
      WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
        AND purpose = 'verify-email' AND completed_at IS NULL
    `, [email2]);
    assert.deepEqual(await processAuthMailJobs(), { processed: 1, delivered: 1 });
    const lastMail = mail[mail.length - 1];
    assert.equal(lastMail.to, email2);
    const verifyAfterRetry = await post('/api/auth/verify-email', {
      token: tokenFrom(lastMail, 'verifyEmail'),
    });
    assert.equal(verifyAfterRetry.status, 200, 'SMTP failure does not strand a new account');

    // Regression: if a user completes account recovery while a worker is
    // sending email, the stale worker must not resurrect the canceled queue
    // item after SMTP returns an error.
    const reopenRecovery = async () => {
      await db!.query(`
        UPDATE auth_mail_outbox SET completed_at = now() - interval '2 minutes'
        WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
          AND purpose = 'reset-password' AND completed_at IS NOT NULL
      `, [email]);
      await sendReset(email);
    };
    await reopenRecovery();
    mailFails = true;
    beforeMailDelivery = async () => {
      await db!.query(`
        UPDATE auth_mail_outbox SET completed_at = now(), claimed_until = NULL
        WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
          AND purpose = 'reset-password' AND completed_at IS NULL
      `, [email]);
    };
    assert.deepEqual(await processAuthMailJobs(), { processed: 1, delivered: 0 });
    const canceled = await db.query(`
      SELECT count(*)::int AS count FROM auth_mail_outbox
      WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
        AND purpose = 'reset-password' AND completed_at IS NULL
    `, [email]);
    assert.equal(canceled.rows[0].count, 0, 'failed SMTP must never reopen canceled recovery jobs');

    // Regression: if an expired claim was taken over by another worker,
    // stale success/failure handlers must not mutate the new worker's claim.
    await reopenRecovery();
    beforeMailDelivery = async () => {
      await db!.query(`
        UPDATE auth_mail_outbox SET attempts = attempts + 1,
          claimed_until = now() + interval '60 seconds'
        WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
          AND purpose = 'reset-password' AND completed_at IS NULL
      `, [email]);
    };
    assert.deepEqual(await processAuthMailJobs(), { processed: 1, delivered: 0 });
    const reclaimed = await db.query(`
      SELECT attempts, claimed_until, completed_at FROM auth_mail_outbox
      WHERE user_id = (SELECT id FROM auth_users WHERE email = $1)
        AND purpose = 'reset-password' AND completed_at IS NULL
    `, [email]);
    assert.equal(reclaimed.rows.length, 1);
    assert.equal(reclaimed.rows[0].attempts, 2, 'new claim attempt must not be overwritten');
    assert.ok(reclaimed.rows[0].claimed_until, 'stale worker must not release the newer claim');
    mailFails = false;
  } finally {
    if (server) await new Promise<void>((resolve, reject) =>
      server!.close(error => error ? reject(error) : resolve()));
    if (db) {
      await db.query('DELETE FROM auth_users WHERE email = ANY($1::text[])', [[email, email2]]);
      await db.end();
    }
    for (const [name, value] of Object.entries({
      SMTP_HOST: old.host,
      SMTP_FROM: old.from,
      SMTP_PORT: old.port,
      PUBLIC_BASE_URL: old.base,
      TURNSTILE_SITE_KEY: old.captchaSite,
      TURNSTILE_SECRET_KEY: old.captchaSecret,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
