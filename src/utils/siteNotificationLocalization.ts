import { translateKey, translatePhrase, type SupportedLanguage } from '../locales';
import type { SiteNotificationKind } from './siteNotifications';

/**
 * Translate notification display copy without rewriting persisted events,
 * changing their IDs, notification timing, or routing data.
 */
const titlePrefixes = [
  ['Ціновий рівень досягнуто · ', 'ui.notifications.title.priceReached'],
  ['Ціновий рівень · ', 'ui.notifications.title.priceLevel'],
  ['≈ Сплеск волатильності · ', 'ui.notifications.title.volatility'],
  ['▲ Імпульс зростання · ', 'ui.notifications.title.impulseUp'],
  ['▼ Імпульс падіння · ', 'ui.notifications.title.impulseDown'],
  ['Каскад ліквідацій ', 'ui.notifications.title.cascade'],
  ['Потік ліквідацій недоступний · ', 'ui.notifications.title.liqUnavailable'],
] as const;

export function localizeNotificationLabel(language: SupportedLanguage, label: string): string {
  for (const [prefix, key] of titlePrefixes) {
    if (label.startsWith(prefix)) return translateKey(language, key) + label.slice(prefix.length);
  }
  return translatePhrase(language, label);
}

export function localizeNotificationDescription(
  language: SupportedLanguage,
  kind: SiteNotificationKind,
  description: string,
): string {
  if (kind === 'price') {
    const reached = /^Рівень (.+) досягнуто$/.exec(description);
    if (reached) return translateKey(language, 'ui.notifications.levelReached', { level: reached[1] });
    const history = /^Ціна ([^ ]+) · ціль ([^ ]+)( · .*)?$/.exec(description);
    if (history) return translateKey(language, 'ui.notifications.priceHistory', {
      price: history[1], target: history[2],
    }) + (history[3] || '');
  }
  if (kind === 'impulse' || kind === 'volatility') {
    const parts = /^(.+?) за (.+?) \(вікно (\d+) хв\)( · .*)?$/.exec(description);
    if (parts) {
      const rangePrefix = 'Діапазон коливань ';
      const subject = parts[1].startsWith(rangePrefix)
        ? translateKey(language, 'ui.notifications.fluctuationRange', { value: parts[1].slice(rangePrefix.length) })
        : parts[1];
      return translateKey(language, 'ui.notifications.elapsedWindow', {
        subject, elapsed: parts[2], minutes: parts[3], suffix: parts[4] || '',
      });
    }
  }
  if (kind === 'liquidations') {
    const cascade = /^(\d+) ліквідацій за 5 хв · (\$[\d,. ]+)$/.exec(description);
    if (cascade) return translateKey(language, 'ui.notifications.cascadeDescription', {
      count: cascade[1], usd: cascade[2],
    });
  }
  return translatePhrase(language, description);
}
