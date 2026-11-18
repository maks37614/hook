import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AlertHistoryItem } from '../src/types';

test('price alert edits, deletion and history survive simulated disk failures', async () => {
  // The service resolves server/data at import time. Keep all cases within
  // this isolated, temporary working directory and one test process.
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-price-alerts-durable-'));
  const originalRename = fs.renameSync;
  process.chdir(dir);
  try {
    const svc = await import('../server/alertService');
    const owner = 'user-test-alert-1';
    const data = { id: 'alert-test-1', userId: owner, symbol: 'BTCUSDT',
      exchange: 'binance' as const, marketType: 'futures' as const,
      targetPrice: 90000, condition: 'gte' as const };
    const initial = svc.createAlert(data);
    assert.equal(initial.isActive, true);
    const alertFile = path.join(dir, 'server', 'data', 'alerts.json');
    const historyFile = path.join(dir, 'server', 'data', 'alert_history.json');
    const deletedFile = path.join(dir, 'server', 'data', 'deleted_alerts.json');
    const before = fs.readFileSync(alertFile, 'utf8');
    assert.equal(fs.statSync(alertFile).mode & 0o777, 0o600,
      'alerts.json must be private immediately after first creation');
    assert.equal(svc.getAllAlerts(owner).length, 1);

    const blockRename = (targetFile: string) => {
      const failingRename: typeof fs.renameSync = (source, target) => {
        if (String(target) === targetFile) throw new Error('simulated disk failure');
        originalRename(source, target);
      };
      fs.renameSync = failingRename;
    };

    // Every new file descriptor must be private at its first write. Never
    // reuse the legacy, predictable .tmp path.
    const assertPrivateDuringWrite = (destination: string, operation: () => void) => {
      const previousWrite = fs.writeFileSync;
      let inspected = 0;
      fs.writeFileSync = ((target: fs.PathOrFileDescriptor, ...args: any[]) => {
        if (typeof target === 'number') {
          inspected++;
          assert.equal(fs.fstatSync(target).mode & 0o777, 0o600,
            'temporary file must already be private before personal data is written');
        }
        return (previousWrite as any)(target, ...args);
      }) as typeof fs.writeFileSync;
      try { operation(); }
      finally { fs.writeFileSync = previousWrite; }
      assert.ok(inspected > 0, 'expected to inspect a personal JSON write');
    };

    // A failed update, creation or batch creation changes neither memory
    // nor the persisted source of truth.
    blockRename(alertFile);
    assert.throws(() => svc.toggleAlert(data.id, owner, false), /Не вдалося зберегти/);
    assert.equal(svc.getAllAlerts(owner)[0].isActive, true);
    assert.throws(() => svc.createAlert({ ...data, id: 'alert-test-2' }), /Не вдалося зберегти/);
    assert.throws(() => svc.createAlertsBatch(owner, [{ ...data, id: 'batch-1' }]),
      /Не вдалося зберегти/);
    assert.equal(svc.getAllAlerts(owner).length, 1);
    assert.equal(fs.readFileSync(alertFile, 'utf8'), before);

    fs.renameSync = originalRename;
    // Old releases may have left a temp file with unsafe permissions;
    // overwriting it must not expose the next alerts.json snapshot.
    fs.writeFileSync(`${alertFile}.tmp`, 'old temp', { mode: 0o644 });
    fs.chmodSync(`${alertFile}.tmp`, 0o644);
    assertPrivateDuringWrite(alertFile, () => {
      assert.equal(svc.toggleAlert(data.id, owner, false)?.isActive, false);
    });
    assert.equal(svc.getAllAlerts(owner)[0].isActive, false);
    assert.equal(fs.statSync(alertFile).mode & 0o777, 0o600);

    // History writes are transactional from the application's point of view.
    const item: AlertHistoryItem = {
      id: 'hist-test', userId: owner, alertId: data.id,
      symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
      targetPrice: 90000, triggeredPrice: 90100, condition: 'gte',
      triggeredAt: 1794618000000, telegramSent: false,
    };
    blockRename(historyFile);
    assert.throws(() => svc.addHistoryItem(item), /Не вдалося зберегти історію/);
    assert.equal(svc.getAlertHistory(owner).some(row => row.id === item.id), false);
    fs.renameSync = originalRename;
    fs.writeFileSync(`${historyFile}.tmp`, 'old temp', { mode: 0o644 });
    fs.chmodSync(`${historyFile}.tmp`, 0o644);
    assertPrivateDuringWrite(historyFile, () => svc.addHistoryItem(item));
    assert.equal(svc.getAlertHistory(owner).some(row => row.id === item.id), true);
    assert.equal(fs.statSync(historyFile).mode & 0o777, 0o600,
      'alert_history.json must be private after atomic rename');

    // Deletions are safe even if the second (alerts.json) file write fails:
    // tombstones keep stale browser syncs from resurrecting deleted alerts.
    const deletedId = 'tombstone-alert-1';
    svc.createAlert({ ...data, id: deletedId });
    fs.writeFileSync(`${deletedFile}.tmp`, 'old temp', { mode: 0o644 });
    fs.chmodSync(`${deletedFile}.tmp`, 0o644);
    blockRename(alertFile);
    assertPrivateDuringWrite(deletedFile, () => {
      assert.equal(svc.deleteAlert(deletedId, owner), true);
    });
    assert.equal(svc.getAllAlerts(owner).some(row => row.id === deletedId), false);
    assert.throws(() => svc.createAlert({ ...data, id: deletedId }), /Сповіщення вже видалено/);
    const tombstones = JSON.parse(fs.readFileSync(deletedFile, 'utf8'));
    assert.ok(tombstones.includes(owner + ':' + deletedId));
    assert.equal(fs.statSync(deletedFile).mode & 0o777, 0o600,
      'deleted-alert tombstones must be private after atomic rename');

    // If writing the tombstone itself fails, the operation must not appear
    // committed; the old alert remains live and can be retried.
    fs.renameSync = originalRename;
    const retryId = 'retry-deletion-alert';
    svc.createAlert({ ...data, id: retryId });
    blockRename(deletedFile);
    assert.throws(() => svc.deleteAlert(retryId, owner), /simulated disk failure/);
    assert.equal(svc.getAllAlerts(owner).some(row => row.id === retryId), true);
    fs.renameSync = originalRename;
    assert.equal(svc.deleteAlert(retryId, owner), true);
    assert.equal(svc.getAllAlerts(owner).some(row => row.id === retryId), false);

    // A pre-rename fsync failure must not publish an unflushed edit.
    const originalFsync = fs.fsyncSync;
    const lastDurable = fs.readFileSync(alertFile, 'utf8');
    fs.fsyncSync = ((fd) => {
      if (fs.fstatSync(fd).isFile()) throw new Error('simulated fsync failure');
      return originalFsync(fd);
    }) as typeof fs.fsyncSync;
    try {
      assert.throws(() => svc.toggleAlert(data.id, owner, true), /Не вдалося зберегти/);
      assert.equal(fs.readFileSync(alertFile, 'utf8'), lastDurable);
      assert.equal(svc.getAllAlerts(owner)[0].isActive, false);
    } finally {
      fs.fsyncSync = originalFsync;
    }
  } finally {
    fs.renameSync = originalRename;
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
