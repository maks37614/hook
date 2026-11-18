import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

for (const path of ['src/components/FormationCard.tsx', 'src/components/EarlyFormationCard.tsx']) {
  test(path + ': timeframe remains next to Futures/Spot on narrow cards', () => {
    const source = read(path);
    const compactHeader = source.split('data-formation-summary-header')[1]?.split('formation-card-info-scroll')[0];
    assert.ok(compactHeader, 'compact information header remains present');
    assert.match(compactHeader, /data-formation-market-badges/);
    assert.match(compactHeader, /data-formation-market-timeframe/);
    assert.match(compactHeader,
      /inline-flex shrink-0 items-center gap-1 whitespace-nowrap" data-formation-market-timeframe>/);
    assert.match(compactHeader,
      /data-formation-market-timeframe>[\s\S]*?coin\.marketType === 'futures'[\s\S]*?\{coin\.timeframe\}/);
    assert.equal((compactHeader.match(/\{coin\.timeframe\}/g) || []).length, 1);
    // The price occupies the symbol row; the badge row follows below it, with
    // the full card width available even when the quote or symbol is long.
    assert.ok(compactHeader.indexOf('data-formation-market-badges') >
      compactHeader.indexOf('priceChange24h.toFixed(2)'));
    assert.doesNotMatch(compactHeader, /WebSocket|fetch\(|ResizeObserver|setInterval\(/);
  });
}
