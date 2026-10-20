export type SupportedLanguage = 'uk' | 'en' | 'ru' | 'pl';

export interface LocaleFile {
  code: SupportedLanguage;
  label: string;
  strings: Record<string, string>;
  phrases: Record<string, string>;
  telegram: Record<string, string>;
}

export type LocaleParams = Record<string, string | number | boolean | null | undefined>;
