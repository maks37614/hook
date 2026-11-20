export const TRADING_SESSIONS = [
  { id: 'sydney', city: 'Сідней', country: 'Австралія', flag: '🇦🇺', region: 'Тихоокеанська', timeZone: 'Australia/Sydney', opens: 8, closes: 17 },
  { id: 'tokyo', city: 'Токіо', country: 'Японія', flag: '🇯🇵', region: 'Азійська', timeZone: 'Asia/Tokyo', opens: 9, closes: 18 },
  { id: 'london', city: 'Лондон', country: 'Велика Британія', flag: '🇬🇧', region: 'Європейська', timeZone: 'Europe/London', opens: 8, closes: 17 },
  { id: 'new-york', city: 'Нью-Йорк', country: 'США', flag: '🇺🇸', region: 'Американська', timeZone: 'America/New_York', opens: 8, closes: 17 },
] as const;

// Conventional regional activity windows, not opening hours of crypto exchanges.
// https://www.oanda.com/us-en/skills-and-insights/education/trading-asset-classes/forex/when-is-the-best-time-for-forex-trading/
export type TradingSession = typeof TRADING_SESSIONS[number];
const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([timeZone, options]);
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', ...options }));
  return formatters.get(key)!;
}

export function resolveTimeZone(value?: string): string {
  if (value && value !== 'auto') {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: value }); return value; } catch {}
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatZonedTime(date: Date, timeZone: string, seconds = false): string {
  return formatter(timeZone, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(date);
}

export function formatTimeZoneOffset(date: Date, timeZone: string): string {
  return formatter(timeZone, { timeZoneName: 'shortOffset' }).formatToParts(date)
    .find(part => part.type === 'timeZoneName')!.value.replace('GMT', 'UTC');
}

const POPULAR_TIME_ZONES: Record<string, string> = {
  UTC: 'UTC', 'Europe/Kyiv': 'Київ', 'Europe/Kiev': 'Київ', 'Europe/Warsaw': 'Варшава',
  'Europe/London': 'Лондон', 'Europe/Berlin': 'Берлін', 'Europe/Paris': 'Париж',
  'America/New_York': 'Нью-Йорк', 'America/Chicago': 'Чикаго', 'America/Los_Angeles': 'Лос-Анджелес',
  'Asia/Tokyo': 'Токіо', 'Asia/Shanghai': 'Шанхай', 'Asia/Hong_Kong': 'Гонконг',
  'Asia/Singapore': 'Сінгапур', 'Asia/Dubai': 'Дубай', 'Australia/Sydney': 'Сідней',
  'Asia/Kolkata': 'Колката', 'Asia/Kathmandu': 'Катманду',
  // Keep major Russian cities explicit: iOS/older Intl implementations can
  // omit them from supportedValuesOf, and the native picker is not searchable.
  'Europe/Kaliningrad': 'Калінінград', 'Europe/Moscow': 'Москва',
  'Europe/Samara': 'Самара', 'Asia/Yekaterinburg': 'Єкатеринбург',
  'Asia/Omsk': 'Омськ', 'Asia/Novosibirsk': 'Новосибірськ',
  'Asia/Krasnoyarsk': 'Красноярськ', 'Asia/Irkutsk': 'Іркутськ',
  'Asia/Yakutsk': 'Якутськ', 'Asia/Vladivostok': 'Владивосток',
  'Asia/Magadan': 'Магадан', 'Asia/Kamchatka': 'Камчатка',
  'Asia/Anadyr': 'Анадир', 'Asia/Sakhalin': 'Сахалін',
  'Europe/Kirov': 'Кіров', 'Europe/Volgograd': 'Волгоград',
  'Europe/Astrakhan': 'Астрахань', 'Europe/Saratov': 'Саратов',
  'Europe/Ulyanovsk': 'Ульяновськ', 'Asia/Barnaul': 'Барнаул',
  'Asia/Tomsk': 'Томськ', 'Asia/Novokuznetsk': 'Новокузнецьк',
  'Asia/Chita': 'Чита', 'Asia/Khandyga': 'Хандига',
  'Asia/Ust-Nera': 'Усть-Нера', 'Asia/Srednekolymsk': 'Середньоколимськ',
};

const TIME_ZONE_CITY_TRANSLATIONS: Record<string, { en: string; ru: string; pl: string }> = {
  'Київ': { en: 'Kyiv', ru: 'Киев', pl: 'Kijów' },
  'Варшава': { en: 'Warsaw', ru: 'Варшава', pl: 'Warszawa' },
  'Лондон': { en: 'London', ru: 'Лондон', pl: 'Londyn' },
  'Берлін': { en: 'Berlin', ru: 'Берлин', pl: 'Berlin' },
  'Париж': { en: 'Paris', ru: 'Париж', pl: 'Paryż' },
  'Нью-Йорк': { en: 'New York', ru: 'Нью-Йорк', pl: 'Nowy Jork' },
  'Чикаго': { en: 'Chicago', ru: 'Чикаго', pl: 'Chicago' },
  'Лос-Анджелес': { en: 'Los Angeles', ru: 'Лос-Анджелес', pl: 'Los Angeles' },
  'Токіо': { en: 'Tokyo', ru: 'Токио', pl: 'Tokio' },
  'Шанхай': { en: 'Shanghai', ru: 'Шанхай', pl: 'Szanghaj' },
  'Гонконг': { en: 'Hong Kong', ru: 'Гонконг', pl: 'Hongkong' },
  'Сінгапур': { en: 'Singapore', ru: 'Сингапур', pl: 'Singapur' },
  'Дубай': { en: 'Dubai', ru: 'Дубай', pl: 'Dubaj' },
  'Сідней': { en: 'Sydney', ru: 'Сидней', pl: 'Sydney' },
  'Колката': { en: 'Kolkata', ru: 'Колката', pl: 'Kalkuta' },
  'Катманду': { en: 'Kathmandu', ru: 'Катманду', pl: 'Katmandu' },
  'Калінінград': { en: 'Kaliningrad', ru: 'Калининград', pl: 'Kaliningrad' },
  'Москва': { en: 'Moscow', ru: 'Москва', pl: 'Moskwa' },
  'Самара': { en: 'Samara', ru: 'Самара', pl: 'Samara' },
  'Єкатеринбург': { en: 'Yekaterinburg', ru: 'Екатеринбург', pl: 'Jekaterynburg' },
  'Омськ': { en: 'Omsk', ru: 'Омск', pl: 'Omsk' },
  'Новосибірськ': { en: 'Novosibirsk', ru: 'Новосибирск', pl: 'Nowosybirsk' },
  'Красноярськ': { en: 'Krasnoyarsk', ru: 'Красноярск', pl: 'Krasnojarsk' },
  'Іркутськ': { en: 'Irkutsk', ru: 'Иркутск', pl: 'Irkuck' },
  'Якутськ': { en: 'Yakutsk', ru: 'Якутск', pl: 'Jakuck' },
  'Владивосток': { en: 'Vladivostok', ru: 'Владивосток', pl: 'Władywostok' },
  'Магадан': { en: 'Magadan', ru: 'Магадан', pl: 'Magadan' },
  'Камчатка': { en: 'Kamchatka', ru: 'Камчатка', pl: 'Kamczatka' },
  'Анадир': { en: 'Anadyr', ru: 'Анадырь', pl: 'Anadyr' },
  'Сахалін': { en: 'Sakhalin', ru: 'Сахалин', pl: 'Sachalin' },
  'Кіров': { en: 'Kirov', ru: 'Киров', pl: 'Kirow' },
  'Волгоград': { en: 'Volgograd', ru: 'Волгоград', pl: 'Wołgograd' },
  'Астрахань': { en: 'Astrakhan', ru: 'Астрахань', pl: 'Astrachań' },
  'Саратов': { en: 'Saratov', ru: 'Саратов', pl: 'Saratów' },
  'Ульяновськ': { en: 'Ulyanovsk', ru: 'Ульяновск', pl: 'Uljanowsk' },
  'Барнаул': { en: 'Barnaul', ru: 'Барнаул', pl: 'Barnauł' },
  'Томськ': { en: 'Tomsk', ru: 'Томск', pl: 'Tomsk' },
  'Новокузнецьк': { en: 'Novokuznetsk', ru: 'Новокузнецк', pl: 'Nowokuźnieck' },
  'Чита': { en: 'Chita', ru: 'Чита', pl: 'Czyta' },
  'Хандига': { en: 'Khandyga', ru: 'Хандыга', pl: 'Chandyga' },
  'Усть-Нера': { en: 'Ust-Nera', ru: 'Усть-Нера', pl: 'Ust-Niera' },
  'Середньоколимськ': { en: 'Srednekolymsk', ru: 'Среднеколымск', pl: 'Sredniekołymsk' },
};

export function getTimeZoneChoices(selected?: string, language: 'uk' | 'en' | 'ru' | 'pl' = 'uk'): Array<{ value: string; label: string }> {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') || [];
  const seen = new Set<string>();
  const now = new Date();
  return [...new Set([...(selected && selected !== 'auto' ? [selected] : []), ...Object.keys(POPULAR_TIME_ZONES), resolveTimeZone(selected), ...supported])]
    .filter(value => {
      try {
        const canonical = new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
        if (seen.has(canonical)) return false;
        seen.add(canonical);
        return true;
      } catch { return false; }
    })
    .map(value => {
      const city = POPULAR_TIME_ZONES[value];
      const localized = city && language !== 'uk' ? TIME_ZONE_CITY_TRANSLATIONS[city]?.[language] ?? city : city;
      // Display the actual sign for the confusing POSIX Etc/GMT zones:
      // Etc/GMT+3 is UTC-3, not Moscow's UTC+3.
      const offset = city || value.startsWith('Etc/GMT') ? ` (${formatTimeZoneOffset(now, value)})` : '';
      return { value, label: localized ? `${localized}${offset} · ${value}` : `${value.replaceAll('_', ' ')}${offset}` };
    });
}

function zonedParts(date: Date, timeZone: string) {
  const parts = formatter(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

// Convert local wall time with that date's IANA offset, including DST in each region.
function localHourToDate(day: Date, hour: number, timeZone: string): Date {
  const target = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
  let timestamp = target;
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(new Date(timestamp), timeZone);
    const localTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const next = target - (localTimestamp - timestamp);
    if (next === timestamp) break;
    timestamp = next;
  }
  return new Date(timestamp);
}

export function getSessionWindow(session: TradingSession, now: Date) {
  const today = zonedParts(now, session.timeZone);
  const localDay = Date.UTC(today.year, today.month - 1, today.day);
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(localDay + offset * DAY);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const startsAt = localHourToDate(day, session.opens, session.timeZone);
    const endsAt = localHourToDate(day, session.closes, session.timeZone);
    if (endsAt.getTime() <= now.getTime()) continue;
    const active = startsAt.getTime() <= now.getTime();
    const nextChangeAt = active ? endsAt : startsAt;
    return { startsAt, endsAt, active, nextChangeAt,
      progress: active ? (now.getTime() - startsAt.getTime()) / (endsAt.getTime() - startsAt.getTime()) : 0 };
  }
  throw new Error('No upcoming trading session');
}

type SessionLanguage = 'uk' | 'en' | 'ru' | 'pl';
const sessionDateLocales: Record<SessionLanguage, string> = {
  uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU', pl: 'pl-PL',
};
const sessionDurationUnits: Record<SessionLanguage, { hour: string; minute: string }> = {
  uk: { hour: 'г', minute: 'хв' },
  en: { hour: 'h', minute: 'm' },
  ru: { hour: 'ч', minute: 'мин' },
  pl: { hour: 'godz.', minute: 'min' },
};

export function sessionDateLabel(startsAt: Date, endsAt: Date, timeZone: string, language: SessionLanguage = 'uk'): string {
  const dateFormat = new Intl.DateTimeFormat(sessionDateLocales[language], { timeZone, day: '2-digit', month: '2-digit', weekday: 'short' });
  const start = dateFormat.format(startsAt);
  const end = dateFormat.format(endsAt);
  return start === end ? start : `${start} → ${end}`;
}

export function formatSessionCountdown(milliseconds: number, language: SessionLanguage = 'uk'): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const units = sessionDurationUnits[language];
  return hours
    ? `${hours}${units.hour} ${minutes % 60}${units.minute}`
    : `${minutes}${units.minute}`;
}
