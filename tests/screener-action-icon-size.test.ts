import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');

function actions(marker: string) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, marker + ' exists');
  const end = source.indexOf(marker === 'data-screener-table-actions'
    ? '                    {/* Price */}'
    : '                  </div>\n                </div>', start);
  assert.ok(end > start, marker + ' has closing anchor');
  return source.slice(start, end);
}

test('Screener table shows 15px action icons without moving the price column', () => {
  const group = actions('data-screener-table-actions');
  assert.equal((group.match(/inline-flex h-8 w-8 shrink-0 items-center justify-center/g) ?? []).length, 3);
  assert.ok(group.includes('<Zap className="h-[15px] w-[15px]" strokeWidth={2.7} />'));
  assert.ok(group.includes('<Send className="h-[15px] w-[15px]" strokeWidth={2.7} />'));
  assert.ok(group.includes('MonitoringMenuIcon className={\`h-[15px] w-[15px]'));
  assert.ok(source.includes('{/* Price */}'));
});

test('Screener card action buttons show the same 15px icons', () => {
  const group = actions('data-screener-card-actions');
  assert.equal((group.match(/inline-flex h-9 w-9 shrink-0 items-center justify-center/g) ?? []).length, 3);
  assert.ok(group.includes('<Zap className="h-[15px] w-[15px]" strokeWidth={2.7} />'));
  assert.ok(group.includes('<Send className="h-[15px] w-[15px]" strokeWidth={2.7} />'));
  assert.ok(group.includes('MonitoringMenuIcon className={\`h-[15px] w-[15px]'));
});

test('All three icons retain their original behaviors and guest lock badges', () => {
  for (const marker of ['data-screener-table-actions', 'data-screener-card-actions']) {
    const group = actions(marker);
    assert.ok(group.includes('handleSendMetaScalpClick(e, coin)'));
    assert.ok(group.includes('handleAlertClick(e, coin)'));
    assert.ok(group.includes('handleSurveillanceToggle(e, coin)'));
    assert.ok(group.includes('onSurveillance'));
    assert.ok(group.includes('<Lock className='));
  }
});

test('Screener table and card action backgrounds stay transparent for all account states', () => {
  for (const marker of ['data-screener-table-actions', 'data-screener-card-actions']) {
    const group = actions(marker);
    assert.equal((group.match(/bg-transparent/g) || []).length, 6, marker + ': three buttons and their hover states');
    // Guest lock badges remain intact, but the three action buttons have no background tints.
    assert.doesNotMatch(group, /bg-(?:amber|sky|violet)-500\/|hover:bg-(?:amber|sky|violet)-500\/|bg-slate-800\/80/);
    assert.equal((group.match(/strokeWidth=\{2\.7\}/g) || []).length, 3, marker + ': stronger visible icon strokes');
    assert.equal((group.match(/vibrant strokeWidth=\{2\.7\}/g) || []).length, 1, marker + ': vivid monitoring icon');
    for (const handler of ['handleSendMetaScalpClick(e, coin)', 'handleAlertClick(e, coin)', 'handleSurveillanceToggle(e, coin)']) {
      assert.ok(group.includes(handler), marker + ' retains ' + handler);
    }
  }
});
test('Monitoring icon brighter gradient is opt-in and does not change the header icon', () => {
  const monitorSource = readFileSync(new URL('../src/components/MonitoringIcon.tsx', import.meta.url), 'utf8');
  const headerSource = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
  assert.match(monitorSource, /vibrant\?: boolean/);
  assert.match(monitorSource, /vibrant = false/);
  assert.match(monitorSource, /#E879F9/);
  assert.match(monitorSource, /#22D3EE/);
  assert.match(monitorSource, /#34D399/);
  assert.doesNotMatch(headerSource, /<MonitoringMenuIcon[^>]*vibrant/);
});

test('guest lock markers stay anchored to each transparent Screener action button', () => {
  const groupTable = actions('data-screener-table-actions');
  const groupCards = actions('data-screener-card-actions');
  assert.equal((groupTable.match(/items-center justify-center rounded-lg relative bg-transparent/g) || []).length, 3);
  assert.equal((groupCards.match(/items-center justify-center rounded-lg border relative bg-transparent/g) || []).length, 3);
  for (const group of [groupTable, groupCards]) {
    assert.equal((group.match(/absolute -top-1 -right-1/g) || []).length, 3);
  }
});
