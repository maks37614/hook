import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Gauge } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const REPLAY_SPEED_OPTIONS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '5x', value: 5 },
  { label: '10x', value: 10 },
] as const;

type MenuPosition = { left: number; top: number; width: number; maxHeight: number };

/** Anchors the popup directly below the button; keeps it inside a narrow screen. */
export function positionReplaySpeedMenu(
  anchor: Pick<DOMRect, 'left' | 'bottom'>,
  viewport: { width: number; height: number; offsetLeft?: number; offsetTop?: number },
  width = 116,
): MenuPosition {
  const visibleLeft = viewport.offsetLeft ?? 0;
  const visibleTop = viewport.offsetTop ?? 0;
  return {
    left: Math.max(visibleLeft + 8, Math.min(anchor.left, visibleLeft + viewport.width - width - 8)),
    top: anchor.bottom + 4,
    width,
    maxHeight: Math.max(72, visibleTop + viewport.height - anchor.bottom - 12),
  };
}

export function ReplaySpeedPicker({ speed, onSpeedChange }: {
  speed: number;
  onSpeedChange: (speed: number) => void;
}) {
  const { t } = useLanguage();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const visible = window.visualViewport;
    setPosition(positionReplaySpeedMenu(triggerRef.current.getBoundingClientRect(), {
      width: visible?.width ?? window.innerWidth,
      height: visible?.height ?? window.innerHeight,
      offsetLeft: visible?.offsetLeft ?? 0,
      offsetTop: visible?.offsetTop ?? 0,
    }));
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open, updatePosition]);

  const hasMenuPosition = Boolean(position);
  useEffect(() => {
    if (open && hasMenuPosition) {
      listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
        ?.focus({ preventScroll: true });
    }
  }, [open, hasMenuPosition]);

  const chooseSpeed = (next: number) => {
    onSpeedChange(next);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!options.length) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length
      : (index - 1 + options.length) % options.length;
    options[next]?.focus({ preventScroll: true });
  };

  // iPhone Safari otherwise opens its native white picker sheet.
  // The portal escapes HookChart's horizontally scrolling toolbar.
  // Portals must be inside the fullscreen element when native fullscreen is active.
  const fullElement = typeof document !== 'undefined'
    ? (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement)
    : null;
  const portalHost = fullElement && typeof HTMLElement !== 'undefined' && fullElement instanceof HTMLElement
    ? fullElement : typeof document !== 'undefined' ? document.body : null;

  return (
    <>
      <div
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 px-1.5 py-0.5 text-[10px] text-slate-300"
        role="group"
        aria-label={t("replay.chart.speed.title")}
      >
        <Gauge className="h-3 w-3 shrink-0 text-cyan-400" aria-hidden="true" />
        <span className="hidden whitespace-nowrap sm:inline">{t("replay.chart.speed.label")}</span>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t("replay.chart.speed.choose")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          title={t("replay.chart.speed.title")}
          onClick={() => setOpen(previous => !previous)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="inline-flex shrink-0 items-center justify-between gap-1 rounded border border-slate-700 bg-slate-950 font-mono text-[11px] font-bold text-cyan-300"
          style={{ display: 'inline-flex', width: 'auto', minWidth: 61, height: 25, padding: '0 6px', color: '#67e8f9' }}
        >
          <span>{REPLAY_SPEED_OPTIONS.find(option => option.value === speed)?.label ?? String(speed) + 'x'}</span>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        </button>
      </div>
      {open && position && portalHost && createPortal(
        <div
          ref={listRef}
          id={menuId}
          role="listbox"
          aria-label="Швидкість відтворення"
          data-replay-speed-menu="true"
          onKeyDown={handleListKeyDown}
          className="overflow-y-auto overscroll-contain rounded-lg border border-slate-600 bg-[#152238] p-1 shadow-2xl shadow-black/70"
          style={{
            position: 'fixed', zIndex: 2147483647,
            left: position.left, top: position.top,
            width: position.width, maxHeight: position.maxHeight,
          }}
        >
          {REPLAY_SPEED_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === speed}
              onClick={() => chooseSpeed(option.value)}
              className={'flex w-full items-center justify-between rounded px-2.5 py-2 text-left font-mono text-xs transition-colors ' + (
                speed === option.value
                  ? 'bg-cyan-900/70 font-bold text-cyan-200'
                  : 'text-slate-200 hover:bg-slate-700 active:bg-slate-600'
              )}
            >
              {option.label}
              {speed === option.value && <Check className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />}
            </button>
          ))}
        </div>,
        portalHost,
      )}
    </>
  );
}
