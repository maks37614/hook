import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalLiveAlertToast } from '../src/components/terminal/TerminalLiveAlertToast';
import { terminalAnalysisText } from '../src/utils/terminalAnalysis/presentation';
import type { TerminalLiveAlert } from '../src/utils/useTerminalLiveAlerts';

const notice: TerminalLiveAlert = {
  id: 'example', scope: 'binance:futures:BTCUSDT', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
  timeframe: '5m', blockId: 'chart', timestamp: 1800000000000, kind: 'scenario', key: 'low', scenario: 'z5_level',
  zone: 5, side: 'down', stage: 'watch', structureTf: '5m', triggerTf: '5m', observedAt: 1800000000000,
  level: 100, invalidateSide: 'above', invalidateLevel: 101, returnMinutes: 95,
  evidence: ['density'], context: { regime: 'range', coverageMinutes: 720, dailyTrendAvailable: false,
    movementPct: 1, volatilityPct: .5, h1: 'flat', h4: 'unavailable', priorTests: 1, priorFailures: 0 },
};

test('no signals means no panel, placeholder, spinner, dashboard or results container', () => {
  assert.equal(renderToStaticMarkup(React.createElement(TerminalLiveAlertToast, {
    alerts: [], language: 'uk', onDismiss() {}, onFocus() {},
  })), '');
});

test('compact results include real context, risk and observed state in each of four languages', () => {
  for (const language of ['uk', 'en', 'pl', 'ru']) {
    const copy = terminalAnalysisText(language);
    const html = renderToStaticMarkup(React.createElement(TerminalLiveAlertToast, {
      alerts: [notice], language, onDismiss() {}, onFocus() {},
    }));
    for (const text of [copy.scenarios.z5_level, copy.unreliable, copy.watch, copy.close, copy.alerts, '95', 'BTCUSDT'])
      assert.ok(html.includes(text), language + ': ' + text);
    assert.match(html, /translate="no"/);
    assert.doesNotMatch(html, /quality|якість структури|probability|ймовірність|80\/100|Web Worker|Context24hAnalyzer/);
    assert.deepEqual(Object.keys(copy.scenarios).sort(), Object.keys(terminalAnalysisText('uk').scenarios).sort());
    assert.equal(Object.values(copy.scenarios).filter(Boolean).length, 18);
  }
});

test('cancelled scenarios replace the normal observation label and remove the old entry condition', () => {
  const copy = terminalAnalysisText('en');
  const html = renderToStaticMarkup(React.createElement(TerminalLiveAlertToast, {
    alerts: [{ ...notice, stage: 'cancelled' }], language: 'en', onDismiss() {}, onFocus() {},
  }));
  assert.ok(html.includes(copy.cancelled));
  assert.ok(!html.includes(copy.above));
});
