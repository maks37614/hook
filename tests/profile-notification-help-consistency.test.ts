import test from 'node:test';
import assert from 'node:assert/strict';
import { profileLanguageRows } from '../src/locales/profileLanguage20261115';
import { profileNotificationHelpRows } from '../src/locales/profileNotificationHelp20261115';
import { translatePhrase } from '../src/locales';

test('Profile notification help does not override reviewed four-language Profile explanations', () => {
  const canonical = new Map<string, readonly string[]>(profileLanguageRows.map(row => [row[0], row]));
  let overlap = 0;
  for (const row of profileNotificationHelpRows) {
    const existing = canonical.get(row[0]);
    if (!existing) continue;
    overlap++;
    assert.deepEqual([...row], [...existing],
      'duplicate Profile notification text uses inconsistent translations: ' + row[0]);
    for (const [index, language] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.equal(translatePhrase(language, row[0]), existing[index],
        language + ': the selected UI language must resolve consistent Profile help');
    }
  }
  assert.ok(overlap >= 1, 'expected a shared notification explanation');
});
