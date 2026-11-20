import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcCascadeRisk, type Liquidation } from '../src/components/hookchart/engine';
import {
  hasObservedLiquidationCascade,
  liquidationHudPreferenceKey,
  readLiquidationHudExpanded,
  saveLiquidationHudExpanded,
  LIQUIDATION_HUD_PREFERENCE_EVENT,
} from '../src/components/hookchart/liquidationHudPreferences';

test('a cascade is only announced for recent independent large forced orders on a live stream', () => {
  const now = 1_800_000_000_000;
  const row = (id: string, time: number): Liquidation =>
    ({ id, t: time, side: 'LONG', usd: 150_000, p: 100, q: 1500 });
  const empty = calcCascadeRisk([], 100, 100, now);
  assert.equal(hasObservedLiquidationCascade(empty, true), false);
  const one = calcCascadeRisk([row('one', now)], 100, 100, now);
  assert.equal(hasObservedLiquidationCascade(one, true), false);
  const burst = calcCascadeRisk([
    row('one', now), row('two', now - 1000), row('three', now - 2000),
  ], 100, 100, now);
  assert.ok(burst.score >= 34, 'the reference burst must qualify as a cascade');
  assert.equal(hasObservedLiquidationCascade(burst, true), true);
  assert.equal(hasObservedLiquidationCascade(burst, false), false, 'disconnected streams cannot show an active cascade');
  assert.equal(hasObservedLiquidationCascade(
    calcCascadeRisk([row('one', now - 301_000)], 100, 100, now), true,
  ), false, 'stale events cannot leave a visible cascade');
});

test('liquidation HUD defaults to collapsed and keeps independent per-account choices', () => {
  assert.equal(readLiquidationHudExpanded(liquidationHudPreferenceKey('unknown')), false);
  assert.notEqual(liquidationHudPreferenceKey('a'), liquidationHudPreferenceKey('b'));
  assert.notEqual(liquidationHudPreferenceKey('a'), liquidationHudPreferenceKey());
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => { saved.set(k, v); },
    },
  });
  try {
    const a = liquidationHudPreferenceKey('a');
    const b = liquidationHudPreferenceKey('b');
    assert.equal(readLiquidationHudExpanded(a), false);
    saveLiquidationHudExpanded(a, true);
    assert.equal(readLiquidationHudExpanded(a), true);
    assert.equal(readLiquidationHudExpanded(b), false);
    saveLiquidationHudExpanded(a, false);
    assert.equal(readLiquidationHudExpanded(a), false);
    saved.set(a, 'invalid');
    assert.equal(readLiquidationHudExpanded(a), false);
  } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('all HookChart instances use a shared preference event and a single display guard', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  assert.equal(LIQUIDATION_HUD_PREFERENCE_EVENT, 'h00k:liquidation-hud-visibility');
  assert.match(wrapper, /liquidationHudOwner=\{user\?\.uid\}/);
  assert.match(engine, /\[liqHudOpen,setLiqHudOpen\]=useState<boolean>\(\(\)=>readLiquidationHudExpanded\(liqHudKey\)\)/);
  assert.match(engine, /window\.addEventListener\(LIQUIDATION_HUD_PREFERENCE_EVENT,onShared\)/);
  assert.match(engine, /window\.addEventListener\('storage',onStorage\)/);
  assert.match(engine, /saveLiquidationHudExpanded\(liqHudKey,next\)/);
  assert.match(engine, /hasObservedLiquidationCascade\(cascadeRisk,liquidationStreamLive\)/);
});

test('Terminal HookChart restores the Liq/cascade chevron and respects the existing setting and ECO mode', () => {
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  const eco = readFileSync(new URL('../src/components/hookchart/terminalEcoPreferences.ts', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  // All live HookCharts, including terminal tiles, pass through the same
  // user-configurable display guard. No unconditional terminal exclusion.
  assert.match(canvas, /showLiqRiskBlock=\{!replay && !externalData && !archiveMode && runtimeSettings\.showLiqRiskBlock !== false\}/);
  assert.doesNotMatch(canvas, /showLiqRiskBlock=\{[^\n]*!terminalMode/);
  assert.match(settings, /showLiqRiskBlock: true/);
  assert.match(settings, /label="Блок Liq \+ каскад"/);
  assert.match(eco, /showLiqRiskBlock: false/);
  assert.match(canvas, /const next = terminalEcoPreferences\(settings, ecoActive\)/);
  assert.match(terminal, /terminalMode/);
  // Collapsing never unmounts the chevron, even with no live Liq events.
  assert.match(engine, /\{showLiqRiskBlock&&<div className=\{'liqRiskHud '/);
  assert.match(engine, /className="liqRiskToggle"/);
  assert.match(engine, /aria-expanded=\{liqHudOpen\}/);
  assert.match(engine, /onClick=\{toggleLiqHud\}/);
  assert.match(engine, /\{liqHudOpen&&<div className="liqRiskContent"/);
});
