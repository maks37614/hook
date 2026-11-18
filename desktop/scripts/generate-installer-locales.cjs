'use strict';
// Single source of truth for every installer language, including the onboarding pages.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'installer.json'), 'utf8'));
const ids = Object.freeze({ en: 1033, pl: 1045, ru: 1049, uk: 1058 });
const languages = Object.keys(ids);
const expectedKeys = Object.keys(source.en || {});
if (expectedKeys.length < 20) throw new Error('Missing installer translation strings');

const lines = [
  '; GENERATED FILE. Edit i18n/installer.json, not this file.',
  '; Unicode NSIS: English (1033), Polish (1045), Russian (1049), Ukrainian (1058).',
];
for (const language of languages) {
  const map = source[language];
  if (!map || Object.keys(map).length !== expectedKeys.length) {
    throw new Error('Incomplete installer locale: ' + language);
  }
  for (const key of expectedKeys) {
    const value = map[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(language + ' missing ' + key);
    if (value.includes('\r') || value.includes('\n')) {
      throw new Error('Use NSIS $\\r$\\n escape, not literal newline: ' + language + '.' + key);
    }
    // NSIS uses $" to embed a double quote and $$ for a literal dollar.
    // Language strings intentionally support NSIS $\\r$\\n line breaks.
    const escaped = value.replace(/"/g, '$\\"');
    lines.push('LangString h00k' + key[0].toUpperCase() + key.slice(1)
      + ' ' + ids[language] + ' "' + escaped + '"');
  }
}
const out = path.join(root, 'build', 'installer-locales.nsh');
fs.mkdirSync(path.dirname(out), {recursive:true});
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log('Generated installer translations:', languages.join(', '), '-', expectedKeys.length, 'strings each');
