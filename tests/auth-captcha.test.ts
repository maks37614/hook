import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Request } from 'express';
import express from 'express';
import { AuthFailure } from '../server/pgIdentity';
import { captchaConfig, verifyAuthCaptcha } from '../server/authCaptcha';
import { installPostgresIdentityRoutes, rateLimit } from '../server/pgIdentityRoutes';

const variables = ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'PUBLIC_BASE_URL', 'NODE_ENV'] as const;
function withCaptchaEnvironment(t: { after: (fn: () => void) => void }, values: Record<string, string>) {
  const original = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const key of variables) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}
const request = (captchaToken?: unknown) => ({
  body: { captchaToken }, ip: '127.0.0.1',
}) as Request;

test('Turnstile config remains public while missing keys fail closed, including direct API calls', async t => {
  withCaptchaEnvironment(t, { TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '', PUBLIC_BASE_URL: 'https://h00k.top' });
  assert.deepEqual(captchaConfig(), { provider: 'turnstile', required: true, configured: false, siteKey: null });
  await assert.rejects(verifyAuthCaptcha(request('some-token')), (error: unknown) =>
    error instanceof AuthFailure && error.status === 503 && error.code === 'CAPTCHA_NOT_CONFIGURED');
  const app = express();
  app.use(express.json());
  installPostgresIdentityRoutes(app);
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())));
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const configResponse = await fetch(origin + '/api/auth/config');
  assert.equal(configResponse.status, 200);
  const publicConfig = await configResponse.json();
  assert.equal(publicConfig.backend, 'postgres');
  assert.equal(publicConfig.captcha.siteKey, null);
  assert.equal(JSON.stringify(publicConfig).includes('secret'), false, 'never expose the server secret');

  // Express is case-insensitive and ignores trailing slashes by default.
  // All equivalent protected URLs MUST pass through the same CAPTCHA gate.
  const protectedUrls = [
    '/api/auth/register', '/api/auth/REGISTER', '/api/auth/register/',
    '/api/auth/login', '/api/auth/Login', '/api/auth/login/',
    '/api/auth/forgot-password', '/api/auth/Forgot-Password/',
    '/api/auth/resend-verification', '/api/auth/Resend-Verification/',
  ];
  for (const route of protectedUrls) {
    const response = await fetch(origin + route, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'blocked@example.invalid', password: 'strong-password-123' }),
    });
    assert.equal(response.status, 503, route);
    assert.equal(response.headers.get('cache-control'), 'no-store',
      'even CAPTCHA-denied auth responses must not be cached');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await response.json()).code, 'CAPTCHA_NOT_CONFIGURED', route);
  }
});

test('Turnstile rejects test credentials in production, missing and oversized CAPTCHA tokens', async t => {
  withCaptchaEnvironment(t, {
    PUBLIC_BASE_URL: 'https://h00k.top',
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    NODE_ENV: 'production',
  });
  assert.equal(captchaConfig().configured, false, 'Cloudflare public testing credentials cannot be used in production');
  process.env.NODE_ENV = 'test';
  process.env.TURNSTILE_SITE_KEY = 'unit-test-site';
  process.env.TURNSTILE_SECRET_KEY = 'unit-test-secret';
  for (const token of [null, '', 7, 'x'.repeat(2049)]) {
    await assert.rejects(verifyAuthCaptcha(request(token)), (error: unknown) =>
      error instanceof AuthFailure && error.code === 'CAPTCHA_REQUIRED');
  }
});

test('Turnstile Siteverify binds success to action, hostname, unique token and optional client IP', async t => {
  withCaptchaEnvironment(t, {
    NODE_ENV: 'test', PUBLIC_BASE_URL: 'https://h00k.top',
    TURNSTILE_SITE_KEY: 'unit-test-site', TURNSTILE_SECRET_KEY: 'unit-test-secret',
  });
  const originalFetch = globalThis.fetch;
  const spent = new Set<string>();
  let hostname = 'h00k.top';
  let action = 'h00k_auth';
  let status = 200;
  let offline = false;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    if (String(args[0]) !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return originalFetch(...args);
    }
    calls++;
    if (offline) throw new Error('No connection');
    const body = new URLSearchParams(String(args[1]?.body || ''));
    assert.equal(body.get('secret'), 'unit-test-secret');
    assert.equal(body.get('remoteip'), '127.0.0.1');
    const token = body.get('response') || '';
    const success = ['single-use-demo', 'wrong-host', 'wrong-action'].includes(token) && !spent.has(token);
    if (success) spent.add(token);
    return new Response(JSON.stringify({ success, hostname, action }), { status });
  });

  await verifyAuthCaptcha(request('single-use-demo'));
  await assert.rejects(verifyAuthCaptcha(request('single-use-demo')), (error: unknown) =>
    error instanceof AuthFailure && error.code === 'CAPTCHA_FAILED', 'spent tokens must not pass');
  hostname = 'evil.example';
  await assert.rejects(verifyAuthCaptcha(request('wrong-host')), (error: unknown) =>
    error instanceof AuthFailure && error.code === 'CAPTCHA_FAILED');
  action = 'other_form';
  hostname = 'h00k.top';
  await assert.rejects(verifyAuthCaptcha(request('wrong-action')), (error: unknown) =>
    error instanceof AuthFailure && error.code === 'CAPTCHA_FAILED');
  status = 502;
  await assert.rejects(verifyAuthCaptcha(request('gateway-error')), (error: unknown) =>
    error instanceof AuthFailure && error.code === 'CAPTCHA_UNAVAILABLE');
  offline = true;
  await assert.rejects(verifyAuthCaptcha(request('timeout')), (error: unknown) =>
    error instanceof AuthFailure && error.code === 'CAPTCHA_UNAVAILABLE');
  assert.equal(calls, 6);
});


test('unverified CAPTCHA attempts cannot consume an email-address abuse budget', () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const req = { ip: '198.51.100.12-' + unique, body: { email: unique + '@example.invalid' } } as Request;
  for (let i = 0; i < 10; i++) {
    rateLimit(req, 'captcha-preflight', 60, 5 * 60 * 1000, false);
  }
  assert.doesNotThrow(() => rateLimit(req, 'signup', 1, 60 * 60 * 1000));
  assert.throws(() => rateLimit(req, 'signup', 1, 60 * 60 * 1000),
    (error: unknown) => error instanceof AuthFailure && error.code === 'RATE_LIMITED');
});
