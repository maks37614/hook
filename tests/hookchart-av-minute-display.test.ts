import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expectedCompletedMinute, freshChartMinute, parseMinuteVolumeResponse, selectMinuteVolume,
} from '../src/components/hookchart/avMinuteDisplay';

const serverNow = Date.UTC(2026, 10, 20, 19, 11, 25);
const minuteStart = Date.UTC(2026, 10, 20, 19, 10);
test('AV 1m accepts verified backend turnover even when client clock differs by hours', () => {
  const remote = parseMinuteVolumeResponse(
    { success: true, serverNow, minuteStart, volume1mUsd: 10_707_579.6627 },
    serverNow + 3_600_000,
  );
  assert.ok(remote);
  assert.equal(selectMinuteVolume(null, remote, serverNow + 3_600_500)?.volume1mUsd, 10_707_579.6627);
  assert.equal(selectMinuteVolume(null, remote, serverNow + 3_720_000), null);
});
test('the 1m chart only uses its latest completed candle, never the live partial candle', () => {
  assert.equal(expectedCompletedMinute(serverNow), minuteStart);
  assert.equal(freshChartMinute({minuteStart: minuteStart+60_000, volume1mUsd: 55_000}, serverNow), null);
  const closed = {minuteStart,volume1mUsd: 230_000};
  assert.deepEqual(freshChartMinute(closed, serverNow), closed);
  assert.deepEqual(selectMinuteVolume(closed, null, serverNow), closed);
  assert.equal(freshChartMinute(closed, serverNow + 61_000), null);
});
test('bad or still-forming exchange readings are never presented as real volume', () => {
  const valid = {success:true,serverNow,minuteStart,volume1mUsd:123_456};
  for (const response of [
    {...valid,success:false},{...valid,volume1mUsd:null},{...valid,volume1mUsd:NaN},
    {...valid,volume1mUsd:-1},{...valid,serverNow:minuteStart+40_000},
    {...valid,serverNow:minuteStart+210_000},{...valid,minuteStart:minuteStart+5000},
  ]) assert.equal(parseMinuteVolumeResponse(response,serverNow),null);
});
test('backend 1m response has server time, retry cache is isolated, and API does not request depth WS', () => {
  const server = readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  const shared = readFileSync(new URL('../src/utils/sharedChartRequests.ts',import.meta.url),'utf8');
  const footer = readFileSync(new URL('../src/components/hookchart/HookChartFooterMinuteVolume.tsx',import.meta.url),'utf8');
  assert.match(server,/serverNow: Date\.now\(\)/);
  assert.match(shared,/minuteVolumeCache = createTimedRequestCache<any>\(10_000/);
  assert.match(footer,/sharedPublicChartPolling\.subscribe/);
  assert.match(footer,/needFallback/);
  assert.doesNotMatch(footer,/subscribeMarketTrades|connectSharedHookChartDepth/);
});

test('ECO retains real 1m chart turnover without extra requests and distinguishes ECO from missing data', () => {
  const footer = readFileSync(new URL('../src/components/hookchart/HookChartFooterMinuteVolume.tsx',import.meta.url),'utf8');
  assert.match(footer, /const chartMinute = freshChartMinute\(observedMinute, Date\.now\(\)\)/);
  assert.match(footer, /const needFallback = enabled && !chartMinute/);
  assert.match(footer, /!enabled \? 'ECO' : waiting/);
  assert.match(footer, /ECO_PAUSED\[language\]/);
  assert.match(footer, /sharedPublicChartPolling\.subscribe/);
  const fromChart = {minuteStart,volume1mUsd:230_000};
  assert.deepEqual(selectMinuteVolume(fromChart,null,serverNow), fromChart);
});
