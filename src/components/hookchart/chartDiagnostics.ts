/**
 * On-demand, browser-local HookChart diagnostics.
 * Enable with ?hookchartPerf=1 on a live chart URL.
 * This never phones home, stores user data or touches Replay.
 */
const enabled = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('hookchartPerf') === '1';

let users = 0;
let box: HTMLDivElement | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let frameId: number | null = null;
let rafCount = 0;
let rafStartedAt = 0;
let latestFps = 0;
let painted = 0;
let durationTotal = 0;
let durationMax = 0;
let klineCount = 0;
let latencySamples = 0;
let latencyTotal = 0;
let latencyMax = 0;
let relays = 0;
let directs = 0;
let reconnects = 0;
let transportErrors = 0;
let recurrenceScans = 0;
let recurrenceLastMs = 0;
let recurrenceMaxMs = 0;
let recurrenceTotalMs = 0;
let recurrenceLastBars = 0;
let recurrenceHistoryPages = 0;
let recurrenceHistoryReuses = 0;
let recurrenceHistoryCancelled = 0;

/** Local opt-in diagnostics: never sent to a server or stored in user preferences. */
export function recordRecurrenceWorker(durationMs: number, bars: number) {
  if (!enabled || !Number.isFinite(durationMs)) return;
  recurrenceScans++;
  recurrenceLastMs = durationMs;
  recurrenceMaxMs = Math.max(recurrenceMaxMs, durationMs);
  recurrenceTotalMs += durationMs;
  recurrenceLastBars = bars;
}
export function recordRecurrenceHistoryPage() {
  if (enabled) recurrenceHistoryPages++;
}
export function recordRecurrenceHistoryReuse() {
  if (enabled) recurrenceHistoryReuses++;
}
export function recordRecurrenceHistoryCancel() {
  if (enabled) recurrenceHistoryCancelled++;
}


export function chartDiagnosticsEnabled(): boolean { return enabled; }
export function recordChartPaint(durationMs: number) {
  if (!enabled) return;
  painted++;
  durationTotal += durationMs;
  durationMax = Math.max(durationMax, durationMs);
}
export function recordChartKline(source: 'relay' | 'exchange', eventTime: number) {
  if (!enabled) return;
  klineCount++;
  if (source === 'relay') relays++;
  else directs++;
  if (Number.isFinite(eventTime) && eventTime > 0) {
    const lag = Date.now() - eventTime;
    // Ignore corrupt exchange time rather than showing unreasonable latency.
    if (lag >= 0 && lag < 120_000) {
      latencySamples++;
      latencyTotal += lag;
      latencyMax = Math.max(latencyMax, lag);
    }
  }
}
export function recordChartReconnect() { if (enabled) reconnects++; }
export function recordChartTransportError() { if (enabled) transportErrors++; }

function frame(now: number) {
  if (typeof document === 'undefined' || document.visibilityState === 'hidden') {
    frameId = null;
    rafStartedAt = 0;
    rafCount = 0;
    return;
  }
  if (!rafStartedAt) rafStartedAt = now;
  rafCount++;
  const elapsed = now - rafStartedAt;
  if (elapsed >= 1800) {
    latestFps = Math.round(rafCount * 1000 / elapsed);
    rafCount = 0;
    rafStartedAt = now;
  }
  frameId = requestAnimationFrame(frame);
}
function render() {
  if (!box) return;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const mb = memory?.usedJSHeapSize ? (memory.usedJSHeapSize / 1048576).toFixed(1) + ' MiB' : 'н/д (браузер)';
  const avgDraw = painted ? (durationTotal / painted).toFixed(1) : 'н/д';
  const avgDelay = latencySamples ? Math.round(latencyTotal / latencySamples) + ' мс' : 'н/д';
  const maxDelay = latencySamples ? Math.round(latencyMax) + ' мс' : 'н/д';
  box.textContent = [
    'HookChart · діагностика цієї вкладки',
    'FPS браузера: ' + latestFps + ' · JS heap: ' + mb,
    'Canvas: ' + painted + ' кадрів · середній час ' + avgDraw + ' мс · макс. ' + durationMax.toFixed(1) + ' мс',
    'Kline: ' + klineCount + ' · затримка в середньому ' + avgDelay + ' · макс. ' + maxDelay,
    'Kline VPS/біржа: ' + relays + ' / ' + directs,
    'Повторні WS / помилки: ' + reconnects + ' / ' + transportErrors,
    'Закономірності · розрахунків: ' + recurrenceScans +
      ' · останній ' + recurrenceLastMs.toFixed(1) + ' мс' +
      ' · середній ' + (recurrenceScans ? recurrenceTotalMs / recurrenceScans : 0).toFixed(1) +
      ' мс · макс. ' + recurrenceMaxMs.toFixed(1) + ' мс' +
      ' · свічок ' + recurrenceLastBars,
    'Історія аналізу · запитів сторінок: ' + recurrenceHistoryPages +
      ' · повторне використання: ' + recurrenceHistoryReuses +
      ' · скасовано: ' + recurrenceHistoryCancelled,
    'CPU VPS і помилки бірж: приватний /api/ops/market-data',
    'Для вимкнення: прибери ?hookchartPerf=1 з URL',
  ].join('\n');
}

export function connectChartDiagnostics(): () => void {
  if (!enabled || typeof document === 'undefined') return () => {};
  users++;
  if (users === 1) {
    box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'off');
    box.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483000',
      'max-width:min(370px,calc(100vw - 24px))', 'max-height:32vh', 'overflow:auto',
      'background:rgba(8,17,29,.94)', 'color:#bcf0ff', 'border:1px solid #287c93',
      'border-radius:10px', 'padding:10px', 'font:11px/1.5 ui-monospace,monospace',
      'white-space:pre-wrap', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(box);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        rafStartedAt = 0;
        rafCount = 0;
      } else if (frameId === null) {
        frameId = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();
    render();
    heartbeat = setInterval(render, 2000);
    disposeVisibility = () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--users) return;
    if (heartbeat !== null) clearInterval(heartbeat);
    if (frameId !== null) cancelAnimationFrame(frameId);
    heartbeat = null; frameId = null;
    rafStartedAt = 0;
    rafCount = 0;
    disposeVisibility?.(); disposeVisibility = null;
    box?.remove(); box = null;
  };
}
let disposeVisibility: (() => void) | null = null;
