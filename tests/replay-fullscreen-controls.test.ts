import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { ReplayFullscreenActions } from '../src/components/replay/ReplayFullscreenActions';

const callbacks = {
  onTogglePlay: () => {},
  onStepForward: () => {},
  onRandomHistoricalDate: () => {},
};

test('Replay fullscreen displays accessible Play, +1 candle, and Random date icons', () => {
  const html = renderToStaticMarkup(React.createElement(ReplayFullscreenActions, {
    ...callbacks, isPlaying: false, isLoading: false, canAdvance: true,
  }));
  assert.match(html, /aria-label="Повноекранне керування відтворенням"/);
  assert.match(html, /aria-label="Відтворити"/);
  assert.match(html, /aria-label="\+1 свічка"/);
  assert.match(html, /aria-label="Випадкова дата"/);
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.doesNotMatch(html, / disabled=""/);
});

const isDisabled = (html: string, label: string) => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
  const target = buttons.find(button => button.includes(`aria-label="${label}"`));
  assert.ok(target, `Button ${label} should be rendered`);
  return target.includes('disabled=""');
};

test('Replay fullscreen displays Pause and prevents stepping while playing', () => {
  const html = renderToStaticMarkup(React.createElement(ReplayFullscreenActions, {
    ...callbacks, isPlaying: true, isLoading: false, canAdvance: true,
  }));
  assert.match(html, /aria-label="Пауза"/);
  assert.doesNotMatch(html, /aria-label="Відтворити"/);
  assert.equal(isDisabled(html, 'Пауза'), false);
  assert.equal(isDisabled(html, '+1 свічка'), true);
  assert.equal(isDisabled(html, 'Випадкова дата'), false);
});

test('Replay fullscreen disables playback when history is loading or finished', () => {
  for (const options of [
    { isPlaying: false, isLoading: true, canAdvance: true },
    { isPlaying: false, isLoading: false, canAdvance: false },
  ]) {
    const html = renderToStaticMarkup(React.createElement(ReplayFullscreenActions, {
      ...callbacks, ...options,
    }));
    assert.equal(isDisabled(html, 'Відтворити'), true);
    assert.equal(isDisabled(html, '+1 свічка'), true);
    assert.equal(isDisabled(html, 'Випадкова дата'), options.isLoading);
  }
});


test('Replay chart has a proper desktop viewport area without changing mobile and fullscreen layout', () => {
  const source = readFileSync(new URL('../src/components/replay/ReplayChart.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('h-[520px] xs:h-[540px] sm:h-[540px] md:h-[clamp(540px,78dvh,780px)] shrink-0'));
  assert.ok(source.includes("isFullscreen\n          ? 'flex-1 min-h-0'"));
  for (const oldHeight of ['md:h-[350px]', 'lg:h-[390px]', 'xl:h-[430px]'])
    assert.ok(!source.includes(oldHeight), 'old compressed desktop height: ' + oldHeight);
});

test('Replay inputs show Take-Profit above Stop-Loss and retain their bound state', () => {
  const source = readFileSync(new URL('../src/components/replay/ReplaySimulatorPanel.tsx', import.meta.url), 'utf8');
  const form = source.slice(source.indexOf('{/* Stop-Loss & Take-Profit Toggle & Inputs */}'),
    source.indexOf('{/* Trade Reason / Tag Selector */}'));
  assert.ok(form.indexOf('{/* TP */}') >= 0 && form.indexOf('{/* TP */}') < form.indexOf('{/* SL */}'));
  assert.ok(form.includes('checked={useTp}') && form.includes('setTpPercent(parseFloat(e.target.value) || 2)'));
  assert.ok(form.includes('checked={useSl}') && form.includes('setSlPercent(parseFloat(e.target.value) || 1)'));
  assert.ok(source.indexOf('TP: <b className="text-emerald-400">') < source.indexOf('SL: <b className="text-rose-400">'));
  assert.ok(form.includes('className="space-y-1 pt-1.5 border-t border-slate-800/80"'));
});
