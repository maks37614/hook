import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

function headerOnly(file: string, beginning: string, end: string): string {
  const code = source(file);
  const start = code.indexOf(beginning);
  const finish = code.indexOf(end, start);
  assert.ok(start >= 0 && finish > start, `chart header exists in ${file}`);
  return code.slice(start, finish);
}

const regularHeader = () => headerOnly(
  '../src/components/FormationDetailsModal.tsx',
  '{/* Compact chart header:', '{/* Modal Body */}',
);
const earlyHeader = () => headerOnly(
  '../src/components/EarlyFormationDetailsModal.tsx',
  '{/* Compact early-chart header:', '<div className="p-3 sm:p-6 overflow-y-auto',
);

test('chart headers put price directly after coin name and remove the redundant USDT-M badge', () => {
  for (const header of [regularHeader(), earlyHeader()]) {
    const coin = header.indexOf('<CopyableCoinSymbol baseAsset={coin.baseAsset} quoteAsset={coin.quoteAsset} />');
    const price = Math.max(header.indexOf('formatPrice(livePrice)'), header.indexOf('money(livePrice)'));
    const exchange = header.indexOf('{coin.exchange}');
    const pattern = header.includes('Switching patterns') ? header.indexOf('Switching patterns') : header.indexOf('Можлива формація:');
    assert.ok(coin > 0 && price > coin, 'price follows coin in the top flex row');
    if (header === regularHeader()) {
      assert.ok(pattern > price && exchange > pattern, 'exchange follows the formation in the second row');
    } else {
      assert.ok(exchange > price && pattern > exchange, 'early chart retains the original badge position');
    }
    assert.doesNotMatch(header, /USDT-M/);
    assert.match(header, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(header, /col-span-2 flex min-w-0 flex-wrap items-center/);
    assert.match(header, /col-start-1 row-start-2 (?:flex )?min-w-0 max-w-full/);
    assert.match(header, /col-start-2 row-start-2 flex shrink-0/);
    assert.match(header, /sm:flex sm:justify-between/);
  }
  assert.match(regularHeader(), /col-start-1 row-start-2 flex min-w-0 max-w-full items-center gap-1[.]5/);
});

test('both chart headers copy the visible pair without changing their other controls', () => {
  for (const header of [regularHeader(), earlyHeader()]) {
    assert.match(header, /<CopyableCoinSymbol baseAsset=\{coin\.baseAsset\} quoteAsset=\{coin\.quoteAsset\} \/>/);
    assert.match(header, /className="sm:hidden">(?:Назад|\{tr\('Назад'\)\})<\/span>/);
  }
});

test('existing chart actions remain right-aligned and retain their handlers', () => {
  const standard = regularHeader();
  const early = earlyHeader();
  for (const header of [standard, early]) {
    assert.match(header, /onOpenTelegramModal/);
    assert.match(header, /onSendMetaScalp\(coin\)/);
    assert.match(header, /onClick=\{onClose\}/);
    assert.match(header, /className="sm:hidden">(?:Назад|\{tr\('Назад'\)\})<\/span>/);
    assert.match(header, /justify-self-end/);
  }
  assert.match(standard, /onFormationChange\(next\)/);
  assert.match(standard, /min-w-0 truncate font-medium tracking-tight/);
  assert.match(early, /className="truncate">\{tr\('Можлива формація:'\)\}/);
});


test('formation header badge omits only redundant support suffix without changing the formation itself', () => {
  const header = regularHeader();
  assert.match(header, /formation\.name\.replace\(\/\\s\*\\\(Підтримка\\\)\\s\*\$\/iu, ''\)/);
  assert.ok(header.includes("title={isReferencePreview ? tr('Довідкові рівні 24h') : tp('Формація: {{name}} ({{status}})'") && header.includes('status: trStatus(formation.statusLabel)'), 'real formation title stays localized; reference scenario has its own title');
  assert.equal('Тестування мінімуму 24h (Підтримка)'.replace(/\s*\(Підтримка\)\s*$/iu, ''),
    'Тестування мінімуму 24h');
});
