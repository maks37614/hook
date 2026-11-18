import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedDepthSubscriptions } from '../src/components/hookchart/sharedDepthStream';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import type { ChartDepthStatus } from '../src/utils/hookChartDepthProtocol';

const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'BTCUSDT' };
const snapshot = (sequence: number): BookUpdate => ({
  isSnapshot: true, sequence, eventTime: Date.now(),
  bids: [[100, 12], [99, 8]], asks: [[101, 10], [102, 7]],
});

test('throwing status on join before any book does not leak a shared depth subscriber', () => {
  let started = 0, stopped = 0;
  const shared = createSharedDepthSubscriptions(() => {
    started++;
    return () => { stopped++; };
  });
  const healthy = shared.subscribe({
    ...scope, onBook: () => true, onStatus: () => {},
  });

  // Previous behavior called onStatus directly after registering a new chart,
  // so an exception aborted subscribe() without returning any unsubscribe.
  let removeBroken: (() => void) | undefined;
  assert.doesNotThrow(() => {
    removeBroken = shared.subscribe({
      ...scope, onBook: () => true, onStatus: () => { throw new Error('unmounted chart'); },
    });
  });
  assert.equal(started, 1, 'both subscribers share the same depth websocket');
  assert.equal(shared.activeScopes(), 1);

  removeBroken?.();
  healthy();
  assert.equal(shared.activeScopes(), 0);
  assert.equal(stopped, 1, 'the shared socket closes after both listeners unsubscribe');
});

test('late join with fresh book isolates status exceptions from book acceptance and other charts', () => {
  let onBook!: (packet: BookUpdate) => boolean;
  let onStatus!: (status: ChartDepthStatus) => void;
  let stopped = 0;
  const shared = createSharedDepthSubscriptions(options => {
    onBook = options.onBook;
    onStatus = options.onStatus;
    return () => { stopped++; };
  });
  const healthyEvents: number[] = [];
  const healthyStates: ChartDepthStatus[] = [];
  const offHealthy = shared.subscribe({
    ...scope,
    onBook: packet => { healthyEvents.push(packet.sequence); return true; },
    onStatus: value => healthyStates.push(value),
  });
  assert.equal(onBook(snapshot(200)), true);
  onStatus('live');

  // The initial onBook succeeds but the first status notification fails.
  // A later LIVE status must still arrive as LIVE, not reconnecting.
  let firstStatus = true;
  const recoveredStates: ChartDepthStatus[] = [];
  let offRecovering: (() => void) | undefined;
  assert.doesNotThrow(() => {
    offRecovering = shared.subscribe({
      ...scope,
      onBook: () => true,
      onStatus: value => {
        if (firstStatus) { firstStatus = false; throw new Error('temporary UI error'); }
        recoveredStates.push(value);
      },
    });
  });
  assert.equal(firstStatus, false);
  onStatus('live');
  assert.deepEqual(recoveredStates, ['live'],
    'onStatus failure must not turn an accepted snapshot into a failed book');

  // Both the snapshot consumer and its fallback status handler throw.
  // Subscription still returns a disposer, and healthy charts see deltas.
  let offBroken: (() => void) | undefined;
  assert.doesNotThrow(() => {
    offBroken = shared.subscribe({
      ...scope,
      onBook: () => { throw new Error('broken chart book'); },
      onStatus: () => { throw new Error('broken chart status'); },
    });
  });
  assert.equal(onBook({
    sequence: 201, eventTime: Date.now(), bids: [[100, 14]], asks: [],
  }), true);
  onStatus('live');
  assert.deepEqual(healthyEvents, [200, 201]);
  assert.equal(healthyStates.at(-1), 'live');
  assert.equal(recoveredStates.at(-1), 'live');

  offBroken?.();
  offRecovering?.();
  offHealthy();
  assert.equal(shared.activeScopes(), 0);
  assert.equal(stopped, 1);
});
