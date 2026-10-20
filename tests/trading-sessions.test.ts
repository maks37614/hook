import test from 'node:test';
import assert from 'node:assert/strict';
import { TRADING_SESSIONS, formatSessionCountdown, formatTimeZoneOffset, formatZonedTime, getSessionWindow, getTimeZoneChoices, resolveTimeZone, sessionDateLabel } from '../src/utils/tradingSessions';

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
