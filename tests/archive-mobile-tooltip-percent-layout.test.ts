import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatArchivePercent } from '../src/utils/archiveDisplayPercent';
import { translateKey } from '../src/locales';

const source = readFileSync(new URL('../src/components/ArchiveModal.tsx', import.meta.url), 'utf8');

test('archived score help stays inside scrollable mobile card and never navigates on tap', () => {
  const begin = source.indexOf('{scoreInfoId === item.id && (');
  assert.ok(begin > 0);
  const end = source.indexOf('{item.entryReason?.trim() && (', begin);
  assert.ok(end > begin);
  const help = source.slice(begin, end);
  assert.match(help, /id=\{\`archive-confluence-help-\$\{item.id\}\`\}/);
  assert.match(help, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(help, /className="min-w-0 w-full/);
  assert.doesNotMatch(help, /absolute|top-full|right-0|z-30/, 'content should expand naturally instead of being clipped');
  assert.match(source, /aria-expanded=\{scoreInfoId === item\.id\}/);
  for (const lang of ['uk','en','ru','pl'] as const) {
    assert.ok(translateKey(lang,'archive.confluenceHelp').length > 60);
  }
});

test('archive target and stop percentages are below prices with no mobile overflow', () => {
  const target = source.slice(source.indexOf('{t(\'archive.target\')}'),source.indexOf('{t(\'archive.stopLoss\')}'));
  const stop = source.slice(source.indexOf('{t(\'archive.stopLoss\')}'),source.indexOf('{t(\'archive.savedPrice\')}'));
  for (const block of [target, stop]) {
    assert.match(block, /break-all/);
    assert.match(block, /mt-1 block whitespace-nowrap font-mono/);
    assert.match(block, /block min-w-0 break-all/);
  }
  assert.match(source, /className="min-w-0 overflow-hidden rounded-xl border border-emerald-800\/30/);
  assert.match(source, /className="min-w-0 overflow-hidden rounded-xl border border-rose-800\/30/);
  assert.match(target, /Number\.isFinite\(profitPct\) && profitPct > 0/);
  assert.match(stop, /Number\.isFinite\(riskPct\) && riskPct !== 0/);
  assert.equal(formatArchivePercent(1.2333285529901037),'1.23');
  assert.equal(formatArchivePercent(-1.49999999999),'1.5');
  assert.doesNotMatch(source, /\{Math\.abs\(profitPct\)\}%|\{Math\.abs\(riskPct\)\}%/);
});

test('archive card preserves existing score and price calculations and has no Community CTA', () => {
  assert.match(source,/item\.formation\?\.potentialProfitPct/);
  assert.match(source,/item\.formation\?\.potentialRiskPct/);
  assert.match(source,/item\.confidence/);
  assert.doesNotMatch(source,/handleSendToCommunity/);
  assert.doesNotMatch(source,/subscribeSharedKlines\(|fetchKlines\(/);
});
