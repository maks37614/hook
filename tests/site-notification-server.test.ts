import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categoryForServerEvent, getUserSiteNotificationSettings } from '../server/siteNotificationPrefs';
import { normalizeSiteNotificationSettings, notificationEnabled } from '../src/utils/siteNotifications';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('on-site notification preferences never enable automatic Telegram', () => {
  assert.equal(getUserSiteNotificationSettings('guest').enabled, false);
  const prefs = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, price: true, telegramEnabled: true,
  });
  assert.equal(prefs.telegramEnabled, false);
  assert.equal(notificationEnabled(prefs, 'price'), true);
});

test('existing server event taxonomy remains available for independent alert pages', () => {
  assert.equal(categoryForServerEvent('PRICE_ALERT', 'PRICE_ALERT'), 'price');
  assert.equal(categoryForServerEvent('FORMATION_DETECTED', 'SCREENER'), 'formation');
  assert.equal(categoryForServerEvent('DENSITY_APPEARED', 'SURVEILLANCE'), 'density');
  assert.equal(categoryForServerEvent('OI_ANOMALY', 'SURVEILLANCE'), 'openInterest');
  assert.equal(categoryForServerEvent('LEVEL_CROSS_15M', 'SURVEILLANCE'), 'breakouts');
  assert.equal(categoryForServerEvent('CHANNEL_BREAKOUT', 'SURVEILLANCE'), 'breakouts');
  assert.equal(categoryForServerEvent('FIBONACCI', 'SURVEILLANCE'), 'levels');
  assert.equal(categoryForServerEvent('MOMENTUM', 'SURVEILLANCE'), 'impulse');
});

test('browser settings are not written to VPS and separate Telegram alert routes remain guarded', () => {
  const server = read('../server.ts');
  const router = read('../server/notificationRouter.ts');
  const price = read('../server/alertService.ts');
  const ctx = read('../src/context/SiteNotificationsContext.tsx');
  const profile = read('../src/components/profile/ProfileNotificationSettings.tsx');
  assert.doesNotMatch(server, /app\.(?:get|put)\('\/api\/notification-preferences'/);
  assert.doesNotMatch(ctx, /\/api\/notification-preferences/);
  assert.doesNotMatch(profile, /[Tt]elegram/);
  assert.match(server, /app\.use\(\['\/api\/alerts', '\/api\/telegram', '\/api\/surveillance', '\/api\/cron'\], requireUserAuth\)/);
  assert.match(server, /installTelegramRoutes\(app\)/);
  assert.match(router, /params\.userId === 'guest'/);
  assert.match(router, /getUserTelegram\(params\.userId\)/);
  assert.match(router, /telegram_not_confirmed/);
  assert.match(router, /coin\.config\?\.telegramEnabled === false/);
  assert.match(price, /allActive = alerts\.filter\(a => a\.isActive && !a\.triggered/);
  assert.match(price, /telegramConfig\?\.confirmedAt/);
  assert.doesNotMatch(price, /isUserNotificationCategoryAllowed|isUserTelegramCategoryAllowed/);
  assert.doesNotMatch(router, /isUserTelegramCategoryAllowed/);
});
