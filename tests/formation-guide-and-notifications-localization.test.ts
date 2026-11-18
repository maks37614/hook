import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  localizeFormationGuideItem, translatedFormationGuideFields, translatedFormationGuideIds,
} from '../src/locales/formationGuideTranslations';
import { translateKey, translatePhrase } from '../src/locales';

const ids = [
  'double_bottom', 'double_top', 'asc_triangle', 'desc_triangle',
  'bull_flag', 'bear_flag', 'volatility_squeeze', 'candlestick_pa',
];
const source = {
  name: 'Українська назва',
  category: 'Українська категорія',
  description: 'Український опис',
  entryRule: 'Українське правило входу',
  stopLossRule: 'Український стоп',
  targetRule: 'Українська ціль',
  volumeRule: 'Українське підтвердження',
};
test('Encyclopedia localizes all eight formations and their seven content fields', () => {
  assert.deepEqual(translatedFormationGuideIds, ids);
  assert.equal(translatedFormationGuideFields.length, 7);
  for (const id of ids) {
    const original = { id, bias: 'bullish', ...source };
    assert.deepEqual(localizeFormationGuideItem('uk', original), original, 'Ukrainian source must remain unchanged');
    for (const language of ['en', 'ru', 'pl'] as const) {
      const result = localizeFormationGuideItem(language, original);
      for (const field of translatedFormationGuideFields) {
        assert.ok(result[field]?.trim(), `${language} ${id} ${field}`);
        assert.notEqual(result[field], original[field], `${language} ${id} ${field} still Ukrainian`);
      }
      assert.equal(result.id, id, 'localization must not change the formation identity');
      assert.equal(result.bias, original.bias, 'localization must not change trading direction');
    }
  }
});
test('Encyclopedia language selection updates visible names and rule descriptions', () => {
  const src = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');
  assert.match(src, /const \{ language \} = useLanguage\(\)/);
  assert.match(src, /localizeFormationGuideItem\(language, activeSourceItem\)/);
  assert.match(src, /localizeFormationGuideItem\(language, item\)\.name/);
  assert.match(src, /\{activeItem\.entryRule\}/);
  assert.match(src, /\{activeItem\.stopLossRule\}/);
  assert.match(src, /\{activeItem\.targetRule\}/);
  assert.match(src, /\{activeItem\.volumeRule\}/);
  assert.equal(translatePhrase('en', 'Точка входу:'), 'Entry point:');
  assert.equal(translatePhrase('pl', 'Підтвердження обсягом:'), 'Potwierdzenie wolumenem:');
});
test('notification profile feedback and numeric rules have translations in four languages', () => {
  for (const language of ['uk', 'en', 'ru', 'pl'] as const) {
    const keys = ['notifications.sound.readError', 'notifications.sound.deleted',
      'notifications.impulse.invalid', 'notifications.browser.denied',
      'notifications.center.reset'];
    for (const key of keys) assert.notEqual(translateKey(language, key), key);
    assert.ok(translatePhrase(language, 'Відстань до рівня').trim());
  }
  const component = readFileSync(new URL('../src/components/profile/ProfileNotificationSettings.tsx', import.meta.url), 'utf8');
  assert.match(component, /t\('notifications\.sound\.readError'\)/);
  assert.match(component, /t\('notifications\.center\.reset'\)/);
  assert.match(component, /translatePhrase\(language, option\.title\)/);
});
