import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReplayPayload } from '../server/replayProfileRoutes';
const valid = () => ({
  settings: { balance: 10000, leverage: 10, positionSizeUsd: 1000, commissionPct: .05, spreadPct: .02, slippagePct: .02 },
  position: null, pendingOrders: [], journal: [],
  context: { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', timeframe: '1h', atTime: 1710000000 },
  resetCount: 0,
});
test('account-scoped replay permits valid finite settings and no owner override', () => {
  const state = { ...valid(), userId: 'other-user' };
  const normalized = validateReplayPayload(state);
  assert.equal(normalized.settings.balance, 10000);
  assert.equal(normalized.context.symbol, 'BTCUSDT');
  assert.ok(!('userId' in normalized));
});
test('profile rejects embedded screenshots and excessive records', () => {
  const data: any = valid();
  const item: any = {
    id: 'trade_1', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    timeframe: '1h', side: 'long', entryPrice: 100, exitPrice: 110,
    entryTime: 1710000000, exitTime: 1710003600, sizeUsd: 1000, marginUsd: 100,
    leverage: 10, pnlUsd: 100, pnlPct: 100, commissionUsd: 1, tag: 'test',
    screenshotUrl: 'data:image/png;base64,AAAA', exitReason: 'tp',
  };
  data.journal = [item];
  assert.throws(() => validateReplayPayload(data), /trade.screenshot/);
  item.screenshotUrl = 'idb:trade_1';
  assert.equal(validateReplayPayload(data).journal[0].screenshotUrl, 'idb:trade_1');
  data.journal = Array(701).fill(item);
  assert.throws(() => validateReplayPayload(data), /journal/);
});
