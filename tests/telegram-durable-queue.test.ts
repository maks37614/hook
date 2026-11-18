import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Telegram queue fails closed and never acknowledges an undurable delivery', async () => {
  const previousCwd = process.cwd();
  const previousBot = process.env.TELEGRAM_BOT_TOKEN;
  const previousFetch = globalThis.fetch;
  const originalRename = fs.renameSync;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-telegram-durable-'));
  process.cwd();
  process.chdir(temp);
  process.env.TELEGRAM_BOT_TOKEN = '999:durable-fixture';
  try {
    const users = await import('../server/userTelegram');
    const delivery = await import('../server/telegramDelivery');
    const bot = users.getSharedTelegramBot();
    assert.ok(bot, 'fixture shared bot is available');
    users.connectUserTelegram('queue-owner', bot.botId, '31415', 'uk');
    const destination = path.join(temp, 'server/data/telegram_messages.json');
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return Response.json({ ok: true, result: { message_id: 500 + requests, chat: { id: 31415 } } });
    };
    // Corrupt delivery history must survive a failed read unchanged.
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, '{"broken":');
    await assert.rejects(delivery.sendUserTelegramMessage('queue-owner', 'Corrupt', 'corrupt-key'));
    assert.equal(fs.readFileSync(destination, 'utf8'), '{"broken":');
    assert.equal(requests, 0);
    fs.writeFileSync(destination, '[]');

    let failTarget = destination;
    fs.renameSync = ((source, target) => {
      if (String(target) === failTarget) throw new Error('simulated Telegram rename failure');
      return originalRename(source, target);
    }) as typeof fs.renameSync;
    await assert.rejects(
      delivery.sendUserTelegramMessage('queue-owner', 'Not queued', 'undurable-event'),
      /simulated Telegram rename failure/,
    );
    assert.equal(requests, 0, 'no Telegram request before pending record is durably queued');
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), []);
    assert.equal(delivery.lastTelegramDeliveryAt('queue-owner', 'undurable-event'), 0,
      'failed rename cannot poison the in-memory dedupe index');

    fs.renameSync = originalRename;
    const first = await delivery.sendUserTelegramMessage('queue-owner', 'Now queued', 'undurable-event');
    assert.equal(first.success, true);
    assert.equal(requests, 1);
    assert.equal(delivery.getTelegramDelivery('queue-owner', first.deliveryId!)?.status, 'sent');
    const saved = fs.readFileSync(destination, 'utf8');

    // A sync record (without an HTTP call) must not be exposed if disk writes fail.
    fs.renameSync = ((source, target) => {
      if (String(target) === destination) throw new Error('simulated sync record failure');
      return originalRename(source, target);
    }) as typeof fs.renameSync;
    assert.throws(() => delivery.recordSentTelegramMessage('queue-owner', 'Offline record', [901]),
      /simulated sync record failure/);
    assert.equal(fs.readFileSync(destination, 'utf8'), saved);

    // Failure while updating a pending record after the HTTP call must not
    // claim sent state; the previous queued record stays available for retry.
    fs.renameSync = originalRename;
    const originalQueue = JSON.parse(saved);
    assert.equal(originalQueue.length, 1);
    let renameCount = 0;
    fs.renameSync = ((source, target) => {
      if (String(target) === destination && ++renameCount === 2)
        throw new Error('simulated delivery acknowledgment failure');
      return originalRename(source, target);
    }) as typeof fs.renameSync;
    await assert.rejects(delivery.sendUserTelegramMessage('queue-owner', 'Another event', 'pending-event'),
      /simulated delivery acknowledgment failure/);
    assert.equal(requests, 2, 'Telegram HTTP call was made, but its outcome is not yet durable');
    const records = JSON.parse(fs.readFileSync(destination, 'utf8'));
    assert.equal(records.length, 2);
    assert.equal(records[1].status, 'pending', 'disk keeps the last durable state');
    assert.equal(delivery.getTelegramDelivery('queue-owner', records[1].id)?.status, 'pending',
      'memory must match the last durable state after failed acknowledgment');
    assert.equal(delivery.getTelegramDelivery('another-user', records[1].id), undefined);
  } finally {
    fs.renameSync = originalRename;
    globalThis.fetch = previousFetch;
    if (previousBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousBot;
    process.chdir(previousCwd);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
