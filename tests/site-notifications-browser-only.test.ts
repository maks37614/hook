import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const ui=read('../src/components/profile/ProfileNotificationSettings.tsx');
const client=read('../src/context/SiteNotificationsContext.tsx');
const surveillance=read('../src/context/SurveillanceContext.tsx');
const server=read('../server.ts');

test('site notification settings are browser-only with no Telegram switches or links', () => {
  assert.doesNotMatch(ui, /Telegram|telegramEnabled|telegram/i);
  assert.match(ui, /Коли сайт закрито, локальні сповіщення не працюють/);
  assert.match(ui, /Додатковий повний пошук монет не запускається/);
  assert.match(ui, /Сповіщення браузера, якщо вкладка згорнута/);
  assert.doesNotMatch(client, /\/api\/notification-preferences/);
  assert.doesNotMatch(server, /\/api\/notification-preferences/);
});
test('market signals are processed in browser using available scan results', () => {
  assert.match(client, /scanNotificationSignals\(coins, settingsRef\.current, favorites,/);
  assert.match(client, /new NotificationCooldownTracker/);
  assert.match(client, /if \(!settingsRef\.current\.optedIn \|\| !settingsRef\.current\.enabled\) return/);
  assert.match(client, /const setFavoriteIds = useCallback/);
  assert.doesNotMatch(client, /void updateSettings\(\{ favoriteIds: normalized \}\)/);
});
test('surveillance presence does not force SSE and redundant polling for passive visitors', () => {
  assert.match(surveillance, /const hasActiveMonitors = coins\.some\(coin => coin\.isActive\)/);
  assert.match(surveillance, /const keepSurveillanceSSE = shouldConnectSurveillanceSSE\(/);
  assert.match(surveillance, /if \(!keepSurveillanceSSE \|\| !user\?\.uid\)/);
  assert.match(surveillance, /if \(streamConnected\.current \|\| \(typeof document !== 'undefined' && document\.hidden\)\) return/);
  assert.match(surveillance, /streamConnected\.current = connected/);
  assert.match(surveillance, /subscribeUserSignalStream\(user\.uid/);
  assert.match(surveillance, /streamConnected\.current = false/);
  assert.match(surveillance, /now - lastIdlePollRef\.current < 5 \* 60_000/);
  assert.match(surveillance, /activeMonitorsRef\.current/);
});
test('independent Telegram pages retain their own controls', () => {
  const surveillancePage=read('../src/components/SurveillancePage.tsx');
  const price=read('../server/alertService.ts');
  const router=read('../server/notificationRouter.ts');
  assert.match(surveillancePage, /surveillance\.ui\.telegram/);
  assert.match(surveillancePage, /telegramEnabled: e\.target\.checked/);
  assert.match(price, /a\.isActive && !a\.triggered/);
  assert.match(router, /coin\.config\?\.telegramEnabled === false/);
});
