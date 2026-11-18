import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeNotificationDescription, localizeNotificationLabel } from '../src/utils/siteNotificationLocalization';

test('site alert titles localize on display while retaining raw symbol and route text', () => {
  assert.equal(localizeNotificationLabel('uk', '▲ Імпульс зростання · '), '▲ Імпульс зростання · ');
  assert.equal(localizeNotificationLabel('en', '▲ Імпульс зростання · '), '▲ Upward impulse · ');
  assert.equal(localizeNotificationLabel('ru', '▼ Імпульс падіння · '), '▼ Импульс падения · ');
  assert.equal(localizeNotificationLabel('pl', '≈ Сплеск волатильності · '), '≈ Skok zmienności · ');
  assert.equal(localizeNotificationLabel('en', 'Каскад ліквідацій LONG · '), 'Liquidation cascade LONG · ');
  assert.equal(localizeNotificationLabel('pl', 'Ціновий рівень · '), 'Poziom ceny · ');
  assert.equal(localizeNotificationLabel('en', 'Custom signal · '), 'Custom signal · ');
});

test('dynamic notification descriptions translate numbers but preserve notes and exchanges', () => {
  assert.equal(localizeNotificationDescription('en','price','Рівень 100.5 досягнуто'), 'Level 100.5 reached');
  assert.equal(localizeNotificationDescription('pl','price','Ціна 101 · ціль 102 · moja notatka'), 'Cena 101 · cel 102 · moja notatka');
  assert.equal(localizeNotificationDescription('en','volatility',
    'Діапазон коливань 2.15% за 5m (вікно 5 хв) · BINANCE · futures'),
    'Fluctuation range 2.15% over 5m (5 min window) · BINANCE · futures');
  assert.equal(localizeNotificationDescription('ru','liquidations',
    '9 ліквідацій за 5 хв · $12,000'), '9 ликвидаций за 5 мин · $12,000');
  assert.equal(localizeNotificationDescription('en','system',
    'Пристрій перейшов в офлайн. Ринкові дані можуть бути застарілими.'),
    'Your device is offline. Market data may be outdated.');
  assert.equal(localizeNotificationDescription('en','system','Custom note BTCUSDT'),'Custom note BTCUSDT');
});

test('notification rendering translates labels without modifying stored items or click targets', () => {
  const raw = 'Ціновий рівень досягнуто · BTCUSDT';
  const localized = localizeNotificationLabel('en', raw);
  assert.equal(raw, 'Ціновий рівень досягнуто · BTCUSDT');
  assert.equal(localized, 'Price level reached · BTCUSDT');
});
