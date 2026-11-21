import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalPagePhraseRows } from '../src/locales/terminalPage20261115';
import { readFileSync } from 'node:fs';
import { TRADING_SESSIONS, formatSessionCountdown, formatTimeZoneOffset, formatZonedTime, getSessionWindow, getUsEquitiesPremarketWindow, getTimeZoneChoices, resolveTimeZone, sessionDateLabel } from '../src/utils/tradingSessions';

const session = (id: string) => TRADING_SESSIONS.find(item => item.id === id)!;

test('clock uses the selected IANA zone with 24-hour, fractional-offset and midnight times', () => {
  const date = new Date('2026-01-05T00:00:00Z');
  assert.equal(formatZonedTime(date, 'Europe/Warsaw', true), '01:00:00');
  assert.equal(formatZonedTime(date, 'Asia/Kolkata', true), '05:30:00');
  assert.equal(formatZonedTime(date, 'UTC', true), '00:00:00');
  assert.equal(formatTimeZoneOffset(date, 'Asia/Kathmandu'), 'UTC+5:45');
});

test('profile time-zone choices include UTC, Kyiv and valid zones outside the popular list', () => {
  const choices = getTimeZoneChoices('Pacific/Chatham');
  for (const zone of ['UTC', 'Europe/Kyiv', 'Europe/Warsaw', 'Pacific/Chatham']) assert.ok(choices.some(item => item.value === zone));
  assert.equal(resolveTimeZone('Europe/Warsaw'), 'Europe/Warsaw');
  assert.equal(resolveTimeZone('not-a-zone'), resolveTimeZone('auto'));
  assert.equal(new Set(choices.map(choice => choice.value)).size, choices.length);
});

test('Russian time zones are explicit, localized and show the correct UTC direction', () => {
  const russianZones = [
    'Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara',
    'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk',
    'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk',
    'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka',
    'Asia/Anadyr', 'Asia/Sakhalin',
    'Europe/Kirov', 'Europe/Volgograd', 'Europe/Astrakhan',
    'Europe/Saratov', 'Europe/Ulyanovsk',
    'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk',
    'Asia/Chita', 'Asia/Khandyga', 'Asia/Ust-Nera', 'Asia/Srednekolymsk',
  ];
  const choices = getTimeZoneChoices('Europe/Moscow', 'ru');
  for (const zone of russianZones) {
    assert.ok(choices.some(choice => choice.value === zone), `missing ${zone}`);
  }
  assert.match(choices.find(choice => choice.value === 'Europe/Moscow')!.label, /Москва \(UTC\+3\)/);
  assert.match(getTimeZoneChoices('Europe/Moscow', 'en').find(choice => choice.value === 'Europe/Moscow')!.label, /Moscow/);
  assert.match(getTimeZoneChoices('Europe/Moscow', 'pl').find(choice => choice.value === 'Europe/Moscow')!.label, /Moskwa/);
  const reversed = getTimeZoneChoices('Etc/GMT+3', 'ru').find(choice => choice.value === 'Etc/GMT+3');
  assert.ok(reversed?.label.includes('UTC-3'), 'POSIX Etc/GMT+3 must not be mistaken for Moscow');
  assert.equal(new Set(choices.map(choice => choice.value)).size, choices.length);
});

test('active sessions include the open boundary and advance exactly at the close', () => {
  const before = getSessionWindow(session('london'), new Date('2026-01-05T07:59:59Z'));
  assert.equal(before.active, false);
  assert.equal(before.startsAt.toISOString(), '2026-01-05T08:00:00.000Z');
  const open = getSessionWindow(session('london'), new Date('2026-01-05T08:00:00Z'));
  assert.equal(open.active, true);
  assert.equal(open.progress, 0);
  const closed = getSessionWindow(session('london'), new Date('2026-01-05T17:00:00Z'));
  assert.equal(closed.active, false);
  assert.equal(closed.startsAt.toISOString(), '2026-01-06T08:00:00.000Z');
});

test('US and European DST transitions are calculated separately', () => {
  const now = new Date('2026-03-16T00:00:00Z');
  const london = getSessionWindow(session('london'), now);
  const newYork = getSessionWindow(session('new-york'), now);
  assert.equal(london.startsAt.toISOString(), '2026-03-16T08:00:00.000Z');
  assert.equal(newYork.startsAt.toISOString(), '2026-03-16T12:00:00.000Z');
  assert.equal(formatZonedTime(newYork.startsAt, 'Europe/Warsaw'), '13:00');
  const summer = getSessionWindow(session('london'), new Date('2026-07-06T00:00:00Z'));
  assert.equal(summer.startsAt.toISOString(), '2026-07-06T07:00:00.000Z');
  assert.equal(formatZonedTime(summer.startsAt, 'Europe/Warsaw'), '09:00');
});

test('Australian DST is independent of the northern hemisphere and Tokyo keeps the same offset', () => {
  const winter = getSessionWindow(session('sydney'), new Date('2026-07-05T20:00:00Z'));
  const summer = getSessionWindow(session('sydney'), new Date('2026-01-04T20:00:00Z'));
  assert.equal(winter.startsAt.toISOString(), '2026-07-05T22:00:00.000Z');
  assert.equal(summer.startsAt.toISOString(), '2026-01-04T21:00:00.000Z');
  for (const date of ['2026-01-05T00:00:00Z', '2026-07-06T00:00:00Z']) {
    const tokyo = getSessionWindow(session('tokyo'), new Date(date));
    assert.equal(tokyo.startsAt.getUTCHours(), 0);
    assert.equal(tokyo.endsAt.getUTCHours(), 9);
  }
});

test('weekends advance to the next regional weekday rather than marking crypto trading closed', () => {
  const now = new Date('2026-01-10T12:00:00Z');
  for (const item of TRADING_SESSIONS) {
    const next = getSessionWindow(item, now);
    assert.equal(next.active, false);
    assert.ok(next.startsAt.getTime() > now.getTime());
    assert.equal(formatZonedTime(next.startsAt, item.timeZone), `${String(item.opens).padStart(2, '0')}:00`);
  }
  assert.equal(getSessionWindow(session('new-york'), now).startsAt.toISOString(), '2026-01-12T13:00:00.000Z');
});

test('regional weekdays and session ranges can cross midnight in the profile time zone', () => {
  const sydney = getSessionWindow(session('sydney'), new Date('2026-07-05T22:30:00Z'));
  assert.equal(sydney.active, true, 'Monday in Sydney is still Sunday in UTC');
  assert.equal(formatZonedTime(sydney.startsAt, 'Europe/Warsaw'), '00:00');
  const newYork = getSessionWindow(session('new-york'), new Date('2026-01-05T12:00:00Z'));
  assert.ok(sessionDateLabel(newYork.startsAt, newYork.endsAt, 'Asia/Tokyo').includes('→'));
});

test('countdowns round up remaining minutes and keep progress within the active window', () => {
  assert.equal(formatSessionCountdown(1), '1хв');
  assert.equal(formatSessionCountdown(3_660_000), '1г 1хв');
  assert.equal(formatSessionCountdown(86_400_000), '24г 0хв');
  const active = getSessionWindow(session('new-york'), new Date('2026-01-05T17:30:00Z'));
  assert.equal(active.active, true);
  assert.equal(active.progress, 0.5);
});

test('Nasdaq US pre-market uses the official 04:00–09:30 New York window, not crypto hours', () => {
  const winter = getUsEquitiesPremarketWindow(new Date('2026-01-05T00:00:00Z'));
  assert.equal(winter.startsAt.toISOString(), '2026-01-05T09:00:00.000Z');
  assert.equal(winter.endsAt.toISOString(), '2026-01-05T14:30:00.000Z');
  assert.equal(formatZonedTime(winter.startsAt, 'America/New_York'), '04:00');
  assert.equal(formatZonedTime(winter.endsAt, 'America/New_York'), '09:30');
  assert.equal(formatZonedTime(winter.startsAt, 'Europe/Moscow'), '12:00');
  assert.equal(formatZonedTime(winter.endsAt, 'Europe/Moscow'), '17:30');
  assert.equal(formatZonedTime(winter.startsAt, 'Europe/Warsaw'), '10:00');
  assert.equal(formatZonedTime(winter.endsAt, 'Europe/Warsaw'), '15:30');
  assert.equal(winter.active, false);
  assert.equal(getUsEquitiesPremarketWindow(new Date('2026-01-05T09:00:00Z')).active, true);
  assert.equal(getUsEquitiesPremarketWindow(new Date('2026-01-05T14:30:00Z')).startsAt.toISOString(),
    '2026-01-06T09:00:00.000Z');
});

test('US pre-market DST tracks New York independently of European and Moscow clocks', () => {
  // On March 16, NY has already entered DST, but Warsaw has not.
  const march = getUsEquitiesPremarketWindow(new Date('2026-03-16T00:00:00Z'));
  assert.equal(march.startsAt.toISOString(), '2026-03-16T08:00:00.000Z');
  assert.equal(march.endsAt.toISOString(), '2026-03-16T13:30:00.000Z');
  assert.equal(formatZonedTime(march.startsAt, 'Europe/Warsaw'), '09:00');
  assert.equal(formatZonedTime(march.endsAt, 'Europe/Warsaw'), '14:30');
  assert.equal(formatZonedTime(march.startsAt, 'Europe/Moscow'), '11:00');
  assert.equal(formatZonedTime(march.endsAt, 'Europe/Moscow'), '16:30');
  const july = getUsEquitiesPremarketWindow(new Date('2026-07-06T00:00:00Z'));
  assert.equal(formatZonedTime(july.startsAt, 'Europe/Warsaw'), '10:00');
  assert.equal(formatZonedTime(july.endsAt, 'Europe/Warsaw'), '15:30');
  const november = getUsEquitiesPremarketWindow(new Date('2026-11-02T00:00:00Z'));
  assert.equal(formatZonedTime(november.startsAt, 'Europe/Moscow'), '12:00');
  assert.equal(formatZonedTime(november.endsAt, 'Europe/Moscow'), '17:30');
});

test('US pre-market weekend advances to Monday and never claims Saturday stock trading', () => {
  const saturday = getUsEquitiesPremarketWindow(new Date('2026-11-21T12:00:00Z'));
  assert.equal(saturday.active, false);
  assert.equal(saturday.startsAt.toISOString(), '2026-11-23T09:00:00.000Z');
  assert.equal(saturday.endsAt.toISOString(), '2026-11-23T14:30:00.000Z');
});

test('Terminal clock expands only the US pre-market and displays both ends in profile timezone', () => {
  const clock = readFileSync(new URL('../src/components/terminal/TerminalClock.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(terminal, /<TerminalClock timeZone=\{profile\?\.timeZone\}/);
  assert.match(clock, /session\.id === 'new-york' && <button/);
  assert.match(clock, /aria-expanded=\{preMarketExpanded\}/);
  assert.match(clock, /aria-controls="terminal-us-equities-premarket"/);
  assert.match(clock, /data-us-premarket/);
  assert.match(clock, /formatZonedTime\(preMarket\.startsAt, timeZone\)/);
  assert.match(clock, /formatZonedTime\(preMarket\.endsAt, timeZone\)/);
  assert.match(clock, /sessionDateLabel\(preMarket\.startsAt, preMarket\.endsAt, timeZone, language\)/);
  assert.match(clock, /getUsEquitiesPremarketWindow\(now\)/);
  assert.doesNotMatch(clock, /fetch\(|new WebSocket\(/);
});

test('US pre-market expansion labels exist in Ukrainian, English, Russian and Polish', () => {
  const required = [
    'Премаркет', 'Розгорнути премаркет США', 'Згорнути премаркет США',
    'Премаркет акцій США · Nasdaq', 'Премаркет триває',
    'Наступний премаркет', 'Відкриття', 'Закриття',
    'Премаркет Nasdaq: 04:00–09:30 за Нью-Йорком у торгові будні; свята не враховано. Це акції США, не криптобіржа.',
  ];
  for (const key of required) {
    const row = terminalPagePhraseRows.find(values => values[0] === key);
    assert.ok(row, `Missing pre-market translation: ${key}`);
    assert.equal(row!.length, 4, `All four languages required for ${key}`);
    for (const translation of row!) assert.ok(translation.trim().length > 0);
  }
});
