import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('corrupt price alert and history JSON fail closed without overwriting user records', async () => {
  const old = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-alert-corruption-'));
  const dataDir = path.join(temp, 'server', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const alertsFile = path.join(dataDir, 'alerts.json');
  const historyFile = path.join(dataDir, 'alert_history.json');
  fs.writeFileSync(alertsFile, '{ this is not valid JSON');
  fs.writeFileSync(historyFile, '{ history was corrupted');
  process.chdir(temp);
  try {
    const svc = await import('../server/alertService');
    assert.throws(() => svc.loadAlerts());
    assert.throws(() => svc.createAlert({
      id: 'no-overwrite', userId: 'user-1', symbol: 'BTCUSDT',
      exchange: 'binance', marketType: 'futures', targetPrice: 50000, condition: 'gte',
    }));
    assert.equal(fs.readFileSync(alertsFile, 'utf8'), '{ this is not valid JSON');
    assert.throws(() => svc.loadHistory());
    assert.equal(fs.readFileSync(historyFile, 'utf8'), '{ history was corrupted');
    // Once repaired by an operator, the store can be loaded normally.
    fs.writeFileSync(historyFile, '[]');
    fs.writeFileSync(alertsFile, '[]');
    const saved = svc.createAlert({
      id: 'after-repair', userId: 'user-1', symbol: 'BTCUSDT',
      exchange: 'binance', marketType: 'futures', targetPrice: 50000, condition: 'gte',
    });
    assert.equal(saved.id, 'after-repair');
    assert.equal(svc.getAllAlerts('user-1').length, 1);
  } finally {
    process.chdir(old);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
