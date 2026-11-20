import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ReplaySpeedPicker,
  REPLAY_SPEED_OPTIONS,
  positionReplaySpeedMenu,
} from '../src/components/replay/ReplaySpeedPicker';

test('Replay speed picker retains all original playback rates and adds 0.1x', () => {
  assert.deepEqual(REPLAY_SPEED_OPTIONS.map(option => option.value), [0.1, 0.25, 0.5, 1, 2, 5, 10]);
  assert.equal(REPLAY_SPEED_OPTIONS[0].label, '0.1x');
  assert.equal(REPLAY_SPEED_OPTIONS.length, 7);
});

test('Replay speed picker uses a custom popover, not the native iOS select sheet', () => {
  const html = renderToStaticMarkup(React.createElement(ReplaySpeedPicker, {
    speed: 2, onSpeedChange: () => {},
  }));
  assert.match(html, /aria-label="Швидкість відтворення"/);
  assert.match(html, /aria-label="Вибрати швидкість відтворення"/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, />2x<\/span>/);
  assert.doesNotMatch(html, /<select\b/);
});

test('Replay 0.1x displays as the selected speed with no browser-native select', () => {
  const html = renderToStaticMarkup(React.createElement(ReplaySpeedPicker, {
    speed: 0.1, onSpeedChange: () => {},
  }));
  assert.match(html, />0\.1x<\/span>/);
  assert.doesNotMatch(html, /<select\b/);
});

test('Replay popup opens below the button and stays inside phone/desktop widths', () => {
  const phone = positionReplaySpeedMenu({ left: 345, bottom: 66 }, { width: 375, height: 667 });
  assert.equal(phone.top, 70);
  assert.equal(phone.width, 116);
  assert.ok(phone.left + phone.width <= 375 - 8);
  assert.equal(phone.maxHeight, 589);

  const desktop = positionReplaySpeedMenu({ left: 500, bottom: 34 }, { width: 1440, height: 900 });
  assert.equal(desktop.top, 38);
  assert.equal(desktop.left, 500);

  const offset = positionReplaySpeedMenu({ left: 110, bottom: 70 }, {
    width: 280, height: 480, offsetLeft: 40, offsetTop: 25,
  });
  assert.ok(offset.left >= 48);
  assert.equal(offset.top, 74);
});
