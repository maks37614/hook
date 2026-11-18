interface FrameClock {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
}

/** Coalesce pointer-only frames; data/viewport changes always take precedence. */
export function createChartFrameScheduler(
  render: { scene: () => void; interaction: () => void },
  clock: FrameClock = {
    request: callback => requestAnimationFrame(callback),
    cancel: id => cancelAnimationFrame(id),
  },
) {
  let frame: number | null = null;
  let needsScene = false;
  let generation = 0;
  const cancel = () => {
    generation++;
    if (frame !== null) clock.cancel(frame);
    frame = null;
    needsScene = false;
  };
  return {
    request(scene = true) {
      needsScene ||= scene;
      if (frame !== null) return;
      const token = ++generation;
      frame = clock.request(() => {
        if (token !== generation) return;
        frame = null;
        const full = needsScene;
        needsScene = false;
        if (full) render.scene();
        else render.interaction();
      });
    },
    /** React has committed new scene inputs; paint once and drop an older queued frame. */
    flush() {
      cancel();
      render.scene();
    },
    cancel,
  };
}
