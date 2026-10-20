// Real Chromium wheel input tests scroll default actions and DOM hit testing.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

function hasNoVisibleShadow(value) {
  if (value === 'none') return true;
  const entries = value.split(/,\s*(?=rgba\()/);
  return entries.length > 0 && entries.every(entry => {
    const match = entry.match(/rgba\([^)]*,\s*([0-9.]+)\)/);
    return !!match && Number(match[1]) === 0;
  });
}

const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  assert.ok(process.env.CHROME_BIN, 'CHROME_BIN must identify the installed Chrome executable');
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/hookchart-wheel-browser.html`);
  await page.waitForFunction(() => globalThis.chartViewport?.barWidth === 9);
  await page.evaluate(() => { window.scrollTo(0, 100); document.getElementById('scroll-host').scrollTop = 50; });
  const scroll = () => page.evaluate(() => ({ page: window.scrollY, host: document.getElementById('scroll-host').scrollTop }));
  const viewport = () => page.evaluate(() => globalThis.chartViewport);
  const stableScroll = await scroll();
  const wheel = async (point, deltaY) => {
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(150);
    assert.deepEqual(await scroll(), stableScroll, 'chart wheel input must keep page and nested scrolling still');
  };
  const canvas = page.locator('.chartWrap > canvas');
  const plotPoint = async () => { const rect = await canvas.boundingBox(); return { x: rect.x + rect.width * .45, y: rect.y + rect.height * .55 }; };
  const hoverPoint = await plotPoint();
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  assert.equal(await canvas.evaluate(node => document.activeElement === node), true, 'mouse hover focuses the canvas');
  await canvas.evaluate(node => {
    const context = node.getContext('2d');
    window.addEventListener('pointermove', event => { globalThis.cursorCoordinates = [event.clientX, event.clientY]; }, true);
    let path = [];
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke']) {
      const original = context[method].bind(context);
      context[method] = (...args) => {
        if (method === 'beginPath') path = [];
        if (method === 'moveTo' || method === 'lineTo') path.push(args);
        if (method === 'stroke' && context.strokeStyle === '#758696') globalThis.crosshairPath = path.map(point => [...point]);
        return original(...args);
      };
    }
  });
  const cursorRect = await canvas.boundingBox();
  const cursorPoint = { x: cursorRect.x + 503.25, y: cursorRect.y + 142.75 };
  await page.mouse.move(cursorPoint.x, cursorPoint.y);
  await page.waitForTimeout(50);
  const rawCursor = await page.evaluate(() => globalThis.cursorCoordinates);
  assert.deepEqual(await page.evaluate(() => globalThis.crosshairPath), [[rawCursor[0] - cursorRect.x, 0], [rawCursor[0] - cursorRect.x, cursorRect.height], [0, rawCursor[1] - cursorRect.y], [cursorRect.width, rawCursor[1] - cursorRect.y]], 'native mouse movement follows actual pointer coordinates without candle snapping');
  const cursorHud = await page.locator('.liqRiskContent').boundingBox();
  const cursorHudPoint = { x: cursorHud.x + cursorHud.width / 2, y: cursorHud.y + cursorHud.height / 2 };
  const beforeCursorHover = await viewport();
  await page.mouse.move(cursorHudPoint.x, cursorHudPoint.y);
  await page.waitForTimeout(50);
  const overlayCursor = await page.evaluate(() => globalThis.crosshairPath);
  assert.ok(Math.abs(overlayCursor[0][0] - (cursorHudPoint.x - cursorRect.x)) < 1, 'native hover over the liquidation label keeps the crosshair moving');
  assert.ok(Math.abs(overlayCursor[2][1] - (cursorHudPoint.y - cursorRect.y)) < 1);
  assert.deepEqual(await viewport(), beforeCursorHover, 'moving the cursor does not change chart scale or position');
  await wheel(await plotPoint(), -120);
  assert.ok((await viewport()).barWidth > 9, 'plot wheel input zooms the chart');
  await wheel(await plotPoint(), 120);
  assert.ok(Math.abs((await viewport()).barWidth - 9) < .001);

  const corner = page.locator('.chartTimeScaleSpacer');
  assert.equal((await corner.boundingBox()).width, 50, 'the price-scale corner has the requested 50px width');
  assert.equal((await canvas.boundingBox()).width - (await page.locator('.chartTimePlot').boundingBox()).width, 0, 'time axis continues beneath the 50px price-scale overlay');
  const timer = corner.locator('[role="timer"]');
  assert.ok(await corner.evaluate(node => node.textContent === node.querySelector('[role="timer"]').textContent), 'bottom right corner contains only the timer without a location label');
  const timerRect = await timer.boundingBox();
  const bookRect = await page.locator('.hookchart-dom-toggle').boundingBox();
  const plotRect = await canvas.boundingBox();
  assert.ok(timerRect.y >= plotRect.y + plotRect.height, 'countdown must sit below the chart');
  assert.ok(timerRect.y + timerRect.height <= bookRect.y, 'countdown must sit above the order book button');
  assert.ok(timerRect.x < bookRect.x + bookRect.width && timerRect.x + timerRect.width > bookRect.x, 'countdown must align over the order book button');
  assert.ok(await timer.evaluate(node => node.scrollWidth <= node.clientWidth), 'the countdown stays readable above the narrower price scale');
  const background = await canvas.evaluate(node => {
    const context = node.getContext('2d');
    return {
      plot: Array.from(context.getImageData(5, 1, 1, 1).data),
      scale: Array.from(context.getImageData(node.width - 5, 1, 1, 1).data),
      canvasStyle: getComputedStyle(node).backgroundColor,
      cornerStyle: getComputedStyle(document.querySelector('.chartTimeScaleSpacer')).backgroundColor,
    };
  });
  assert.deepEqual(background.scale, background.plot, 'right edge remains part of the chart canvas instead of a separately painted scale column');
  assert.equal(background.cornerStyle, 'rgba(0, 0, 0, 0)', 'bottom right price-scale overlay is transparent');
  const cornerStyle = await corner.evaluate(node => {
    const style = getComputedStyle(node);
    return [style.borderLeftWidth, style.boxShadow, style.position, style.right];
  });
  assert.deepEqual([cornerStyle[0], cornerStyle[2], cornerStyle[3]], ['0px', 'absolute', '0px'],
    'price-scale overlay has no divider or reserved flex column');
  assert.ok(hasNoVisibleShadow(cornerStyle[1]), 'price-scale overlay has no visible shadow');

  const rect = await canvas.boundingBox();
  const pricePoint = { x: rect.x + rect.width - 20, y: rect.y + rect.height / 2 };
  const beforePrice = await viewport();
  await wheel(pricePoint, -120);
  const stretched = await viewport();
  assert.equal(stretched.autoY, false);
  assert.equal(stretched.barWidth, beforePrice.barWidth);
  assert.equal(stretched.rightOffset, beforePrice.rightOffset);
  await wheel(pricePoint, 120);
  assert.ok((await viewport()).manualRange > stretched.manualRange, 'reverse price wheel compresses the vertical scale');

  const hud = await page.locator('.liqRiskContent').boundingBox();
  const beforeHud = (await viewport()).barWidth;
  const hudPoint = { x: hud.x + hud.width / 2, y: hud.y + hud.height / 2 };
  assert.ok(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('.liqRiskHud'), hudPoint), 'HUD must receive native wheel input');
  await wheel(hudPoint, -120);
  assert.ok((await viewport()).barWidth > beforeHud, 'wheel input over the HUD reaches its chart');
  const time = await page.locator('.chartTimePlot').boundingBox();
  const beforeTime = (await viewport()).barWidth;
  const timePoint = { x: time.x + time.width / 2, y: time.y + time.height / 2 };
  assert.ok(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('.chartTimeAxis'), timePoint), 'time axis must receive native wheel input');
  await wheel(timePoint, -120);
  assert.ok((await viewport()).barWidth > beforeTime, 'wheel input over the separate time axis reaches its chart');

  await page.evaluate(() => globalThis.remountChart());
  await page.waitForFunction(() => globalThis.chartViewport?.barWidth === 9);
  await wheel(await plotPoint(), -120);
  assert.ok((await viewport()).barWidth > 9, 'wheel capture survives StrictMode and remounting');
  await page.mouse.move(1050, 760);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(start => window.scrollY > start, stableScroll.page, { timeout: 5000 });
  assert.ok((await scroll()).page > stableScroll.page, 'wheel input outside the chart still scrolls the page');

  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(page.url()).origin) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], alerts: [], history: [] }) });
    return route.continue();
  });
  await page.evaluate(() => globalThis.mountToolbarFixture());
  const fixture = page.locator('#toolbar-fixture');
  const toolbar = fixture.locator('.hookchart-toolbar');
  await toolbar.waitFor();
  assert.equal(await toolbar.locator('.toolbarExchange').count(), 0, 'BIN/BYB buttons must be removed');
  const settings = toolbar.getByRole('button', { name: 'Налаштування hookchart' });
  const timeframe = toolbar.getByRole('button', { name: 'Таймфрейм 5m', exact: true });
  for (const width of [900, 300]) {
    await fixture.evaluate((node, width) => { node.style.width = `${width}px`; }, width);
    await page.waitForTimeout(50);
    assert.equal((await toolbar.boundingBox()).height, 28, 'toolbar stays compact on wide and narrow charts');
    const stage = fixture.locator('.chartStage');
    const actions = toolbar.getByRole('group', { name: 'Дії графіка', exact: true });
    await actions.scrollIntoViewIfNeeded();
    const stageBox = await stage.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    const settingsBox = await settings.boundingBox();
    const actionsBox = await actions.boundingBox();
    assert.equal(await actions.getByRole('button').count(), 2, 'both action buttons are in the upper toolbar');
    assert.equal(await stage.locator('.hookchart-chart-actions').count(), 0, 'the candle plot no longer contains action buttons');
    assert.ok(actionsBox.x >= settingsBox.x + settingsBox.width, 'actions are to the right of the settings button');
    assert.ok(actionsBox.y >= toolbarBox.y && actionsBox.y + actionsBox.height <= toolbarBox.y + toolbarBox.height, 'actions share the settings row');
    assert.ok(actionsBox.x + actionsBox.width <= toolbarBox.x + toolbarBox.width + 0.1, 'both actions fit inside the toolbar: ' + JSON.stringify({width, actionsBox, toolbarBox}));
    assert.ok(actionsBox.y + actionsBox.height <= stageBox.y, 'actions are above the candle plot');
    assert.ok((await stage.locator('.liqRiskHud').boundingBox()).y >= stageBox.y, 'liquidation information remains inside the candle plot');
    for (const button of await actions.getByRole('button').all()) {
      assert.ok(await button.evaluate(node => {
        const box = node.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === node;
      }), 'the chart and its HUD must not intercept action clicks');
      await button.click();
    }
    assert.deepEqual(await actions.getByRole('button').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)), ['rgb(216, 180, 254)', 'rgb(103, 232, 249)'], 'archive and fullscreen icons keep their purple and cyan colors');
    assert.equal(await timeframe.evaluate(node => getComputedStyle(node).borderTopWidth), '1px', 'formation border styles must be active in the fixture');
    const toggle = toolbar.locator('.topToolbarToggle');
    await toggle.hover();
    const checkToggleBorder = async () => {
      const decoration = await toggle.evaluate(node => {
        const style = getComputedStyle(node);
        return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.boxShadow];
      });
      assert.deepEqual(decoration.slice(0, 4), ['0px', '0px', '0px', '0px'], 'collapse arrow has no border');
      assert.ok(hasNoVisibleShadow(decoration[4]), 'collapse arrow has no visible shadow');
    };
    await checkToggleBorder();
    assert.ok(await fixture.locator('.indicatorPanel svg').evaluate(node => [...node.querySelectorAll('.indicatorAxis')].every(label => {
      const box = label.getBBox();
      return box.width <= 46.1 && box.x >= node.viewBox.baseVal.width - 50 && box.x + box.width <= node.viewBox.baseVal.width;
    })), 'indicator prices fit inside the overlaid scale');
    assert.ok(await fixture.locator('.indicatorPanel svg').evaluate(node => [...node.querySelectorAll('clipPath rect')].every(rect => Number(rect.getAttribute('width')) === node.viewBox.baseVal.width)), 'indicator plots continue beneath their right-side labels');
    for (const control of [settings, timeframe, toolbar.locator('.topToolbarToggle')]) {
      const rect = await control.boundingBox();
      const parent = await toolbar.boundingBox();
      assert.ok(rect.x >= parent.x - 0.1 && rect.x + rect.width <= parent.x + parent.width + 0.1, 'timeframe, collapse arrow and settings stay within the toolbar');
    }
    await toolbar.getByRole('button', { name: 'Згорнути верхні інструменти' }).click();
    await checkToggleBorder();
    assert.equal(await toolbar.locator('.autoOverlayTools, .densityQuickWrap').count(), 0, 'collapsing hides every auxiliary tool');
    assert.ok(await actions.isVisible(), 'archive and fullscreen actions remain visible when tools are collapsed');
    await timeframe.click();
    assert.equal(await timeframe.getAttribute('aria-pressed'), 'true', 'timeframe selection works while collapsed');
    await settings.click();
    const settingsLayer = page.locator('body > .hookchart-settings-portal');
    const panel = settingsLayer.locator('.originalSettingsPanel');
    await panel.waitFor();
    assert.equal(await fixture.locator('.originalSettingsPanel').count(), 0,
      'chart settings render outside clipped chart block');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden',
      'background page scrolling is locked while settings are open');
    const layerRect = await settingsLayer.boundingBox();
    const panelRect = await panel.boundingBox();
    const viewportRect = page.viewportSize();
    for (const rect of [layerRect, panelRect]) {
      assert.ok(rect && Math.abs(rect.x) <= 1 && Math.abs(rect.y) <= 1 &&
        Math.abs(rect.width - viewportRect.width) <= 2 && Math.abs(rect.height - viewportRect.height) <= 2,
        'fullscreen settings fill browser viewport, not chart block: ' + JSON.stringify({ width, rect, viewportRect }));
    }
    assert.equal(await panel.getAttribute('aria-modal'), 'true');
    assert.ok(await panel.evaluate(node => node.contains(document.activeElement)),
      'keyboard focus moves into fullscreen settings');
    const levelRow = label => panel.locator('.settingRow').filter({ has: page.getByText(label, { exact: true }) });
    const srSwitch = levelRow('Показувати підтримку та опір').locator('input');
    const srLabels = levelRow('Показувати мітки S/R').locator('input');
    await levelRow('Показувати підтримку та опір').locator('.settingsSwitch').click();
    await levelRow('Показувати мітки S/R').locator('.settingsSwitch').click();
    assert.equal(await srSwitch.isChecked(), true);
    assert.equal(await srLabels.isChecked(), false, 'S/R labels can be hidden independently in visible settings');
    await levelRow('Показувати мітки S/R').locator('.settingsSwitch').click();
    await levelRow('Показувати підтримку та опір').locator('.settingsSwitch').click();
    const detection = levelRow('Таймфрейми автовизначення рівнів');
    assert.equal(await detection.getByRole('button', { name: '15m', exact: true }).isEnabled(), true, '15m remains available with all three higher timeframes enabled');
    if (width === 900) {
      assert.equal(await detection.getByRole('button', { name: '15m', exact: true }).getAttribute('aria-pressed'), 'false');
      await detection.getByRole('button', { name: '15m', exact: true }).click();
      assert.equal(await detection.getByRole('button', { name: '5m', exact: true }).getAttribute('aria-pressed'), 'false');
      await detection.getByRole('button', { name: '5m', exact: true }).click();
      await levelRow('Колір міток рівнів').locator('input').evaluate(node => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, '#f2a900');
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const markerSize = levelRow('Розмір міток рівнів').locator('input');
      await markerSize.fill('0.2');
      assert.equal(await markerSize.inputValue(), '0.2', 'Chrome accepts the fractional minimum');
      assert.equal(await markerSize.evaluate(node => node.validity.valid), true, '0.2px satisfies the input minimum and step');
      await markerSize.fill('16');
      await levelRow('Тип міток рівнів').getByRole('button', { name: 'Із заливкою', exact: true }).click();
      await levelRow('Тип ліній рівнів').getByRole('button', { name: 'Пунктир', exact: true }).click();
    } else {
      assert.equal(await levelRow('Колір міток рівнів').locator('input').inputValue(), '#f2a900');
      assert.equal(await levelRow('Розмір міток рівнів').locator('input').inputValue(), '16');
      assert.equal(await levelRow('Тип міток рівнів').getByRole('button', { name: 'Із заливкою', exact: true }).getAttribute('aria-pressed'), 'true');
      await levelRow('Тип міток рівнів').getByRole('button', { name: 'Із рамкою', exact: true }).click();
    }
    assert.deepEqual(await detection.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed'))), ['true', 'true', 'true', 'true', 'true'], 'all five detection timeframes can be selected together');
    if (width === 300) {
      await page.keyboard.press('Escape');
    } else {
      await panel.getByRole('button', { name: 'Закрити', exact: true }).click();
    }
    assert.equal(await settingsLayer.count(), 0, 'fullscreen settings close with Escape or close button');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden',
      'background scrolling is restored after settings close');
    assert.ok(await settings.evaluate(node => node === document.activeElement),
      'keyboard focus returns to the chart settings button');
    await toolbar.getByRole('button', { name: 'Розгорнути верхні інструменти' }).click();
    assert.equal(await toolbar.locator('.autoOverlayTools').count(), 1, 'expanding restores auxiliary tools');
  }
  assert.deepEqual(await page.evaluate(() => globalThis.chartActionClicks), { archive: 2, fullscreen: 2 }, 'both toolbar actions receive clicks at wide and narrow widths');

  await page.route('**/api/derivatives/oi?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, binance: { valueUsd: 7960000000, change5mPct: 0.07 }, bybit: { valueUsd: 4840000000, change5mPct: 0.04 } }),
  }));
  await page.evaluate(() => globalThis.mountAnalysisFixture());
  const analysis = page.locator('#analysis-fixture');
  await analysis.getByText('$7.96B', { exact: true }).waitFor();
  for (const width of [300, 390, 600, 900]) {
    await analysis.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
    const problems = await analysis.evaluate(node => {
      const problems = [];
      const bounds = node.getBoundingClientRect();
      const groups = [...node.querySelectorAll('.chart-top-analysis-group')];
      const boxes = groups.map(group => group.getBoundingClientRect());
      if (boxes.length !== 3 || boxes.some(box => Math.abs(box.top - boxes[0].top) > 1)) problems.push('analysis must remain in three columns');
      if (groups.some(group => parseFloat(getComputedStyle(group).fontSize) > 12)) problems.push('analysis text must stay compact');
      for (const group of node.querySelectorAll('.chart-top-analysis-group')) {
        const column = group.getBoundingClientRect();
        for (const span of group.querySelectorAll('span')) {
          const box = span.getBoundingClientRect();
          if (box.width && (box.left < column.left - 1 || box.right > column.right + 1)) problems.push(span.textContent);
        }
      }
      if (node.scrollWidth > bounds.width + 1) problems.push('horizontal overflow');
      return problems;
    });
    assert.deepEqual(problems, [], 'BTC prices, percentages and labels fit at ' + width + 'px');
  }
  console.log('PASS: analysis prices, percentages, OI and labels fit at 300, 390, 600 and 900px.');


  // Use the production stylesheet for the actual page sizing utilities.
  const asset = (await readdir('dist/assets')).find(name => /^index-.*\.css$/.test(name));
  await page.addStyleTag({ content: await readFile('dist/assets/' + asset, 'utf8') });
  await page.route('**/api/klines?**', async route => route.fulfill({ contentType:'application/json', body:JSON.stringify({success:true,data:await page.evaluate(() => globalThis.chartPageRows || [])}) }));
  await page.evaluate(() => globalThis.mountTerminalFixture());
  await page.waitForFunction(() => globalThis.terminalViewports?.left?.barWidth < 3 && globalThis.terminalViewports?.right?.barWidth < 3);
  const terminalLeft = page.locator('[data-terminal-card="left"] canvas');
  const terminalRight = page.locator('[data-terminal-card="right"] canvas');
  await terminalLeft.scrollIntoViewIfNeeded();
  const leftRect = await terminalLeft.boundingBox();
  const terminalPoint = { x:leftRect.x + 220, y:leftRect.y + 150 };
  const terminalViewport = id => page.evaluate(id => globalThis.terminalViewports[id], id);
  const rightBefore = await terminalViewport('right');
  const leftBefore = await terminalViewport('left');
  await page.mouse.move(terminalPoint.x, terminalPoint.y);
  assert.equal(await terminalLeft.evaluate(node => document.activeElement === node), true, 'hover activates the chosen Terminal card');
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(100);
  assert.ok((await terminalViewport('left')).barWidth > leftBefore.barWidth);
  assert.deepEqual(await terminalViewport('right'), rightBefore, 'wheel affects only the hovered Terminal card');
  await page.mouse.down();
  await page.mouse.move(terminalPoint.x + 30, terminalPoint.y + 25);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const afterPan = await terminalViewport('left');
  assert.notEqual(afterPan.rightOffset, leftBefore.rightOffset, 'Terminal supports horizontal pan');
  assert.equal(afterPan.autoY, false, 'Terminal supports vertical pan');
  assert.ok(afterPan.manualRange > 0);
  await page.evaluate(() => globalThis.appendTerminalCandle());
  await page.waitForTimeout(100);
  assert.deepEqual(await terminalViewport('left'), afterPan, 'live candles preserve manual Terminal navigation');
  const touchSession = await page.context().newCDPSession(page);
  const touchPoints = new Map();
  const pointer = async (type, id, x, y) => {
    if(type === 'pointerup') touchPoints.delete(id);
    else touchPoints.set(id, { id, x:leftRect.x + x, y:leftRect.y + y });
    await touchSession.send('Input.dispatchTouchEvent', { type:type === 'pointerdown' ? 'touchStart' : type === 'pointerup' ? (touchPoints.size ? 'touchMove' : 'touchEnd') : 'touchMove', touchPoints:[...touchPoints.values()] });
  };
  await pointer('pointerdown', 101, 120, 150);
  await pointer('pointerdown', 102, 320, 150);
  await pointer('pointermove', 101, 210, 100);
  await pointer('pointermove', 102, 230, 200);
  await page.waitForTimeout(100);
  const afterPinch = await terminalViewport('left');
  assert.ok(afterPinch.barWidth < afterPan.barWidth * .2, 'pinch can compress X deeply in a single gesture');
  assert.equal(afterPinch.manualRange, afterPan.manualRange, 'vertical finger distance does not change Y scale');
  assert.equal(afterPinch.manualCenter, afterPan.manualCenter, 'pinch preserves price center');
  await pointer('pointerup', 102, 230, 200);
  await pointer('pointermove', 101, 240, 115);
  await page.waitForTimeout(100);
  assert.notEqual((await terminalViewport('left')).rightOffset, afterPinch.rightOffset, 'remaining finger pans immediately after pinch');
  await pointer('pointerup', 101, 240, 115);
  await terminalLeft.evaluate(node => {
    const context = node.getContext('2d');
    let path = [];
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke']) {
      const original = context[method].bind(context);
      context[method] = (...args) => {
        if (method === 'beginPath') path = [];
        if (method === 'moveTo' || method === 'lineTo') path.push(args);
        if (method === 'stroke' && context.strokeStyle === '#758696') globalThis.touchCrosshairPath = path.map(point => [...point]);
        return original(...args);
      };
    }
  });
  const beforeInspect = await terminalViewport('left');
  await pointer('pointerdown', 103, 140, 150);
  await page.waitForTimeout(450);
  await pointer('pointermove', 103, 270, 190);
  await page.waitForTimeout(100);
  assert.deepEqual(await terminalViewport('left'), beforeInspect, 'hold and drag moves only the cursor without panning candles');
  const inspectedCursor = await page.evaluate(() => globalThis.touchCrosshairPath);
  assert.ok(Math.abs(inspectedCursor[0][0] - 270) < 1, 'touch cursor follows horizontal finger movement');
  assert.ok(Math.abs(inspectedCursor[2][1] - 190) < 1, 'touch cursor follows vertical finger movement without OHLC snapping');
  await pointer('pointerup', 103, 270, 190);
  await page.waitForTimeout(100);
  assert.deepEqual(await terminalViewport('left'), beforeInspect, 'releasing an inspection gesture keeps the viewport fixed');
  await pointer('pointerdown', 104, 140, 150);
  await pointer('pointermove', 104, 190, 180);
  await page.waitForTimeout(450);
  await pointer('pointermove', 104, 230, 200);
  await page.waitForTimeout(100);
  const afterTouchPan = await terminalViewport('left');
  assert.notEqual(afterTouchPan.rightOffset, beforeInspect.rightOffset, 'a new ordinary swipe pans horizontally after cursor inspection');
  assert.notEqual(afterTouchPan.manualCenter, beforeInspect.manualCenter, 'swiping pans vertically and does not turn into inspection after the hold delay');
  await pointer('pointerup', 104, 230, 200);
  await pointer('pointerdown', 105, 140, 150);
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  touchPoints.clear();
  await page.waitForTimeout(450);
  await pointer('pointerdown', 106, 140, 150);
  await pointer('pointermove', 106, 190, 175);
  await page.waitForTimeout(100);
  assert.notEqual((await terminalViewport('left')).rightOffset, afterTouchPan.rightOffset, 'a cancelled touch cannot leave a delayed cursor gesture behind');
  await pointer('pointerup', 106, 190, 175);
  const rightRect = await terminalRight.boundingBox();
  await page.mouse.move(rightRect.x + 100, rightRect.y + 100);
  assert.equal(await terminalRight.evaluate(node => document.activeElement === node), true, 'hover switches focus to another Terminal card');
  assert.deepEqual(await terminalViewport('right'), rightBefore, 'other card keeps its viewport throughout drag and pinch');

  await page.evaluate(() => globalThis.mountTerminalToolbarFixture());
  const terminalToolbarHost = page.locator('#terminal-toolbar-fixture');
  const terminalBlock = terminalToolbarHost.locator('.terminal-chart-block');
  const mainToolbar = terminalBlock.locator('.hookchart-terminal-toolbar');
  const footer = terminalBlock.locator('.hookchart-footer');
  const blockControls = mainToolbar.locator('.terminal-chart-integrated-toolbar');
  const menus = terminalBlock.locator('.terminal-chart-integrated-menus');
  await blockControls.waitFor();
  for (const width of [900, 600, 390, 300]) {
    await terminalToolbarHost.evaluate((node, width) => { node.style.width = width + 'px'; }, width);
    await terminalBlock.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    assert.equal(await terminalBlock.locator(':scope > .terminal-chart-header').count(), 0, 'HookChart has no separate block header row');
    assert.equal(await terminalBlock.locator('.hookchart-toolbar').count(), 1, 'block tools share the original timeframe toolbar');
    assert.equal(await footer.locator('.terminal-chart-header').count(), 0, 'block tools leave the bottom panel');
    const toolbarBox = await mainToolbar.boundingBox();
    const controlsBox = await blockControls.boundingBox();
    const timeframeBox = await mainToolbar.locator('.hookchart-timeframes').boundingBox();
    assert.ok(toolbarBox.height <= 28, 'block controls and timeframes share one compact top row');
    assert.ok(Math.abs(controlsBox.y + controlsBox.height / 2 - timeframeBox.y - timeframeBox.height / 2) <= 1, 'all controls align with the timeframe row');
    const stats = footer.locator('.marketStatsBar');
    assert.equal(await stats.count(), 1, 'the bottom market statistics panel returns');
    for (const label of ['Vol 24h:', 'Max:', 'Min:', 'Corr BTC:', 'Vol:']) {
      assert.ok((await stats.textContent()).includes(label), 'restored statistics include ' + label);
    }
    assert.equal(await blockControls.locator('.terminal-chart-drag-handle').getAttribute('draggable'), 'true', 'workspace dragging keeps its dedicated handle');
    await mainToolbar.evaluate(node => { node.scrollLeft = 0; });
    if (width === 300) {
      await mainToolbar.hover();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
      assert.ok(await mainToolbar.evaluate(node => node.scrollLeft > 0), 'the integrated toolbar scrolls after lazy chart mounting');
      await mainToolbar.evaluate(node => { node.scrollLeft = 0; });
      await stats.hover();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
      assert.ok(await stats.evaluate(node => node.scrollLeft > 0), 'all market statistics are reachable in narrow cards');
    }
    await blockControls.getByTitle('Змінити монету', { exact:true }).click();
    const coinMenu = menus.locator('.terminal-chart-header-popover');
    const coinBox = await coinMenu.boundingBox();
    const chartBox = await terminalBlock.locator('.hookchart-root').boundingBox();
    assert.ok(coinBox.y >= toolbarBox.y + toolbarBox.height && coinBox.y + coinBox.height <= chartBox.y + chartBox.height, 'coin menu opens below the toolbar inside the chart');
    assert.ok(coinBox.x >= chartBox.x && coinBox.x + coinBox.width <= chartBox.x + chartBox.width, 'coin menu stays within the narrow block');
    await coinMenu.getByRole('button', {name:/ETHUSDT/}).click();
    await page.waitForFunction(() => globalThis.terminalToolbarBlock.symbol === 'ETHUSDT');
    await blockControls.getByTitle('Змінити монету', { exact:true }).click();
    await coinMenu.getByRole('button', {name:/BTCUSDT/}).click();
    await blockControls.getByTitle('Ширина та висота блоку (1, 2, 3 колонки, висота)', { exact:true }).click();
    const sizeMenu = menus.locator('.terminal-chart-header-popover');
    const sizeBox = await sizeMenu.boundingBox();
    assert.ok(sizeBox.y >= toolbarBox.y + toolbarBox.height && sizeBox.y + sizeBox.height <= chartBox.y + chartBox.height, 'size menu fits below the toolbar in short cards');
    await sizeMenu.getByRole('button', {name:'2 колонки (Широкий)', exact:true}).click();
    await page.waitForFunction(() => globalThis.terminalToolbarBlock.colSpan === 2);
    for (const title of ['Надіслати в MetaScalp (001)', 'Налаштувати алерт у Telegram', 'Відкрити детальний графік з розширеним аналізом', 'Закрити графік']) {
      await blockControls.getByTitle(title, { exact:true }).click();
    }
  }
  assert.deepEqual(await page.evaluate(() => globalThis.terminalToolbarClicks), { fullscreen:4, remove:4, metaScalp:4, telegram:4 }, 'moved buttons retain their handlers at all widths');
  await blockControls.getByTitle('Змінити монету', { exact:true }).click();
  await mainToolbar.getByRole('button', {name:'Таймфрейм 15m',exact:true}).click();
  await page.waitForFunction(() => globalThis.terminalToolbarBlock.timeframe === '15m');
  assert.equal(await menus.locator('.terminal-chart-header-popover').count(), 0, 'timeframe selection closes the coin menu');
  const expand = mainToolbar.getByRole('button', {name:'Розгорнути верхні інструменти',exact:true});
  if (await expand.count()) await expand.click();
  await mainToolbar.getByRole('button', {name:'Поріг щільностей',exact:true}).click();
  const densityMenu = terminalBlock.locator('.hookchart-root > .densityQuickPopup');
  assert.ok(await densityMenu.isVisible(), 'native dropdowns escape the horizontal toolbar scroller');
  const densityBox = await densityMenu.boundingBox();
  const finalToolbarBox = await mainToolbar.boundingBox();
  assert.ok(densityBox.y >= finalToolbarBox.y + finalToolbarBox.height && densityBox.x + densityBox.width <= (await terminalBlock.boundingBox()).x + 300, 'density menu remains inside the narrow chart');
  await mainToolbar.getByRole('button', {name:'Згорнути верхні інструменти',exact:true}).click();
  assert.equal(await densityMenu.count(), 0, 'collapsing tools closes the density menu');
  await page.evaluate(() => globalThis.setTerminalToolbarProvider('tradingview'));
  await terminalBlock.locator(':scope > .terminal-chart-header').waitFor();
  assert.equal(await blockControls.count(), 0, 'TradingView retains its original controls');
  await page.evaluate(() => globalThis.setTerminalToolbarProvider('hookchart'));
  await blockControls.waitFor();
  await blockControls.getByTitle('Прикріпити стакан під цим графіком', { exact:true }).click();
  await page.waitForFunction(() => globalThis.terminalToolbarBlock.mode === 'combined');
  await blockControls.waitFor();
  await blockControls.getByTitle('Розділити на 2 окремі блоки (Графік та Стакан)', { exact:true }).click();
  await page.waitForFunction(() => globalThis.terminalToolbarBlock.mode === 'tradingview');
  await page.evaluate(() => globalThis.setTerminalToolbarMode('orderbook'));
  await terminalBlock.locator(':scope > .terminal-chart-header').waitFor();
  assert.equal(await blockControls.count(), 0, 'dedicated order books retain their original header');
  console.log('PASS: Terminal HookChart block controls share the top timeframe row at 900, 600, 390 and 300px; market statistics return below, menus remain clickable, and other providers keep their headers.');

  await page.evaluate(() => globalThis.mountChartPageFixture());
  await page.locator('.formation-details-chart-area .chart-fullscreen-action').click();
  await page.waitForFunction(() => location.hash.startsWith('#chart?'));
  const chartPage = page.getByRole('region', {name:'Повноекранний графік hookchart'});
  await chartPage.waitFor();
  assert.equal(await page.locator('.formation-details-chart-area').count(), 0, 'original chart is unmounted');
  assert.equal(await page.locator('[data-original-page]').count(), 0, 'original page is unmounted');
  assert.equal(await page.getByRole('dialog', {name:/Повноекранний графік/}).count(), 0, 'fullscreen page is not a modal');
  for (const size of [{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    const box = await chartPage.boundingBox();
    assert.ok(Math.abs(box.width-size.width)<2 && Math.abs(box.height-size.height)<2, 'chart page fits viewport');
    const plot = await chartPage.locator('.chartWrap > canvas').first().boundingBox();
    assert.ok(plot.height > 50 && plot.y + plot.height <= size.height+1, 'canvas fits below controls, including landscape');
  }
  await page.goBack();
  await page.locator('.formation-details-chart-area').waitFor();
  assert.equal(await page.getByRole('region', {name:'Повноекранний графік hookchart'}).count(), 0);
  await page.goForward();
  await chartPage.waitFor();
  await chartPage.getByRole('button', {name:'Вийти з повного екрана',exact:true}).click();
  await page.locator('.formation-details-chart-area').waitFor();
  console.log('PASS: fullscreen route replaces original chart/page, Back/Forward/exit work, and viewport sizing fits phone portrait/landscape and desktop.');

  await page.evaluate(() => globalThis.mountHeaderFixture());
  const header = page.locator('#header-fixture .app-header');
  const menu = header.locator('#header-quick-actions');
  const nextMenu = header.getByRole('button', { name: 'Прокрутити верхнє меню праворуч', exact: true });
  await header.waitFor();
  const menuPosition = () => menu.evaluate(node => ({ left: node.scrollLeft, end: node.scrollWidth - node.clientWidth }));
  for (const width of [320, 390, 768, 844, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await menu.evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
    await page.waitForTimeout(100);
    const languageBox = await header.locator('select').boundingBox();
    const arrowBox = await nextMenu.boundingBox();
    const headerBox = await header.boundingBox();
    assert.ok(arrowBox.x >= languageBox.x + languageBox.width, 'arrow stays to the right of the language selector at ' + width + 'px');
    assert.ok(Math.abs(arrowBox.y + arrowBox.height / 2 - languageBox.y - languageBox.height / 2) < 1, 'arrow shares the language-selector row');
    assert.ok(arrowBox.width <= 24 && arrowBox.height <= 28, 'arrow remains compact');
    assert.equal(await nextMenu.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'arrow has no background');
    assert.equal(await nextMenu.locator('svg').getAttribute('width'), '14', 'arrow icon is smaller');
    const arrowDecoration = await nextMenu.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.outlineStyle, style.boxShadow];
    });
    assert.deepEqual(arrowDecoration.slice(0, 5), ['0px', '0px', '0px', '0px', 'none'], 'arrow has no border or outline');
    assert.ok(hasNoVisibleShadow(arrowDecoration[5]), 'arrow has no visible shadow');
    assert.ok(headerBox.x >= 0 && headerBox.x + headerBox.width <= width + 1, 'header fits the viewport');
    const initial = await menuPosition();
    assert.equal(await nextMenu.isEnabled(), initial.end > 1, 'arrow follows actual menu overflow after resizing');
    if (initial.end <= 1) continue;
    await nextMenu.click();
    await page.waitForFunction(() => document.getElementById('header-quick-actions').scrollLeft > 1);
    await page.waitForTimeout(400);
    assert.ok((await menuPosition()).left > initial.left, 'native click reveals the next menu actions');
    assert.equal((await nextMenu.boundingBox()).x, arrowBox.x, 'scrolling never moves the arrow away');
    for (let step = 0; step < 12; step++) {
      const position = await menuPosition();
      if (position.left >= position.end - 1) break;
      await nextMenu.click();
      await page.waitForTimeout(400);
    }
    const end = await menuPosition();
    assert.ok(end.left >= end.end - 1, 'repeated clicks reach every action at ' + width + 'px');
    const lastBox = await header.locator('#auth-login-btn').boundingBox();
    const menuBox = await menu.boundingBox();
    assert.ok(lastBox.x >= menuBox.x - 1 && lastBox.x + lastBox.width <= menuBox.x + menuBox.width + 1, 'last action is fully reachable');
    await header.locator('#auth-login-btn').click();
    await nextMenu.click();
    await page.waitForFunction(() => document.getElementById('header-quick-actions').scrollLeft < 1);
  }
  assert.ok((await page.evaluate(() => globalThis.headerActionClicks.auth)) > 0, 'revealed action retains its click handler');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const headerTouch = await page.context().newCDPSession(page);
  const arrowTouchBox = await nextMenu.boundingBox();
  const arrowTouch = { x: arrowTouchBox.x + arrowTouchBox.width / 2, y: arrowTouchBox.y + arrowTouchBox.height / 2 };
  await headerTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...arrowTouch }] });
  await headerTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.getElementById('header-quick-actions').scrollLeft > 1);
  await page.waitForTimeout(400);
  await menu.evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
  await nextMenu.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('header-quick-actions').scrollLeft > 1);
  await page.waitForTimeout(400);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await menu.evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
  await nextMenu.click();
  assert.ok((await menuPosition()).left > 1, 'reduced motion scrolls immediately');
  await headerTouch.detach();
  console.log('PASS: compact transparent header arrow stays beside the language selector, reveals all actions and returns to the start at 320–1440px; native touch, mouse, keyboard, resize and reduced motion work.');


  const androidContext = await browser.newContext({ ...devices['Pixel 7'] });
  const androidPage = await androidContext.newPage();
  androidPage.on('pageerror', error => errors.push(error.message));
  const fixtureUrl = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/hookchart-wheel-browser.html`;
  await androidPage.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(fixtureUrl).origin) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], alerts: [], history: [] }) });
    return route.continue();
  });
  await androidPage.goto(fixtureUrl);
  await androidPage.addStyleTag({ content: await readFile('dist/assets/' + asset, 'utf8') });
  await androidPage.evaluate(() => globalThis.mountHeaderFixture());
  const androidHeader = androidPage.locator('#header-fixture .app-header');
  const androidMenu = androidHeader.locator('#header-quick-actions');
  const androidArrow = androidHeader.getByRole('button', { name: 'Прокрутити верхнє меню праворуч', exact: true });
  await androidArrow.waitFor();
  assert.ok(await androidPage.evaluate(() => navigator.userAgent.includes('Android') && navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches), 'Android context uses mobile touch input');
  for (const width of [devices['Pixel 7'].viewport.width, 320]) {
    await androidPage.setViewportSize({ width, height: devices['Pixel 7'].viewport.height });
    await androidMenu.evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
    await androidArrow.tap();
    await androidPage.waitForFunction(() => document.getElementById('header-quick-actions').scrollLeft > 1);
    await androidPage.waitForTimeout(400);
    for (let step = 0; step < 12; step++) {
      const atEnd = await androidMenu.evaluate(node => node.scrollLeft >= node.scrollWidth - node.clientWidth - 1);
      if (atEnd) break;
      await androidArrow.tap();
      await androidPage.waitForTimeout(400);
    }
    assert.ok(await androidMenu.evaluate(node => node.scrollLeft >= node.scrollWidth - node.clientWidth - 1), 'Android taps reveal all menu actions at ' + width + 'px');
    const lastBox = await androidHeader.locator('#auth-login-btn').boundingBox();
    const menuBox = await androidMenu.boundingBox();
    assert.ok(lastBox.x >= menuBox.x - 1 && lastBox.x + lastBox.width <= menuBox.x + menuBox.width + 1, 'last action is visible on Android');
    const androidDecoration = await androidArrow.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.borderTopWidth, style.outlineStyle, style.boxShadow];
    });
    assert.deepEqual(androidDecoration.slice(0, 3), ['rgba(0, 0, 0, 0)', '0px', 'none'],
      'Android arrow stays transparent and borderless after tapping');
    assert.ok(hasNoVisibleShadow(androidDecoration[3]), 'Android arrow has no visible shadow');
    await androidArrow.tap();
    await androidPage.waitForFunction(() => document.getElementById('header-quick-actions').scrollLeft < 1);
  }
  await androidPage.evaluate(() => globalThis.mountToolbarFixture());
  const androidChart = androidPage.locator('#toolbar-fixture');
  await androidChart.locator('.chartSettingsBtn').waitFor();
  await androidChart.evaluate(node => { node.style.width = '300px'; });
  await androidChart.locator('.chartSettingsBtn').tap();
  const androidSettings = androidPage.locator('body > .hookchart-settings-portal .originalSettingsPanel');
  await androidSettings.waitFor();
  const androidPanelRect = await androidSettings.boundingBox();
  const androidViewport = androidPage.viewportSize();
  assert.ok(Math.abs(androidPanelRect.width - androidViewport.width) <= 2 &&
    Math.abs(androidPanelRect.height - androidViewport.height) <= 2,
    'Android full-screen settings cover the entire device viewport, not the 300px chart tile');
  const strategyTab = androidSettings.getByRole('button', { name: 'Стратегії', exact: true });
  await strategyTab.tap();
  assert.equal(await strategyTab.getAttribute('class'), 'active',
    'Android touch can switch fullscreen settings tabs');
  await androidSettings.getByRole('button', { name: 'Закрити', exact: true }).tap();
  assert.equal(await androidSettings.count(), 0, 'Android can close the fullscreen chart settings');
  await androidContext.close();
  console.log('PASS: Android chart settings fill the device viewport and close with touch input.');

  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(`PASS: Chrome ${browser.version()} verifies clickable archive and fullscreen actions to the right of settings at 900px and 300px, including their colors and visibility when tools are collapsed; price labels, countdown, wheel input and backgrounds still work.`);
} finally {
  await browser?.close();
  await server.close();
}

