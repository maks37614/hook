import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Telegram account migration is retryable after disk failure, with private atomic updates', async () => {
  const previousCwd = process.cwd();
  const originalBot = process.env.TELEGRAM_BOT_TOKEN;
  const rename = fs.renameSync;
  const write = fs.writeFileSync;
  const chmod = fs.chmodSync;
  const fsync = fs.fsyncSync;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-user-telegram-durable-'));
  const dir = path.join(tmp, 'server/data');
  const config = path.join(dir, 'user_telegram.json');
  process.chdir(tmp);
  process.env.TELEGRAM_BOT_TOKEN = '999:telegram-storage-fixture';
  try {
    fs.mkdirSync(dir, { recursive: true });
    // A corrupt source must not be replaced with an empty account map by a
    // subsequent edit. Recovery should be possible without restarting.
    fs.writeFileSync(config, '{bad');
    const users = await import('../server/userTelegram');
    assert.throws(() => users.loadUserTelegram());
    assert.throws(() => users.saveUserTelegram('alice', { language: 'en' }));
    assert.equal(fs.readFileSync(config, 'utf8'), '{bad');

    const legacy = JSON.stringify({
      alice: { botToken: '777:private-personal-token', chatId: '1111', language: 'pl' },
      bob: { mode: 'shared', botId: '999', botToken: '123:stale', chatId: '2222',
        confirmedAt: '2026-11-14T00:00:00.000Z', language: 'uk' },
    });
    fs.writeFileSync(config, legacy);
    const failRename: typeof fs.renameSync = (source, destination) => {
      if (String(destination) === config) throw new Error('simulated migration rename failure');
      return rename(source, destination);
    };
    fs.renameSync = failRename;
    assert.throws(() => users.loadUserTelegram(), /simulated migration rename failure/);
    assert.equal(fs.readFileSync(config, 'utf8'), legacy,
      'failed legacy migration must preserve old Telegram account data on disk');
    // The in-memory store must still be unloaded: the next request must
    // retry migration instead of accepting an unpersisted sanitized map.
    assert.throws(() => users.getUserTelegram('bob'), /simulated migration rename failure/);

    fs.renameSync = rename;
    const loaded = users.loadUserTelegram();
    assert.equal(loaded.size, 2);
    assert.equal(users.getUserTelegram('alice')?.botToken, undefined);
    assert.equal(users.getUserTelegram('alice')?.chatId, undefined);
    assert.equal(users.getUserTelegram('alice')?.needsConfirmation, true);
    assert.equal(users.getUserTelegram('bob')?.chatId, '2222');
    const sanitized = fs.readFileSync(config, 'utf8');
    assert.ok(!sanitized.includes('777:private-personal-token'));
    assert.ok(!sanitized.includes('123:stale'));
    assert.equal(fs.statSync(config).mode & 0o777, 0o600);

    // The old predictable 0644 temp is removed before personal data is
    // written to an exclusive 0600 file descriptor.
    fs.writeFileSync(`${config}.tmp`, 'leftover', { mode: 0o644 });
    fs.chmodSync(`${config}.tmp`, 0o644);
    let writes = 0;
    fs.writeFileSync = ((target: fs.PathOrFileDescriptor, ...args: any[]) => {
      if (typeof target === 'number') {
        writes++;
        assert.equal(fs.fstatSync(target).mode & 0o777, 0o600);
      }
      return (write as any)(target, ...args);
    }) as typeof fs.writeFileSync;
    users.connectUserTelegram('carol', '999', '3333', 'en');
    fs.writeFileSync = write;
    assert.ok(writes > 0);
    assert.equal(users.getUserTelegram('carol')?.chatId, '3333');
    assert.equal(fs.statSync(config).mode & 0o777, 0o600);

    // A disk rename failure must never create a phantom connection in the
    // memory cache, nor leave it active if the source file stayed unchanged.
    const connected = fs.readFileSync(config, 'utf8');
    fs.renameSync = failRename;
    assert.throws(() => users.connectUserTelegram('dave', '999', '4444'), /simulated migration rename failure/);
    assert.equal(users.getUserTelegram('dave'), undefined);
    assert.equal(fs.readFileSync(config, 'utf8'), connected);
    assert.throws(() => users.disconnectUserTelegram('carol'), /simulated migration rename failure/);
    assert.equal(users.getUserTelegram('carol')?.chatId, '3333');
    assert.equal(fs.readFileSync(config, 'utf8'), connected);
    fs.renameSync = rename;

    // Failure to fsync the new temp before rename must fail closed.
    fs.fsyncSync = ((fd) => {
      if (fs.fstatSync(fd).isFile()) throw new Error('simulated fsync failure');
      return fsync(fd);
    }) as typeof fs.fsyncSync;
    assert.throws(() => users.saveUserTelegram('carol', { language: 'ru' }),
      /simulated fsync failure/);
    assert.equal(users.getUserTelegram('carol')?.language, 'en');
    assert.equal(fs.readFileSync(config, 'utf8'), connected);
    fs.fsyncSync = fsync;
    users.disconnectUserTelegram('carol');
    assert.equal(users.getUserTelegram('carol')?.chatId, undefined);
  } finally {
    fs.renameSync = rename;
    fs.writeFileSync = write;
    fs.chmodSync = chmod;
    fs.fsyncSync = fsync;
    if (originalBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalBot;
    process.chdir(previousCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
