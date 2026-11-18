import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('durable fired price alerts recover queue and history failures without duplicate Telegram sends', async () => {
  const previousCwd = process.cwd();
  const previousBot = process.env.TELEGRAM_BOT_TOKEN;
  const previousFetch = globalThis.fetch;
  const rename = fs.renameSync;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-price-alert-outbox-'));
  process.chdir(dir);
  process.env.TELEGRAM_BOT_TOKEN = '999:price-outbox-fixture';
  const telegramFile = path.join(dir, 'server/data/telegram_messages.json');
  const historyFile = path.join(dir, 'server/data/alert_history.json');
  try {
    const alerts = await import('../server/alertService');
    const users = await import('../server/userTelegram');
    users.connectUserTelegram('outbox-owner', '999', '31415', 'uk');
    let sends = 0;
    globalThis.fetch = async input => {
      if (String(input).includes('api.telegram.org')) {
        sends++;
        return Response.json({ ok: true, result: { message_id: 200 + sends, chat: { id: 31415 } } });
      }
      throw new Error('No live price fetch should be needed to replay a stored firing');
    };

    const createPending = (id: string) => {
      const created = alerts.createAlert({
        id, userId: 'outbox-owner', symbol: 'BTCUSDT',
        exchange: 'binance', marketType: 'futures',
        targetPrice: 110, condition: 'gte',
      });
      assert.equal(alerts.saveAlerts(alerts.loadAlerts().map(row =>
        row.id === created.id
          ? { ...row, isActive: false, triggered: true, deliveryPending: true,
            triggeredAt: Date.now(), triggeredPrice: 120 }
          : row)), true);
      return created;
    };

    const one = createPending('recovery-one');
    // An undurable Telegram enqueue must never claim that a fired alert's
    // notification is finished. The next background cycle can resume it.
    fs.renameSync = ((from, to) => {
      if (String(to) === telegramFile) throw new Error('simulated Telegram queue disk failure');
      return rename(from, to);
    }) as typeof fs.renameSync;
    await alerts.checkAlertsOnce('outbox-owner');
    assert.equal(sends, 0, 'no Telegram HTTP request until enqueue is on disk');
    assert.equal(alerts.getAllAlerts('outbox-owner').find(row => row.id === one.id)?.deliveryPending, true);
    assert.equal(alerts.getAlertHistory('outbox-owner').some(row => row.alertId === one.id), false);

    // Stale browser synchronization cannot erase the durable pending flag.
    const stale = { ...alerts.getAllAlerts('outbox-owner')[0], deliveryPending: false };
    alerts.syncUserAlerts('outbox-owner', [stale]);
    assert.equal(alerts.getAllAlerts('outbox-owner')[0].deliveryPending, true);
    assert.throws(() => alerts.toggleAlert(one.id, 'outbox-owner', true), error =>
      error instanceof alerts.AlertDispatchPendingError && /очікує збереження доставки/.test(error.message));
    const api = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
    assert.match(api, /err instanceof AlertDispatchPendingError/);
    assert.match(api, /res.status\(409\)\.setHeader\('Retry-After', '5'\)/);

    fs.renameSync = rename;
    await alerts.checkAlertsOnce('outbox-owner');
    assert.equal(sends, 1);
    assert.equal(alerts.getAllAlerts('outbox-owner')[0].deliveryPending, false);
    const completed = alerts.getAlertHistory('outbox-owner').find(row => row.alertId === one.id);
    assert.ok(completed?.telegramDeliveryId);
    assert.equal(completed.telegramSent, true);
    await alerts.checkAlertsOnce('outbox-owner');
    assert.equal(sends, 1, 'completed cycles are never replayed');

    // Telegram accepted this second event and its queue record is durable.
    // A history persistence failure must leave dispatch pending, then resume
    // with the same eventKey and without making a second Telegram API call.
    const two = createPending('recovery-two');
    fs.renameSync = ((from, to) => {
      if (String(to) === historyFile) throw new Error('simulated history disk failure');
      return rename(from, to);
    }) as typeof fs.renameSync;
    await assert.rejects(alerts.checkAlertsOnce('outbox-owner'), /Не вдалося зберегти історію/);
    assert.equal(sends, 2);
    assert.equal(alerts.getAllAlerts('outbox-owner').find(row => row.id === two.id)?.deliveryPending, true);
    fs.renameSync = rename;
    await alerts.checkAlertsOnce('outbox-owner');
    assert.equal(sends, 2, 'the durable Telegram eventKey prevents a duplicate on recovery');
    assert.equal(alerts.getAllAlerts('outbox-owner').find(row => row.id === two.id)?.deliveryPending, false);
    assert.equal(alerts.getAlertHistory('outbox-owner').filter(row => row.alertId === two.id).length, 1);

    // Older fired records have no dispatch intent. Recovering them solely
    // because the user cleared history would create old duplicate messages.
    const legacy = createPending('legacy-triggered');
    assert.equal(alerts.saveAlerts(alerts.loadAlerts().map(row =>
      row.id === legacy.id ? { ...row, deliveryPending: undefined } : row)), true);
    await alerts.checkAlertsOnce('outbox-owner');
    assert.equal(sends, 2);
    assert.equal(alerts.getAlertHistory('outbox-owner').some(row => row.alertId === legacy.id), false);

    // Crashing after history commit but before finalizing the alert must not
    // repeat Telegram. The saved history is sufficient to finish the cycle.
    const three = createPending('recovery-three');
    let pendingCommitWrites = 0;
    const alertsFile = path.join(dir, 'server/data/alerts.json');
    fs.renameSync = ((from, to) => {
      if (String(to) === alertsFile && ++pendingCommitWrites === 1)
        throw new Error('simulated dispatch-finalization failure');
      return rename(from, to);
    }) as typeof fs.renameSync;
    await assert.rejects(alerts.checkAlertsOnce('outbox-owner'), /Could not finalize durable Telegram dispatch intent/);
    assert.equal(sends, 3);
    assert.equal(alerts.getAllAlerts('outbox-owner').find(row => row.id === three.id)?.deliveryPending, true);
    assert.ok(alerts.getAlertHistory('outbox-owner').some(row => row.alertId === three.id));
    fs.renameSync = rename;
    await alerts.checkAlertsOnce('outbox-owner');
    assert.equal(sends, 3);
    assert.equal(alerts.getAllAlerts('outbox-owner').find(row => row.id === three.id)?.deliveryPending, false);
  } finally {
    fs.renameSync = rename;
    globalThis.fetch = previousFetch;
    if (previousBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousBot;
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
