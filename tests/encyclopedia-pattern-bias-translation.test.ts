import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  localizeFormationGuideBias,
  localizeFormationGuideItem,
  type FormationGuideBias,
} from '../src/locales/formationGuideTranslations';

const languages = ['uk', 'en', 'ru', 'pl'] as const;
const directions: FormationGuideBias[] = ['bullish', 'bearish', 'neutral'];
const expected = {
  uk: ['ЛОНГ', 'ШОРТ', 'НЕЙТРАЛЬНО'],
  en: ['LONG', 'SHORT', 'NEUTRAL'],
  ru: ['ЛОНГ', 'ШОРТ', 'НЕЙТРАЛЬНО'],
  pl: ['LONG', 'SHORT', 'NEUTRALNY'],
} as const;

test('Encyclopedia pattern direction badge has correct wording in every language', () => {
  for (const language of languages) {
    for (const [i, direction] of directions.entries()) {
      assert.equal(localizeFormationGuideBias(language, direction), expected[language][i],
        language + ' ' + direction);
    }
  }
});

test('formation bias is still an immutable semantic direction, not a translated data value', () => {
  for (const language of languages) {
    for (const bias of directions) {
      const item = {
        id: 'volatility_squeeze', name: 'Приклад', category: 'Формація',
        description: 'Опис', entryRule: 'Вхід', stopLossRule: 'Стоп',
        targetRule: 'Ціль', volumeRule: 'Обсяг', bias,
      };
      assert.equal(localizeFormationGuideItem(language, item).bias, bias);
    }
  }
  const source = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /\{localizeFormationGuideBias\(language, activeItem\.bias\)\}/);
  assert.doesNotMatch(source, /\{activeItem\.bias === 'bullish' \? 'LONG'/);
});
