/**
 * One frame-budget queue for mounting Terminal HookCharts.
 *
 * Visible tiles may enter the scroll viewport together on iPad. Starting all
 * their high-DPR canvases, history, and overlays in the same React commit causes
 * a long main-thread task. Mount at most one *currently visible* tile per frame.
 * Cancelling an offscreen tile removes it from the pending queue; no preloading.
 *
 * The browser's frame scheduler is the only clock here. No server polls,
 * exchange sockets, persistent timers, or DPR changes are introduced.
 */
export function createTerminalChartMountQueue(clock: {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
} = {
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
}) {
  type Item = { mount: () => void; cancelled: boolean };
  const pending: Item[] = [];
  let frame: number | null = null;

  const advance = () => {
    frame = null;
    let next: Item | undefined;
    while (pending.length) {
      const candidate = pending.shift()!;
      if (!candidate.cancelled) { next = candidate; break; }
    }
    // Schedule the next ticket *before* React can commit the mounted chart.
    if (pending.some(item => !item.cancelled)) frame = clock.request(advance);
    next?.mount();
  };

  return {
    enqueue(mount: () => void): () => void {
      const item: Item = { mount, cancelled: false };
      pending.push(item);
      if (frame === null) frame = clock.request(advance);
      return () => {
        item.cancelled = true;
        const index = pending.indexOf(item);
        if (index >= 0) pending.splice(index, 1);
        if (!pending.length && frame !== null) {
          clock.cancel(frame);
          frame = null;
        }
      };
    },
    pendingCount: () => pending.length,
  };
}

/** Single instance across all Terminal cards in one browser document. */
export const terminalChartMountQueue = createTerminalChartMountQueue();
