import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Telegram /start links and getUpdates offset are only published after durable rename', async () => {
  const previousCwd = process.cwd();
  const previousBot = process.env.TELEGRAM_BOT_TOKEN;
  const previousFetch = globalThis.fetch;
  const rename = fs.renameSync;
  const write = fs.writeFileSync;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-link-atomic-'));
  process.chdir(temp);
  process.env.TELEGRAM_BOT_TOKEN = '999:atomic-fixture';
  const linkFile = path.join(temp, 'server/data/telegram_links.json');
  let updates: unknown[] = [];
  const offsets: Array<number | undefined> = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'atomic_h00k_bot' } });
    if (url.endsWith('/getUpdates')) {
      const body = JSON.parse(options!.body as string);
      offsets.push(body.offset);
      return Response.json({ ok: true, result: updates });
    }
    if (url.endsWith('/sendMessage')) return Response.json({
      ok: true, result: { message_id: 1, chat: { id: '31415' } },
    });
    throw new Error('Unexpected Telegram request: ' + url);
  };

  try {
    fs.mkdirSync(path.dirname(linkFile), { recursive: true });
    fs.writeFileSync(linkFile, '{corrupt links');
    const links = await import('../server/telegramLinkService');
    const users = await import('../server/userTelegram');
    assert.throws(() => links.getSharedTelegramStatus('alice'), /JSON|Unexpected/);
    assert.equal(fs.readFileSync(linkFile, 'utf8'), '{corrupt links');
    fs.writeFileSync(linkFile, JSON.stringify({ pending: [] }));

    const alice = await links.beginSharedTelegramLink('alice');
    assert.equal(alice.success, true);
    const before = fs.readFileSync(linkFile, 'utf8');
    const aliceToken = new URL(alice.url!).searchParams.get('start')!;
    assert.equal(links.getSharedTelegramStatus('alice').linkPending, true);

    fs.renameSync = ((src, dest) => {
      if (String(dest) === linkFile) throw new Error('simulated link rename failure');
      return rename(src, dest);
    }) as typeof fs.renameSync;
    await assert.rejects(links.beginSharedTelegramLink('bob'), /simulated link rename failure/);
    assert.equal(fs.readFileSync(linkFile, 'utf8'), before);
    assert.equal(links.getSharedTelegramStatus('bob').linkPending, false,
      'failed disk commit cannot create a phantom one-time verification link');

    fs.renameSync = rename;
    assert.equal((await links.beginSharedTelegramLink('bob')).success, true);
    assert.equal(links.getSharedTelegramStatus('bob').linkPending, true);

    // A pre-existing temp file with mode 0644 must become private BEFORE
    // its payload is written, not merely before final rename.
    fs.writeFileSync(`${linkFile}.tmp`, 'stale', { mode: 0o644 });
    fs.chmodSync(`${linkFile}.tmp`, 0o644);
    let inspected = 0;
    fs.writeFileSync = ((destination: fs.PathOrFileDescriptor, ...args: any[]) => {
      if (String(destination) === `${linkFile}.tmp`) {
        inspected++;
        assert.equal(fs.statSync(`${linkFile}.tmp`).mode & 0o777, 0o600);
      }
      return (write as any)(destination, ...args);
    }) as typeof fs.writeFileSync;
    assert.equal((await links.beginSharedTelegramLink('charlie')).success, true);
    fs.writeFileSync = write;
    assert.ok(inspected > 0);
    assert.equal(fs.statSync(linkFile).mode & 0o777, 0o600);

    // Processing /start durably removes the one-time link before the poller
    // stores the update cursor. Simulate failure ONLY on cursor rename.
    updates = [{
      update_id: 12,
      message: { text: '/start ' + aliceToken,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 31415, type: 'private' },
        from: { id: 31415, first_name: 'Alice', username: 'alice' } },
    }];
    let renames = 0;
    fs.renameSync = ((src, dest) => {
      if (String(dest) === linkFile && ++renames === 2)
        throw new Error('simulated cursor rename failure');
      return rename(src, dest);
    }) as typeof fs.renameSync;
    await links.pollSharedTelegramUpdates();
    assert.equal(users.getUserTelegram('alice')?.chatId, '31415');
    assert.equal(links.getSharedTelegramStatus('alice').linkPending, false);
    assert.equal(JSON.parse(fs.readFileSync(linkFile, 'utf8')).nextOffset, undefined,
      'failed offset rename cannot claim an update was consumed');
    fs.renameSync = rename;
    await links.pollSharedTelegramUpdates();
    assert.deepEqual(offsets, [undefined, undefined],
      'retries must use the last saved cursor, not a phantom memory-only offset');
    assert.equal(JSON.parse(fs.readFileSync(linkFile, 'utf8')).nextOffset, 13);

    // Revoking a link must happen before an account is disconnected; an I/O
    // failure during revocation must leave the previously linked account live.
    assert.equal((await links.beginSharedTelegramLink('alice')).success, true);
    fs.renameSync = ((src, dest) => {
      if (String(dest) === linkFile) throw new Error('simulated revocation failure');
      return rename(src, dest);
    }) as typeof fs.renameSync;
    assert.throws(() => links.disconnectSharedTelegram('alice'), /simulated revocation failure/);
    assert.equal(users.getUserTelegram('alice')?.chatId, '31415');
    assert.equal(links.getSharedTelegramStatus('alice').linkPending, true);
    fs.renameSync = rename;
    links.disconnectSharedTelegram('alice');
    assert.equal(users.getUserTelegram('alice')?.chatId, undefined);
    assert.equal(links.getSharedTelegramStatus('alice').linkPending, false);
  } finally {
    fs.renameSync = rename;
    fs.writeFileSync = write;
    globalThis.fetch = previousFetch;
    if (previousBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousBot;
    process.chdir(previousCwd);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
