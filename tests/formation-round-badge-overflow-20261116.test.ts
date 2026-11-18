import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/FormationCard.tsx', import.meta.url), 'utf8');

test('formation badges wrap to another row instead of overflowing narrow cards', () => {
  assert.match(source, /flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 mb-1/);
  assert.match(source, /min-w-0 max-w-full px-2 py-0\.5 rounded text-center text-\[9px\] leading-tight font-bold uppercase tracking-wider whitespace-normal break-words border/);
  assert.doesNotMatch(source, /tracking-wider whitespace-nowrap border \$\{/);
});

test('round-level and density text and full tooltip are preserved', () => {
  assert.match(source, /'КРУГЛИЙ \+ ЩІЛЬНІСТЬ' : 'КРУГЛИЙ РІВЕНЬ'/);
  assert.match(source, /formation\.roundNumberContext\.densityConfirmed/);
  assert.match(source, /'Кругле число \+ велика лімітна заявка у поточному знімку стакана/);
});
