import test from 'node:test';
import assert from 'node:assert/strict';
import { hookChartLanguagePacks, translateHookChartPhrase, resolveHookChartLanguage } from '../src/locales/hookchartLanguage';
import { translatePhrase, type SupportedLanguage } from '../src/locales';

for (const language of ['uk', 'en', 'ru', 'pl'] as SupportedLanguage[]) {
  test(`HookChart connects every entry in the supplied ${language} pack`, () => {
    const pack = hookChartLanguagePacks[language];
    assert.ok(Object.keys(pack).length >= 404);
    for (const [source, expected] of Object.entries(pack)) {
      assert.equal(translateHookChartPhrase(language, source), expected, source);
    }
    assert.equal(translateHookChartPhrase(language, 'Налаштування графіка'), pack['Настройки графика']);
    assert.equal(translateHookChartPhrase(language, 'Мова'), pack['Язык']);
    assert.equal(translateHookChartPhrase(language, 'Гарячі клавіші'), pack['Горячие клавиши']);
    assert.equal(translateHookChartPhrase(language, '  Reset\n'), `  ${pack.Reset}\n`);
    assert.equal(translateHookChartPhrase(language, 'Налаштування hookchart'), translatePhrase(language, 'Налаштування hookchart'));
    assert.equal(translateHookChartPhrase(language, 'BTCUSDT 84,321.12'), 'BTCUSDT 84,321.12');
    if (language !== 'uk') assert.notEqual(translateHookChartPhrase(language, 'Відступ праворуч'), 'Відступ праворуч');
  });
}

test('chart language follows the site by default and after a newer site selection', () => {
  assert.equal(resolveHookChartLanguage(undefined, 'pl'), 'pl');
  assert.equal(resolveHookChartLanguage({ language: 'uk' }, 'en'), 'en', 'migrate the old inactive setting');
  const selected = { language: 'ru', siteLanguageAtSelection: 'en' } as const;
  assert.equal(resolveHookChartLanguage(selected, 'en'), 'ru', 'restore a separate chart selection');
  assert.equal(resolveHookChartLanguage(selected, 'pl'), 'pl', 'site changes also apply to charts that were closed');
});
