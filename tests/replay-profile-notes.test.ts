import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateReplayPayload } from '../server/replayProfileRoutes';
const page = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url),'utf8');
const simulator = readFileSync(new URL('../src/components/replay/ReplaySimulatorPanel.tsx', import.meta.url),'utf8');
test('Replay remembers the note through market and pending fills and realized journal', () => {
  assert.equal((simulator.match(/notes: tradeNotes/g) || []).length, 4);
  for (const expr of [/notes: order\.notes/,/notes: params\.notes/,/notes: prevPos\.notes/,/notes: position\.notes/]) assert.match(page,expr);
});
test('Replay profile stores finite bounded position and order notes', () => {
  const state = { settings: {balance:10000,leverage:10,positionSizeUsd:1000,commissionPct:0.05,spreadPct:0.02,slippagePct:0.02},
    context:{symbol:'BTCUSDT',exchange:'binance',marketType:'futures',timeframe:'1h'},
    resetCount:0, journal:[],
    position:{id:'pos_1',symbol:'BTCUSDT',side:'long',entryPrice:100,currentPrice:102,
      sizeUsd:1000,marginUsd:100,quantity:10,leverage:10,entryTime:1710000000,unrealizedPnlUsd:20,
      unrealizedPnlPct:20,liquidationPrice:90,notes:'My rationale'},
    pendingOrders:[{id:'order_1',symbol:'BTCUSDT',side:'buy',orderType:'limit',price:90,
      sizeUsd:1000,leverage:10,createdAtTime:1710000000,notes:'Wait for support'}] };
  const parsed=validateReplayPayload(state);
  assert.equal(parsed.position?.notes,'My rationale');
  assert.equal(parsed.pendingOrders[0].notes,'Wait for support');
  assert.throws(() => validateReplayPayload({ ...state, position:{...state.position,notes:'A'.repeat(3001)}}),/position.notes/);
});
