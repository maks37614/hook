// Exercise production registration without trial periods or activation codes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const root = process.cwd();
const directory = fs.mkdtempSync(path.join(root, '.test-access-browser-'));
const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATA_DIR: directory, PORT: String(port), NODE_ENV: 'production', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' };
let server, browser, output = '';
const errors = [];
async function start() {
  server = spawn(process.execPath, ['--import', path.join(root, 'tests/fixtures/offline-network.mjs'), '--import', 'tsx', '--import', path.join(root, 'tests/fixtures/mock-exchange.ts'), 'server.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { output = (output + data).slice(-8000); });
  server.stderr.on('data', data => { output = (output + data).slice(-8000); });
  for (let n = 0; n < 160; n++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(output);
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit'); server.kill();
    const timer = setTimeout(() => server.kill('SIGKILL'), 7000);
    await exited; clearTimeout(timer);
  }
}
async function newPage(width = 1100) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', value => errors.push(value.message));
  return page;
}
async function register(page, name) {
  await page.getByLabel('Ім’я', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel('Пароль', { exact: true }).fill('browser-password-123');
  await page.getByRole('button', { name: 'Зареєструватися', exact: true }).click();
  await page.locator('.app-header').waitFor({ state: 'attached', timeout: 20000 });
  const result = await page.evaluate(async () => (await (await fetch('/api/access/status')).json()).access);
  assert.equal(result.status, 'free');
  assert.equal(result.hasFullAccess, true);
  assert.equal(result.fullAccessUntil, null);
  assert.equal(await page.locator('[data-testid="profile-access"]').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Активувати код', exact: true }).count(), 0);
  return result.userId;
}
async function openProfile(page) {
  // Terminal is an intentional fullscreen workspace above the site header.
  const closeTerminal = page.getByRole('button', { name: 'Закрити термінал', exact: true });
  if (await closeTerminal.isVisible()) await closeTerminal.click();
  await page.locator('#user-profile-btn').click();
  const profile = page.getByRole('dialog', { name: 'Профіль користувача', exact: true });
  await profile.waitFor();
  return profile;
}
try {
  await start();
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  const alice = await newPage(); await alice.goto(base + '/#terminal');
  await alice.getByRole('heading', { name: 'Створити акаунт' }).waitFor();
  assert.equal(await alice.getByRole('banner').count(), 0, 'Guests cannot mount app pages');
  assert.equal(await alice.locator('input[name="inviteCode"], input[placeholder="HOOK-…"]').count(), 0);
  assert.equal(await alice.getByRole('button', { name: 'Закрити', exact: true }).count(), 0);
  await register(alice, 'alice');
  const aliceProfile = await openProfile(alice);
  assert.equal(await aliceProfile.locator('[data-testid="profile-access"]').count(), 0, 'Access panel must not appear');
  assert.equal(await aliceProfile.getByText('Доступ', { exact: true }).count(), 0, 'Profile access block removed');
  await aliceProfile.getByRole('button', { name: 'Закрити профіль' }).click();

  // Loading the production bundle installs auth after imported market modules.
  // A captured native fetch used to send this screener request without a token.
  const quoteResponse = alice.waitForResponse(response => new URL(response.url()).pathname === '/api/market/quotes');
  await alice.goto(base + '/?fixture=screener#screener');
  const quotes = await quoteResponse;
  assert.match(quotes.request().headers().authorization || '', /^Bearer local\./);
  assert.equal(quotes.status(), 200, 'a registered account must load the screener without an anonymous request');
  assert.ok((await quotes.json()).data.length > 0);
  await alice.locator('table tbody tr').first().waitFor();
  assert.equal(await alice.getByText('Увійдіть у свій обліковий запис', { exact: true }).count(), 0);

  const bob = await newPage(390); await bob.goto(base + '/#replay');
  await bob.getByRole('heading', { name: 'Створити акаунт' }).waitFor();
  await register(bob, 'bob');
  const mobileProfile = await openProfile(bob);
  assert.equal(await mobileProfile.locator('[data-testid="profile-access"]').count(), 0);
  assert.ok(await mobileProfile.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Mobile profile fits');
  await mobileProfile.getByRole('button', { name: 'Закрити профіль' }).click();
  await bob.getByRole('button', { name: /Термінал/ }).first().click();
  await bob.waitForURL('**/#terminal');

  // Restart with legacy expired entitlement fields and ensure neither the backend
  // nor the browser sends the user back to the old activation dialog.
  await stop();
  const file = path.join(directory, 'access.json'), state = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const member of Object.values(state.members)) {
    member.trialEndsAt = Date.now() - 5000;
    member.paidUntil = Date.now() - 5000;
  }
  fs.writeFileSync(file, JSON.stringify(state));
  await start();
  await bob.reload();
  await bob.locator('.app-header').waitFor({ timeout: 20000 });
  const current = await bob.evaluate(async () => (await (await fetch('/api/access/status')).json()).access);
  assert.equal(current.status, 'free');
  assert.equal(current.hasFullAccess, true);
  assert.equal(await bob.getByRole('heading', { name: 'Повний доступ', exact: true }).count(), 0);
  assert.equal(await bob.locator('[data-testid="profile-access"]').count(), 0);
  await bob.locator('.terminal-workspace').waitFor();
  await bob.waitForURL('**/#terminal');
  assert.ok(await bob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile layout fits viewport');
  assert.deepEqual(errors, [], 'No runtime errors in registration or returning account');
  console.log('PASS: production Chrome registration needs no code, grants permanent access, profile has no access block and expired legacy records remain unlocked.');
} catch (error) {
  const artifact = path.join(root, 'test-artifacts'); fs.mkdirSync(artifact, { recursive: true });
  try { await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: path.join(artifact, 'access-failure.png'), fullPage: true, timeout: 5000 }); } catch {}
  throw error;
} finally {
  await browser?.close();
  await stop();
  fs.rmSync(directory, { recursive: true, force: true });
}
