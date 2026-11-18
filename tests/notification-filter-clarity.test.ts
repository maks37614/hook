import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSiteNotificationSettings, matchesNotificationScope } from '../src/utils/siteNotifications';

const ui=readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx',import.meta.url),'utf8');
const context=readFileSync(new URL('../src/context/SiteNotificationsContext.tsx',import.meta.url),'utf8');

test('advanced-filter description states timeframe-independent and system exceptions',()=>{
  assert.match(ui,/Цінові алерти, ліквідації та WebSocket-імпульси не прив’язані до таймфрейму/);
  assert.match(ui,/Технічні попередження можуть надходити незалежно від фільтрів монет/);
  assert.match(context,/event.kind !== 'system' && !matchesNotificationScope/);
  assert.match(context,/timeframeIndependent: streamEvent/);
});

test('strict filters reject missing timeframe, but explicit stream exception permits it',()=>{
  const cfg=normalizeSiteNotificationSettings({
    optedIn:true, enabled:true, scopeExchange:'binance',scopeMarket:'futures',scopeTimeframe:'15m',
  });
  const source={symbol:'BTCUSDT',exchange:'binance',marketType:'futures'};
  assert.equal(matchesNotificationScope(cfg,source),false);
  assert.equal(matchesNotificationScope(cfg,source,[],{timeframeIndependent:true}),true);
  assert.equal(matchesNotificationScope(cfg,{...source,exchange:'bybit'},[],{timeframeIndependent:true}),false);
});
