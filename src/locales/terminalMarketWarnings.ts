import { translatePhrase, type SupportedLanguage } from './index';

/** Keep exchange diagnostics readable while translating the user-facing state. */
export function localizeTerminalMarketWarning(language: SupportedLanguage, warning: string | null): string | null {
  if (!warning) return warning;
  return warning.split('; ').map(part => {
    const match = part.match(/^(Binance|Bybit) (Spot|Futures): (показано останні отримані дані|дані недоступні)(?: \((.*)\))?$/);
    if (!match) return translatePhrase(language, part);
    const [, exchange, market, status, error] = match;
    const marketLabel = market === 'Futures'
      ? translatePhrase(language, 'Фʼючерси')
      : translatePhrase(language, 'Спот');
    const errorLabel = error ? ` (${translatePhrase(language, error)})` : '';
    return `${exchange} ${marketLabel}: ${translatePhrase(language, status)}${errorLabel}`;
  }).join('; ');
}
