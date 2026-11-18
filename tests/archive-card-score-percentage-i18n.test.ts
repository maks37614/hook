import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatArchivePercent } from '../src/utils/archiveDisplayPercent';
import { translateKey } from '../src/locales';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('archive card formats raw percentage floats without long precision tails', () => {
  assert.equal(formatArchivePercent(1.233285529901037), '1.23');
  assert.equal(formatArchivePercent(1.2), '1.2');
  assert.equal(formatArchivePercent(-1.50000000000011), '1.5');
  assert.equal(formatArchivePercent(1), '1');
  assert.equal(formatArchivePercent(0), '0');
  assert.equal(formatArchivePercent(Number.NaN), '—');
  assert.equal(formatArchivePercent(Number.POSITIVE_INFINITY), '—');
  const modal=read('../src/components/ArchiveModal.tsx');
  assert.match(modal, /\(\+\{formatArchivePercent\(profitPct\)\}%\)/);
  assert.match(modal, /\(-\{formatArchivePercent\(riskPct\)\}%\)/);
  assert.doesNotMatch(modal, /\{Math\.abs\(profitPct\)\}%|\{Math\.abs\(riskPct\)\}%/);
});

test('archive Confluence badge has all four translations and a touch-friendly accessible tooltip', () => {
  const labels = {
    uk:'Узгодженість', en:'Confluence', ru:'Согласованность', pl:'Zgodność sygnałów',
  } as const;
  for (const [lang,label] of Object.entries(labels) as [keyof typeof labels,string][]) {
    assert.equal(translateKey(lang,'archive.confluenceLabel'),label);
    assert.ok(translateKey(lang,'archive.confluenceHelpTitle').length > 20);
    const help=translateKey(lang,'archive.confluenceHelp');
    assert.ok(help.length > 90);
    assert.doesNotMatch(help, /undefined/);
  }
  const modal=read('../src/components/ArchiveModal.tsx');
  assert.match(modal, /Math\.round\(item\.confidence\)/);
  assert.match(modal, /role="tooltip"/);
  assert.match(modal, /aria-expanded=\{scoreInfoId === item\.id\}/);
  assert.match(modal, /aria-label=\{t\('archive\.confluenceHelpTitle'\)\}/);
  assert.match(modal, /setScoreInfoId\(current => current === item\.id \? null : item\.id\)/);
  assert.doesNotMatch(modal, /% Confluence/);
  assert.doesNotMatch(modal, /handleSendToCommunity/);
});

test('archive card appearance changes do not affect chart or score calculations', () => {
  const modal=read('../src/components/ArchiveModal.tsx');
  assert.match(modal, /item\.formation\?\.potentialProfitPct/);
  assert.match(modal, /item\.formation\?\.potentialRiskPct/);
  assert.match(modal, /item\.confidence/);
  assert.doesNotMatch(modal,/fetchKlines\(|subscribeSharedKlines\(/);
});
