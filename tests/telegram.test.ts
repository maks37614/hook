import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fixture = fs.mkdtempSync(path.join(root, '.test-telegram-'));
process.chdir(fixture);
process.env.TELEGRAM_BOT_TOKEN = '999:global-fixture';
fs.mkdirSync('server/data', { recursive: true });
fs.writeFileSync('server/data/user_telegram.json', JSON.stringify({ legacy: { botToken: '777:old', chatId: '7777' } }));
const telegram = await import('../server/telegramService');
const delivery = await import('../server/telegramDelivery');
const users = await import('../server/userTelegram');
const links = await import('../server/telegramLinkService');
const alerts = await import('../server/alertService');
const sitePreferences = await import('../server/siteNotificationPrefs');
const { formatTelegramMessages, telegramPlainText } = await import('../server/telegramFormat');
const { locales, telegramText } = await import('../src/locales');
const originalFetch = globalThis.fetch;
test.beforeEach(() => { process.env.TELEGRAM_BOT_TOKEN = '999:global-fixture'; delete process.env.TELEGRAM_CHAT_ID; });
test.afterEach(() => { globalThis.fetch = originalFetch; });
test.after(() => { process.chdir(root); fs.rmSync(fixture, { recursive: true, force: true }); });
let sequence = 100;
const success = (chatId = '101') => Response.json({ ok: true, result: { message_id: ++sequence, chat: { id: chatId } } });
const connectUser = (userId: string, chatId: string, language: 'uk' | 'en' | 'pl' | 'ru' = 'uk') => {
  const bot = users.getSharedTelegramBot();
  assert.ok(bot);
  users.connectUserTelegram(userId, bot.botId, chatId, language);
};

test('the shared bot sends only to each linked users own chat', async () => {
  process.env.TELEGRAM_CHAT_ID = '9999';
  let requests = 0;
  const sent: Array<{ url: string; chatId: string }> = [];
  globalThis.fetch = async (input, options) => {
    requests++;
    const body = JSON.parse(options!.body as string);
    sent.push({ url: String(input), chatId: String(body.chat_id) });
    return success(body.chat_id);
  };
  assert.equal((await telegram.sendTelegramMessage('Fixture')).success, false);
  assert.equal((await telegram.sendTelegramMessage('Fixture', { botToken: '101:alice' })).success, false);
  assert.equal((await delivery.sendUserTelegramMessage('unconfigured', 'Fixture')).success, false);
  assert.equal(requests, 0);

  connectUser('alice', '1001');
  connectUser('bob', '2002');
  assert.equal((await delivery.sendUserTelegramMessage('alice', 'Alice')).success, true);
  assert.equal((await delivery.sendUserTelegramMessage('bob', 'Bob')).success, true);
  assert.equal(sent.length, 2);
  assert.ok(sent.every(item => item.url.endsWith('/sendMessage') && item.url.includes('/bot999:global-fixture/')));
  assert.deepEqual(new Set(sent.map(item => item.chatId)), new Set(['1001', '2002']));

  users.disconnectUserTelegram('alice');
  assert.equal(users.getUserTelegram('alice')?.chatId, undefined);
  assert.equal(users.getUserTelegram('bob')?.chatId, '2002');
  assert.equal((await delivery.sendUserTelegramMessage('alice', 'Fixture')).success, false);
});

test('legacy destinations require explicit confirmation and language sync cannot confirm them', async () => {
  let sends = 0;
  globalThis.fetch = async () => { sends++; return success(); };
  users.saveUserTelegram('legacy', { language: 'uk' });
  const blocked = await delivery.sendUserTelegramMessage('legacy', 'Fixture');
  assert.equal(blocked.success, false);
  assert.match(blocked.error!, /Підключіть/);
  assert.equal(sends, 0);
  connectUser('legacy', '7777');
  assert.ok(users.getUserTelegram('legacy')?.confirmedAt);
});

test('two users with the same alert ID receive only their own price alerts and history', async () => {
  connectUser('price-alice', '3001');
  connectUser('price-bob', '3002');
  for (const userId of ['price-alice', 'price-bob']) {
    sitePreferences.saveUserSiteNotificationSettings(userId,
      { optedIn: true, enabled: true, price: true, telegramEnabled: true });
  }
  alerts.saveAlerts([]);
  for (const userId of ['price-alice', 'price-bob']) alerts.createAlert({ id: 'same-id', userId, symbol: 'BTCUSDT',
    exchange: 'binance', marketType: 'futures', targetPrice: 100, condition: 'gte', note: `${userId}: <keep & safe>`,
    telegramBotToken: '666:stale-other-user', telegramChatId: '6666' });
  const sent: Array<{ url: string; body: any }> = [];
  globalThis.fetch = async (input, options) => {
    if (!String(input).includes('api.telegram.org')) return Response.json({ price: '120' });
    const body = JSON.parse(options!.body as string);
    sent.push({ url: String(input), body });
    return success(body.chat_id);
  };
  await Promise.all([alerts.checkAlertsOnce(), alerts.checkAlertsOnce()]);
  assert.equal(sent.length, 2);
  const byChat = new Map(sent.map(item => [String(item.body.chat_id), item]));
  assert.match(byChat.get('3001')!.url, /bot999:global-fixture\/sendMessage$/);
  assert.match(byChat.get('3002')!.url, /bot999:global-fixture\/sendMessage$/);
  for (const userId of ['price-alice', 'price-bob']) {
    const history = alerts.getAlertHistory(userId);
    assert.equal(history.length, 1);
    assert.equal(history[0].userId, userId);
    assert.equal(history[0].telegramSent, true);
    assert.equal(history[0].telegramMessageIds?.length, 1);
  }
  assert.match(sent[0].body.text, /<pre>/);
  assert.ok(!sent[0].body.text.includes('\\n'));
  assert.match(sent[0].body.text, /&lt;keep/);
  assert.match(sent[0].body.text, /&amp;/);
  assert.match(sent[0].body.text, /safe&gt;/);
  assert.ok(!sent[0].body.text.includes('<keep'));
  assert.ok(!sent[0].body.text.includes('price-alice'));
});

test('a stale sync cannot reconnect a disabled Telegram configuration or import another user alert', () => {
  users.disconnectUserTelegram('disabled');
  alerts.syncUserAlerts('disabled', [{ id: 'nested-other-owner', userId: 'price-bob' } as any], '101:stale', '1001');
  assert.equal(users.getUserTelegram('disabled')?.botToken, undefined);
  assert.equal(alerts.getAllAlerts('disabled').length, 0);
  assert.equal(alerts.getAllAlerts('price-bob').length, 1);
});

test('rotating the shared bot requires users to confirm their chat again', () => {
  connectUser('changed-bot', '1234');
  process.env.TELEGRAM_BOT_TOKEN = '222:second';
  assert.equal(users.getUserTelegram('changed-bot')?.chatId, undefined);
  assert.equal(users.getUserTelegram('changed-bot')?.needsConfirmation, true);
  connectUser('changed-bot', '1234');
  assert.equal(users.getUserTelegram('changed-bot')?.chatId, '1234');
  assert.equal(fs.statSync('server/data/user_telegram.json').mode & 0o777, 0o600);
});

test('blocked chats fail permanently instead of retrying into another destination', async () => {
  connectUser('blocked-user', '9009');
  globalThis.fetch = async () => Response.json({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, { status: 403 });
  const result = await delivery.sendUserTelegramMessage('blocked-user', 'Fixture\nPrice: 1');
  assert.equal(result.queued, false);
  assert.equal(delivery.getTelegramDelivery('blocked-user', result.deliveryId!)?.status, 'failed');
  assert.match(result.error!, /вимкнені/);
});

test('connection tests send only to their explicit destination and do not overwrite stored users', async () => {
  connectUser('test-owner', '1111');
  const sends: any[] = [];
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'fixture_bot' } });
    sends.push(JSON.parse(options!.body as string));
    return success('5555');
  };
  const result = await telegram.testTelegramConnection('555:test', '5555', 'pl');
  assert.equal(result.success, true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].chat_id, '5555');
  assert.equal(users.getUserTelegram('test-owner')?.chatId, '1111');
  assert.equal((await telegram.testTelegramConnection()).success, false);
});

test('temporary Telegram errors are retried for the same owner and recorded message IDs permit edits', async () => {
  connectUser('retry-user', '3003');
  const now = Date.now;
  const sent: any[] = [];
  globalThis.fetch = async (_input, options) => {
    sent.push(JSON.parse(options!.body as string));
    return Response.json({ ok: false, error_code: 429, parameters: { retry_after: 30 }, description: 'Too Many Requests' }, { status: 429 });
  };
  const queued = await delivery.sendUserTelegramMessage('retry-user', 'Test\nPrice: 123', 'retry-event');
  assert.equal(queued.queued, true);
  assert.equal((await delivery.sendUserTelegramMessage('retry-user', 'Test', 'retry-event')).deliveryId, queued.deliveryId);
  assert.equal(sent.length, 1);
  Date.now = () => now() + 31000;
  globalThis.fetch = async (_input, options) => { sent.push(JSON.parse(options!.body as string)); return success('3003'); };
  try { await delivery.retryPendingTelegramMessages(); } finally { Date.now = now; }
  const delivered = delivery.getTelegramDelivery('retry-user', queued.deliveryId!)!;
  assert.equal(delivered.status, 'sent');
  assert.equal(delivered.messageIds.length, 1);
  assert.ok(sent.every(body => body.chat_id === '3003'));
  assert.equal(delivery.getTelegramDelivery('another-user', queued.deliveryId!), undefined);
});

test('pending delivery is cancelled when its owner disconnects or changes the destination', async () => {
  connectUser('disconnect-user', '4004');
  globalThis.fetch = async () => Response.json({ ok: false, error_code: 500 }, { status: 500 });
  const queued = await delivery.sendUserTelegramMessage('disconnect-user', 'Test\nPrice: 1');
  connectUser('disconnect-user', '4005');
  const now = Date.now;
  let sends = 0;
  Date.now = () => now() + 60000;
  globalThis.fetch = async () => { sends++; return success(); };
  try { await delivery.retryPendingTelegramMessages(); } finally { Date.now = now; }
  assert.equal(sends, 0);
  assert.equal(delivery.getTelegramDelivery('disconnect-user', queued.deliveryId!)?.status, 'failed');
});

test('the shared bot matches each one-time START link to its account', async () => {
  process.env.TELEGRAM_BOT_TOKEN = '505:shared';
  const updates = ([
    ['link-alice', 1001], ['link-bob', 2002],
  ] as const);
  const codes = new Map<string, string>();
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'fixture_bot' } });
    if (String(input).endsWith('/getUpdates')) {
      const result: any[] = updates.map(([userId, id], index) => ({
        update_id: 10 + index,
        message: { date: Math.floor(Date.now() / 1000), text: `/start ${codes.get(userId)}`,
          chat: { type: 'private', id }, from: { id, first_name: `User ${id}`, username: `user${id}` } },
      }));
      result.push({
        update_id: 12, message: { date: Math.floor(Date.now() / 1000), text: '/start stranger',
          chat: { type: 'private', id: 9999 }, from: { id: 9999, first_name: 'Stranger', username: 'stranger' } },
      });
      return Response.json({ ok: true, result });
    }
    const body = JSON.parse(options!.body as string);
    return success(body.chat_id);
  };
  const alice = await links.beginSharedTelegramLink('link-alice', 'en');
  const bob = await links.beginSharedTelegramLink('link-bob', 'pl');
  assert.equal(alice.success, true);
  assert.equal(bob.success, true);
  codes.set('link-alice', new URL(alice.url!).searchParams.get('start')!);
  codes.set('link-bob', new URL(bob.url!).searchParams.get('start')!);
  await links.pollSharedTelegramUpdates(0);
  assert.equal(users.getUserTelegram('link-alice')?.chatId, '1001');
  assert.equal(users.getUserTelegram('link-bob')?.chatId, '2002');
  assert.equal(users.getUserTelegram('link-alice')?.botToken, '505:shared');
  assert.equal(users.getUserTelegram('unconfigured')?.chatId, undefined);
});

test('every localized notification template has real newlines and renders as bounded HTML tables', () => {
  const templates = ['priceAlertBody', 'cronTest', 'connectionTest', 'supportRetest', 'resistanceRetest', 'breakoutRetest',
    'formationSetup', 'thirdTouch', 'densityAppeared', 'densityPersistent', 'oiAnomaly', 'structureShift'];
  for (const language of ['uk', 'en', 'ru', 'pl'] as const) for (const key of templates) {
    const source = locales[language].telegram[key];
    assert.ok(source, `${language}:${key}`);
    const params = Object.fromEntries([...source.matchAll(/\{\{(\w+)\}\}/g)].map(match => [match[1], 'BTCUSDT < 10 & > 2']));
    const message = telegramText(language, key, params);
    assert.ok(message.includes('\n'), `${language}:${key}`);
    for (const part of formatTelegramMessages(message)) {
      assert.ok(part.length <= 4096, `${language}:${key} exceeded Telegram limit`);
      assert.match(part, /<pre>┌/);
      assert.ok(!part.includes('\\n'));
      assert.ok(!part.includes('{{'));
      assert.ok(!telegramPlainText(part).includes('<pre>'));
    }
  }
  const unicode = formatTelegramMessages('Test\nCoin: 币安人生\nComment: < & >')[0];
  assert.match(unicode, /币安人生/);
  assert.match(unicode, /&lt; &amp; &gt;/);
});

test('long notifications resume after the last successful part without resending it', async () => {
  connectUser('parts-user', '6006');
  const text = 'Long notification\n' + Array.from({ length: 140 }, (_, i) => `Field ${i}: ${'x'.repeat(50)}`).join('\n');
  const expected = formatTelegramMessages(text);
  assert.ok(expected.length > 1);
  const calls: string[] = [];
  globalThis.fetch = async (_input, options) => {
    const body = JSON.parse(options!.body as string); calls.push(body.text);
    return calls.length === 2 ? Response.json({ ok: false, error_code: 500 }, { status: 500 }) : success('6006');
  };
  const queued = await delivery.sendUserTelegramMessage('parts-user', text);
  assert.equal(queued.queued, true);
  const now = Date.now;
  Date.now = () => now() + 60000;
  try { await delivery.retryPendingTelegramMessages(); } finally { Date.now = now; }
  assert.equal(calls.filter(part => part === expected[0]).length, 1);
  assert.equal(delivery.getTelegramDelivery('parts-user', queued.deliveryId!)?.messageIds.length, expected.length);
});

test('editing saved messages stays within the authenticated owner and treats unchanged text as success', async () => {
  connectUser('edit-alice', '7007');
  connectUser('edit-bob', '8008');
  globalThis.fetch = async (_input, options) => success(JSON.parse(options!.body as string).chat_id);
  const alice = await delivery.sendUserTelegramMessage('edit-alice', 'Alice\nPrice: 10');
  await delivery.sendUserTelegramMessage('edit-bob', 'Bob\nPrice: 20');
  const edits: any[] = [];
  globalThis.fetch = async (input, options) => {
    assert.match(String(input), /bot999:global-fixture\/editMessageText$/);
    edits.push(JSON.parse(options!.body as string));
    return Response.json({ ok: false, description: 'Bad Request: message is not modified' });
  };
  assert.equal((await delivery.reformatUserTelegramMessages('edit-alice')).edited, 1);
  assert.deepEqual(edits.map(edit => edit.message_id), alice.messageIds);
  assert.ok(edits.every(edit => edit.chat_id === '7007'));
});
