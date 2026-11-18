import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesNotificationScope, normalizeSiteNotificationSettings} from '../src/utils/siteNotifications';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const router=read('../server/notificationRouter.ts');
const worker=read('../server/surveillance/coinWorker.ts');
const service=read('../server/surveillanceService.ts');

test('dedicated Telegram delivery keeps actual event timeframe without profile-side scope gates',()=>{
  assert.match(router,/timeframe: payload\.timeframe/);
  assert.doesNotMatch(router,/timeframe: params\.coin\?\.config\?\.timeframe/);
  assert.doesNotMatch(router,/isUserTelegramCategoryAllowed|matchesNotificationScope/);
  assert.match(router,/params\.userId === 'guest'/);
  assert.equal((router.match(/timeframe\?: string;/g)||[]).length,2);
});

test('worker forwards independent timeframes for structure, retest, OI, DOM and setups',()=>{
  assert.match(worker,/eventType: struct\.lastBreak\.type,\s*timeframe: tf,/);
  assert.match(worker,/eventType: 'THIRD_TOUCH_APPROACHING',\s*timeframe: '1h',/);
  assert.match(worker,/eventType: 'OI_ANOMALY',\s*timeframe: '15m',/);
  assert.match(worker,/eventType: 'DENSITY_APPEARED',\s*timeframe: '5m',/);
  assert.match(worker,/eventType: alertType,\s*timeframe: setup\.timeframe,/);
  assert.match(service,/timeframe: selected\.details\?\.timeframe,/);
});

test('timeframe filter fails closed when event timeframe absent or wrong',()=>{
  const config=normalizeSiteNotificationSettings({optedIn:true,enabled:true,density:true,scopeTimeframe:'5m'});
  const market={symbol:'BTCUSDT',exchange:'binance',marketType:'futures'};
  assert.equal(matchesNotificationScope(config,market),false);
  assert.equal(matchesNotificationScope(config,{...market,timeframe:'15m'}),false);
  assert.equal(matchesNotificationScope(config,{...market,timeframe:'5m'}),true);
});
