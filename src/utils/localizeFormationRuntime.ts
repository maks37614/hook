import type { SupportedLanguage } from '../locales/types';
import { interpolate, translatePhrase } from '../locales';
import { translateFormationDynamicText } from '../locales/formationDynamicText';

// Precompile once: many Formation cards can be visible at the same time.
const NUMERIC_TEMPLATES: ReadonlyArray<{
  pattern: RegExp;
  template: string;
  fields: readonly string[];
}> = [
  {
    pattern: /^R:R ([\d.,]+) нижче мінімуму ([\d.,]+)$/u,
    template: 'R:R {{ratio}} нижче мінімуму {{min}}',
    fields: ['ratio', 'min'],
  },
  {
    pattern: /^Якість геометрії\/формації: ([\d.,]+)\/100$/u,
    template: 'Якість геометрії/формації: {{score}}/100',
    fields: ['score'],
  },
  {
    pattern: /^Найближчий ключовий рівень: ([\d.,]+)%$/u,
    template: 'Найближчий ключовий рівень: {{pct}}%',
    fields: ['pct'],
  },
  {
    pattern: /^Відстань до рівня опору \/ шиї: ([\d.,]+)%$/u,
    template: 'Відстань до рівня опору / шиї: {{pct}}%',
    fields: ['pct'],
  },
  {
    pattern: /^Відстань до рівня підтримки \/ шиї: ([\d.,]+)%$/u,
    template: 'Відстань до рівня підтримки / шиї: {{pct}}%',
    fields: ['pct'],
  },
  {
    pattern: /^ATR\/price ([\d.,]+)%$/u,
    template: 'ATR/price {{pct}}%',
    fields: ['pct'],
  },
  {
    pattern: /^data=([A-Z]+), candles=([A-Z]+), lookAhead=([A-Z]+), closed=([A-Z]+)$/u,
    template: 'data={{data}}, candles={{candles}}, lookAhead={{lookAhead}}, closed={{closed}}',
    fields: ['data', 'candles', 'lookAhead', 'closed'],
  },
  {
    pattern: /^(\d+) підтверджених тестів екстремуму$/u,
    template: '{{count}} підтверджених тестів екстремуму',
    fields: ['count'],
  },
];


/**
 * The scanner stores language-independent prices, signals and Ukrainian source
 * evidence. Translate only at the UI boundary, including numeric evidence and
 * multi-part status labels; do not mutate the formation or its validation.
 */
export function localizeFormationRuntime(language: SupportedLanguage, source: string): string {
  if (!source) return source;

  // Keep a whole phrase (such as "Flow: no data · no penalty") together first.
  const exact = translatePhrase(language, source);
  if (exact !== source) return exact;

  // Translate numeric scanner descriptions and evidence with bounded templates.
  // Fallback preserves unrecognized exchange payloads verbatim.
  const templated = translateFormationDynamicText(language, source, part => translatePhrase(language, part));
  if (templated !== source) return templated;

  // Scanner status labels, RVOL notes and confluence conflicts use a middle dot.
  if (source.includes(' · ')) {
    return source.split(' · ').map(part => localizeFormationRuntime(language, part)).join(' · ');
  }

  for (const rule of NUMERIC_TEMPLATES) {
    const match = rule.pattern.exec(source);
    if (!match) continue;
    const params: Record<string, string> = {};
    rule.fields.forEach((name, index) => { params[name] = match[index + 1]; });
    return interpolate(translatePhrase(language, rule.template), params);
  }

  const context = /^(.+?); відстань ([\d.,]+)%; підхід (.+?); сила ([\d.,]+)\/100$/u.exec(source);
  if (context) {
    return interpolate(
      translatePhrase(language, '{{role}}; відстань {{pct}}%; підхід {{approach}}; сила {{strength}}/100'),
      {
        role: localizeFormationRuntime(language, context[1]),
        pct: context[2],
        approach: localizeFormationRuntime(language, context[3]),
        strength: context[4],
      },
    );
  }

  // An unknown exchange/scanner description must remain visible, not be
  // rewritten with a misleading or fabricated meaning.
  return source;
}
