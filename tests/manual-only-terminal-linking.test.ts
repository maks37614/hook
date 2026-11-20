import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getUserTerminalLinkSettings } from '../src/utils/terminalLinkService';
import { getUserMetaScalpSettings } from '../src/utils/metaScalpService';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('src/App.tsx');

function segment(start: string, end: string): string {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'source callback is present: ' + start);
  return app.slice(a, b);
}

test('opening any chart or expanding a Terminal chart never sends a ticker', () => {
  const handlers = [
    ['screener/formation/fullscreen', 'const handleSelectPair = useCallback(', 'const [selectedEarly,'],
    ['favorites', 'const handleOpenWatchlistChart = useCallback(', '// A\'s chart'],
    ['early formation', 'const handleOpenEarly = useCallback(', '// Handler when selecting archived'],
    ['archived formation', 'const handleSelectArchivedFormation = useCallback(', '// Browser Back/Forward'],
  ] as const;
  for (const [name, begin, end] of handlers) {
    const body = segment(begin, end);
    assert.match(body, /openChartPage\(/, name + ' still navigates');
    assert.doesNotMatch(body, /handleSendToMetaScalp\(|sendToSelectedTerminal\(/,
      name + ' cannot link automatically');
  }
  const terminal = read('src/components/TerminalPage.tsx');
  assert.match(terminal, /onOpenFullscreenModal\?\.\(coin, formation\)/);
  assert.match(app, /onOpenFullscreenModal=\{\(coin, formation\) => handleSelectPair\(coin, formation\)\}/);
});

test('notifications never auto-link but explicit manual notification actions still work', () => {
  assert.doesNotMatch(app, /autoLinkCursor|isFreshTerminalNotification|handleLinkNotification\(item, true\)/);
  assert.match(app, /onLinkNotification=\{handleLinkNotification\}/);
  assert.match(app, /void handleSendToMetaScalp\(minimalCoin, source\)/);
});

test('legacy saved auto opt-ins are neutralized without losing manual MetaScalp', () => {
  const profile = {
    uid: 'owner',
    terminalLinkSettings: { provider: 'metascalp' as const, enabled: true, switchOnChartOpen: true, autoSignals: true },
    metaScalpSettings: { enabled: true, port: 17845, binding: '002', autoSwitchOnClick: true },
  };
  const term = getUserTerminalLinkSettings(profile.uid, profile);
  assert.equal(term.provider, 'metascalp');
  assert.equal(term.enabled, true);
  assert.equal(term.switchOnChartOpen, false);
  assert.equal(term.autoSignals, false);
  const meta = getUserMetaScalpSettings(profile.uid, profile);
  assert.equal(meta.binding, '002');
  assert.equal(meta.autoSwitchOnClick, false);
});

test('explicit chart link buttons remain, deprecated auto toggles are removed', () => {
  assert.match(read('src/components/FullscreenChartModal.tsx'), /onClick=\{\(\) => onSendMetaScalp\(headerActionCoin\)\}/);
  assert.match(read('src/components/FormationDetailsModal.tsx'), /onClick=\{\(\) => onSendMetaScalp\(coin\)\}/);
  assert.match(read('src/components/terminal/TerminalChartWidget.tsx'), /onClick=\{\(\) => onSendMetaScalp\(coin\)\}/);
  assert.doesNotMatch(read('src/components/profile/ProfileTerminalLinkingSettings.tsx'), /checked=\{draft\.switchOnChartOpen\}|checked=\{draft\.autoSignals/);
  assert.doesNotMatch(read('src/components/MetaScalpModal.tsx'), /handleToggleAutoSwitch|Автоперемикання при виборі/);
});
