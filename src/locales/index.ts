import uk from './uk';
import en from './en';
import ru from './ru';
import pl from './pl';
import type { LocaleFile, LocaleParams, SupportedLanguage } from './types';
import hookchartPhrases from './hookchartPhrases';
import { formationsPagePhrases } from './formationsPagePhrases';
import { formationRuntimePhrases } from './formationRuntime20261115';
import { formationDetailsPhrases } from './formationDetails20261115';
import { formationControlPhrases } from './formationControls20261115';
import { earlyWmPhrases } from './earlyWmMore20261115';
import { formationCardMorePhrases } from './formationCardMore20261115';
import { extraPhrases, extraStrings } from './extraPhrases';
import { auditedPhrases } from './audit20261114';
import { auditedStrings } from './auditDynamic20261114';
import { audit20261115Phrases } from './audit20261115';
import { audit20261115Alerts } from './audit20261115Alerts';
import { audit20261115Settings } from './audit20261115Settings';
import { audit20261115Analysis } from './audit20261115Analysis';
import { audit20261115Replay } from './audit20261115Replay';
import { replayDynamicStrings } from './replayDynamic20261115';
import { replayStaticStrings } from './replayStatic20261115';
import { replayChartUiStrings } from './replayChartUi20261115';
import { screenerNotificationStrings } from './screenerNotifications20261115';
import { screenerMainStrings } from './screenerMain20261115';
import { formationFiltersTableStrings } from './formationFiltersTable20261115';
import { surveillanceCoreUiStrings } from './surveillanceCore20261115';
import { watchlistUiStrings } from './watchlistUi20261115';
import { archiveModalStrings } from './archiveModal20261115';
import { audit20261115Encyclopedia } from './audit20261115Encyclopedia';
import { encyclopediaMorePhrases } from './encyclopediaMore20261115';
import { classicMorePhrases } from './classicRulesMore20261115';
import { kotapychDetailedPhrases } from './kotapychDetails20261115';
import { kotapychAdvancedTopicPhrases } from './kotapychAdvancedTopics20261115';
import { kotapychDirectionPhrases } from './kotapychDirection20261115';
import { openInterestUiPhrases } from './openInterestUiMore20261115';
import { encyclopediaModalUiPhrases } from './encyclopediaModalUi20261115';
import { terminalPagePhrases, terminalPageStrings } from './terminalPage20261115';
import { terminalWidgetMorePhrases } from './terminalWidgetMore20261116';
import { terminalSettingsDrawerStrings } from './terminalSettingsDrawer20261115';
import { profileLanguagePhrases } from './profileLanguage20261115';
import { profileDynamicPhrases } from './profileDynamic20261115';
import { profileContinuationPhrases } from './profileContinuation20261115';
import { profileAuthTelegramPhrases } from './profileAuthTelegram20261115';
import { profileTelegramHistoryPhrases } from './profileTelegramHistory20261115';
import { profileNotificationHelpPhrases } from './profileNotificationHelp20261115';
import { profileChartVisualPhrases } from './profileChartVisual20261115';
import { hookchartSettingsAuditPhrases } from './hookchartSettingsAudit20261115';
import { metaScalpModalPhrases } from './metaScalpModal20261115';
import { sharedControlPhrases } from './sharedControls20261115';
import { fullscreenChartPhrases } from './fullscreenChart20261115';
import { formationChartControls } from './formationChartControls20261115';
import { exchangeScanErrorPhrases } from './exchangeScanError20261115';

export type { LocaleFile, LocaleParams, SupportedLanguage } from './types';

export const locales: Record<SupportedLanguage, LocaleFile> = { uk, en, ru, pl };

for (const language of Object.keys(locales) as SupportedLanguage[]) {
  const strings = { ...auditedStrings[language], ...extraStrings[language], ...locales[language].strings, ...terminalPageStrings[language], ...terminalSettingsDrawerStrings[language], ...replayDynamicStrings[language], ...replayStaticStrings[language], ...replayChartUiStrings[language], ...archiveModalStrings[language], ...screenerNotificationStrings[language], ...screenerMainStrings[language], ...watchlistUiStrings[language], ...formationFiltersTableStrings[language], ...surveillanceCoreUiStrings[language] };
  const phrases = {
    ...classicMorePhrases[language],
    ...encyclopediaMorePhrases[language],
    ...kotapychDetailedPhrases[language],
    ...kotapychAdvancedTopicPhrases[language],
    ...kotapychDirectionPhrases[language],
    ...openInterestUiPhrases[language],
    ...encyclopediaModalUiPhrases[language],
    ...auditedPhrases[language],
    ...extraPhrases[language],
    ...locales[language].phrases,
    ...hookchartPhrases[language],
    ...formationsPagePhrases[language],
    ...earlyWmPhrases[language],
    ...formationCardMorePhrases[language],
    // Latest, explicitly reviewed translations override older wording.
    ...audit20261115Phrases[language],
    ...audit20261115Alerts[language],
    ...audit20261115Settings[language],
    ...audit20261115Analysis[language],
    ...audit20261115Replay[language],
    ...audit20261115Encyclopedia[language],
    ...formationDetailsPhrases[language],
    ...formationControlPhrases[language],
    ...terminalPagePhrases[language],
    ...terminalWidgetMorePhrases[language],
    ...profileLanguagePhrases[language],
    ...profileDynamicPhrases[language],
    ...profileContinuationPhrases[language],
    ...profileAuthTelegramPhrases[language],
    ...profileTelegramHistoryPhrases[language],
    ...profileNotificationHelpPhrases[language],
    ...profileChartVisualPhrases[language],
    ...hookchartSettingsAuditPhrases[language],
    ...metaScalpModalPhrases[language],
    ...sharedControlPhrases[language],
    ...fullscreenChartPhrases[language],
    ...formationChartControls[language],
    ...exchangeScanErrorPhrases[language],
    // Runtime scanner labels must match the exact names emitted by patternRecognition.
    ...formationRuntimePhrases[language],
  };
  // Existing locale files can contain undefined placeholders for newly added UI.
  // They must never hide a complete translation from the audited fallback catalog.
  for (const [key, value] of Object.entries(extraStrings[language])) {
    if (!strings[key]) strings[key] = value;
  }
  for (const [key, value] of Object.entries(auditedStrings[language])) {
    if (!strings[key]) strings[key] = value;
  }
  for (const [source, value] of Object.entries(extraPhrases[language])) {
    if (!phrases[source]) phrases[source] = value;
  }
  for (const [source, value] of Object.entries(auditedPhrases[language])) {
    if (!phrases[source]) phrases[source] = value;
  }
  // Keep newly reviewed translations available even if an older catalog
  // defines an empty placeholder for a source label.
  for (const catalog of [
    audit20261115Phrases, audit20261115Alerts,
    audit20261115Settings, audit20261115Analysis,
    audit20261115Replay, audit20261115Encyclopedia, terminalPagePhrases,
    profileLanguagePhrases, profileDynamicPhrases, profileContinuationPhrases, profileAuthTelegramPhrases, profileTelegramHistoryPhrases, profileNotificationHelpPhrases, profileChartVisualPhrases, metaScalpModalPhrases, sharedControlPhrases,
  ]) {
    for (const [source, value] of Object.entries(catalog[language])) {
      if (!phrases[source]) phrases[source] = value;
    }
  }
  for (const catalog of [encyclopediaMorePhrases, classicMorePhrases, kotapychDetailedPhrases, kotapychAdvancedTopicPhrases, kotapychDirectionPhrases, openInterestUiPhrases, encyclopediaModalUiPhrases]) {
    for (const [source, value] of Object.entries(catalog[language])) {
      if (!phrases[source]) phrases[source] = value;
    }
  }
  // Encyclopedia-specific terms take precedence over older generic aliases.
  for (const source of ['Скальпінг', 'Індикатори', 'Котапич'] as const) {
    phrases[source] = encyclopediaModalUiPhrases[language][source];
  }
  phrases['Словник позначень'] = classicMorePhrases[language]['Словник позначень'];
  // Resolve reused UI labels consistently in the Profile, chart and Telegram.
  phrases["Ф'ючерси"] = profileTelegramHistoryPhrases[language]["Ф'ючерси"];
  phrases['Обрані монети'] = profileLanguagePhrases[language]['Обрані монети'];
  locales[language].strings = strings;
  locales[language].phrases = phrases;
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
  // Telegram profile controls are stored under the telegram namespace in the
  // existing locale files. Those entries are UI labels, not bot message templates.
  const telegramUiKey = key.startsWith('telegram.');
  const value = locales[language]?.strings[key]
    ?? (telegramUiKey ? locales[language]?.telegram[key] : undefined)
    ?? locales.uk.strings[key]
    ?? (telegramUiKey ? locales.uk.telegram[key] : undefined)
    ?? key;
  return interpolate(value, params);
}

export function telegramText(language: SupportedLanguage, key: string, params?: LocaleParams): string {
  const value = locales[language]?.telegram[key] ?? locales.uk.telegram[key] ?? key;
  return interpolate(value.replace(/\\r\\n|\\n|\\r/g, '\n'), params);
}

const semanticAliases = new Map<string, string>();
for (const key of Object.keys(locales.uk.strings)) {
  for (const locale of Object.values(locales)) {
    const value = locale.strings[key]?.trim();
    if (value) semanticAliases.set(value, key);
  }
}

const phraseAliases = new Map<string, string>();
// Source labels must take precedence over aliases in other languages.
// Without this, a translated value can shadow a real Ukrainian phrase.
for (const source of Object.keys(locales.uk.phrases)) phraseAliases.set(source.trim(), source);
for (const source of Object.keys(locales.uk.phrases)) {
  for (const locale of Object.values(locales)) {
    const value = locale.phrases[source]?.trim();
    if (value && !phraseAliases.has(value)) phraseAliases.set(value, source);
  }
}

// JSX prose may contain indentation and line breaks between the same words.
// Match equivalent reviewed phrases without changing unknown text.
const normalizedPhraseAliases = new Map<string, string>();
for (const source of Object.keys(locales.uk.phrases)) {
  normalizedPhraseAliases.set(source.replace(/\s+/g, ' ').trim(), source);
}
for (const [alias, source] of phraseAliases) {
  const normalized = alias.replace(/\s+/g, ' ').trim();
  if (!normalizedPhraseAliases.has(normalized)) normalizedPhraseAliases.set(normalized, source);
}

export function translatePhrase(language: SupportedLanguage, input: string): string {
  if (!input) return input;
  const leading = input.match(/^\s*/)?.[0] ?? '';
  const trailing = input.match(/\s*$/)?.[0] ?? '';
  const trimmed = input.trim();
  if (!trimmed) return input;

  // Exact source phrases are canonical. Some new dynamic-string templates
  // share their Ukrainian text with pre-existing phrases; do not silently
  // replace a reviewed translation with a different semantic-key variant.
  const phraseKey = phraseAliases.get(trimmed) ?? normalizedPhraseAliases.get(trimmed.replace(/\s+/g, ' '));
  if (phraseKey) return leading + (locales[language].phrases[phraseKey] ?? phraseKey).trim() + trailing;

  const semanticKey = semanticAliases.get(trimmed);
  if (semanticKey) return leading + (locales[language].strings[semanticKey] ?? trimmed).trim() + trailing;

  return input;
}
