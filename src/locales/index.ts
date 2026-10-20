import uk from './uk';
import en from './en';
import ru from './ru';
import pl from './pl';
import type { LocaleFile, LocaleParams, SupportedLanguage } from './types';
import sitePhrases from './sitePhrases';
import hookchartPhrases from './hookchartPhrases';

export type { LocaleFile, LocaleParams, SupportedLanguage } from './types';

export const locales: Record<SupportedLanguage, LocaleFile> = { uk, en, ru, pl };

for (const language of Object.keys(locales) as SupportedLanguage[]) {
  locales[language].phrases = {
    ...locales[language].phrases,
    ...sitePhrases[language],
    ...hookchartPhrases[language],
  };
}

export const supportedLanguages = Object.keys(locales) as SupportedLanguage[];

export function normalizeLanguage(value?: string | null): SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage) ? value as SupportedLanguage : 'uk';
}

export function interpolate(template: string, params: LocaleParams = {}): string {
  return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function translateKey(language: SupportedLanguage, key: string, params?: LocaleParams): string {
  const value = locales[language]?.strings[key] ?? locales.uk.strings[key] ?? key;
  return interpolate(value, params);
}

export function telegramText(language: SupportedLanguage, key: string, params?: LocaleParams): string {
  const value = locales[language]?.telegram[key] ?? locales.uk.telegram[key] ?? key;
  return interpolate(value, params);
}

const semanticAliases = new Map<string, string>();
for (const key of Object.keys(locales.uk.strings)) {
  for (const locale of Object.values(locales)) {
    const value = locale.strings[key]?.trim();
    if (value) semanticAliases.set(value, key);
  }
}

const phraseAliases = new Map<string, string>();
for (const source of Object.keys(locales.uk.phrases)) {
  phraseAliases.set(source.trim(), source);
  for (const locale of Object.values(locales)) {
    const value = locale.phrases[source]?.trim();
    if (value) phraseAliases.set(value, source);
  }
}
const phrasePrefixAliases = Array.from(phraseAliases.entries()).filter(([alias]) => alias.endsWith(':'));

interface PhrasePattern {
  source: string;
  regex: RegExp;
  keys: string[];
}

function compilePhrasePattern(template: string): { regex: RegExp; keys: string[] } | null {
  const tokenRegex = /\{\{([A-Za-z0-9_]+)\}\}/g;
  const keys: string[] = [];
  let pattern = '^';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const escapeRegex = (value: string) => value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

  while ((match = tokenRegex.exec(template))) {
    pattern += escapeRegex(template.slice(lastIndex, match.index));
    pattern += '([\\s\\S]+?)';
    keys.push(match[1]);
    lastIndex = match.index + match[0].length;
  }

  if (keys.length === 0) return null;
  pattern += escapeRegex(template.slice(lastIndex));
  pattern += '$';
  return { regex: new RegExp(pattern), keys };
}

const phrasePatterns: PhrasePattern[] = [];
for (const source of Object.keys(locales.uk.phrases)) {
  if (!source.includes('{{')) continue;
  for (const locale of Object.values(locales)) {
    const template = locale.phrases[source] ?? source;
    const compiled = compilePhrasePattern(template);
    if (compiled) phrasePatterns.push({ source, ...compiled });
  }
}

// Prefer the most specific dynamic templates first so a broad template cannot
// consume the tail of a longer sentence (for example formation + extreme context).
phrasePatterns.sort((a, b) => b.source.length - a.source.length);

export function translatePhrase(language: SupportedLanguage, input: string): string {
  if (!input) return input;
  const leading = input.match(/^\s*/)?.[0] ?? '';
  const trailing = input.match(/\s*$/)?.[0] ?? '';
  const trimmed = input.trim();
  if (!trimmed) return input;

  const semanticKey = semanticAliases.get(trimmed);
  if (semanticKey) return leading + (locales[language].strings[semanticKey] ?? trimmed) + trailing;

  const phraseKey = phraseAliases.get(trimmed);
  if (phraseKey) return leading + (locales[language].phrases[phraseKey] ?? phraseKey) + trailing;

  // Support runtime UI strings with values embedded in them.
  for (const pattern of phrasePatterns) {
    const match = trimmed.match(pattern.regex);
    if (!match) continue;
    const params: LocaleParams = {};
    pattern.keys.forEach((key, index) => {
      const captured = match[index + 1] ?? '';
      const capturedSemanticKey = semanticAliases.get(captured);
      if (capturedSemanticKey) {
        params[key] = locales[language].strings[capturedSemanticKey] ?? captured;
        return;
      }
      const capturedPhraseKey = phraseAliases.get(captured);
      params[key] = capturedPhraseKey
        ? locales[language].phrases[capturedPhraseKey] ?? captured
        : captured;
    });
    const template = locales[language].phrases[pattern.source] ?? pattern.source;
    return leading + interpolate(template, params) + trailing;
  }

  // Support composite UI labels such as:
  // "Пробій рівня · ПІДТВЕРДЖЕНО" or "Київ · Europe/Kyiv".
  if (trimmed.includes(' · ')) {
    const parts = trimmed.split(' · ');
    const translatedParts = parts.map((part) => {
      const semanticPartKey = semanticAliases.get(part);
      if (semanticPartKey) return locales[language].strings[semanticPartKey] ?? part;
      const phrasePartKey = phraseAliases.get(part);
      if (phrasePartKey) return locales[language].phrases[phrasePartKey] ?? part;
      return part;
    });
    if (translatedParts.some((part, index) => part !== parts[index])) {
      return leading + translatedParts.join(' · ') + trailing;
    }
  }

  // Support dynamic values with a translated prefix, e.g. "✅ Знайдено Chat ID: 123456".
  for (const [alias, key] of phrasePrefixAliases) {
    if (trimmed.startsWith(alias) && trimmed.length > alias.length) {
      const translatedPrefix = locales[language].phrases[key] ?? alias;
      return leading + translatedPrefix + trimmed.slice(alias.length) + trailing;
    }
  }

  return input;
}
