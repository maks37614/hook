import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Terminal layout presets display only their main labels', () => {
  const source = readFileSync(new URL('../src/components/terminal/TerminalSettingsDrawer.tsx', import.meta.url), 'utf8');
  const section = source.split('{/* Layout Presets */}')[1]?.split('{/* Number of columns */}')[0] ?? '';
  assert.ok(section, 'layout presets section missing');
  assert.match(section, /<span className="font-mono font-bold text-xs text-cyan-300">\{translatePhrase\(language, item.label\)\}<\/span>/);
  assert.doesNotMatch(section, new RegExp(String.raw`>\{item\.sub\}</`));
  assert.match(section, /aria-label=\{\`\$\{translatePhrase\(language, item.label\)\} — \$\{translatePhrase\(language, item.sub\)\}\`\}/);
  assert.match(section, /onUpdateConfig\(\{ layoutPreset: item.id as any, columns: cols as any \}\)/);
});
