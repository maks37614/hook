import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface TimeframeMenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/** Position the custom list outside the toolbar's clipped scroll region. */
export function timeframeMenuPosition(
  anchor: Pick<DOMRect, 'left' | 'top' | 'bottom' | 'width'>,
  viewport: { left: number; top: number; width: number; height: number },
  count: number,
): TimeframeMenuPosition {
  const margin = 8;
  const width = Math.min(Math.max(176, anchor.width), Math.max(1, viewport.width - 2 * margin));
  const left = Math.max(viewport.left + margin,
    Math.min(anchor.left, viewport.left + viewport.width - width - margin));
  const desiredHeight = Math.min(Math.max(1, count) * 43 + 12, Math.max(1, viewport.height - margin * 2));
  const below = Math.max(0, viewport.top + viewport.height - anchor.bottom - margin - 4);
  const above = Math.max(0, anchor.top - viewport.top - margin - 4);
  const openBelow = below >= desiredHeight || below >= above;
  const maxHeight = Math.min(desiredHeight, Math.max(1, openBelow ? below : above));
  const top = Math.max(viewport.top + margin,
    Math.min(openBelow ? anchor.bottom + 4 : anchor.top - maxHeight - 4,
      viewport.top + viewport.height - maxHeight - margin));
  return { left, top, width, maxHeight };
}

interface HookChartTimeframePickerProps {
  timeframes: readonly string[];
  timeframe: string;
  disabled?: boolean;
  /** Only reveal the secondary compact timeframe menu while extra tools are expanded. */
  compactAvailable?: boolean;
  onChange: (timeframe: string) => void;
}

export function HookChartTimeframePicker({
  timeframes, timeframe, disabled = false, compactAvailable = true, onChange,
}: HookChartTimeframePickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TimeframeMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const optionsKey = timeframes.join('|');

  // The choice may also change via a keyboard shortcut, toolbar button or Replay.
  useEffect(() => { setOpen(false); }, [timeframe, optionsKey, disabled, compactAvailable]);

  useEffect(() => {
    if (!open) return;
    (menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      || menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]'))
      ?.focus({ preventScroll: true });

    const onOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.visualViewport?.addEventListener('resize', close);
    window.visualViewport?.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.visualViewport?.removeEventListener('resize', close);
      window.visualViewport?.removeEventListener('scroll', close);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const visual = window.visualViewport;
    setPosition(timeframeMenuPosition(rect, {
      left: visual?.offsetLeft ?? 0,
      top: visual?.offsetTop ?? 0,
      width: visual?.width ?? window.innerWidth,
      height: visual?.height ?? window.innerHeight,
    }, timeframes.length));
    setOpen(true);
  };

  const select = (value: string) => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
    if (value !== timeframe) onChange(value);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    if (!options.length) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length
        : (index + options.length - 1) % options.length;
    options[next]?.focus({ preventScroll: true });
  };

  return <div className="hookchart-timeframes" role="group" aria-label="Таймфрейм">
    <div className="hookchart-timeframes-buttons">
      {timeframes.map(tf => <button key={tf} type="button" aria-label={'Таймфрейм ' + tf}
        aria-pressed={timeframe === tf} disabled={disabled}
        className={timeframe === tf ? 'active' : ''} onClick={() => select(tf)}>{tf}</button>)}
    </div>
    {compactAvailable && <button type="button" ref={triggerRef} className="hookchart-timeframes-compact"
      aria-label="Вибрати таймфрейм" title="Змінити таймфрейм"
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!open) toggle();
        }
      }}>
      <span>{timeframe}</span><ChevronDown size={12} aria-hidden="true" />
    </button>}
    {compactAvailable && open && position && createPortal(
      <div id={menuId} ref={menuRef} className="hookchart-timeframe-menu" role="listbox"
        aria-label="Виберіть таймфрейм" onKeyDown={onMenuKeyDown}
        style={{ left: position.left, top: position.top,
          width: position.width, maxHeight: position.maxHeight }}>
        {timeframes.map(tf => <button key={tf} type="button" role="option"
          aria-selected={timeframe === tf} tabIndex={-1}
          className={'hookchart-timeframe-option' + (timeframe === tf ? ' selected' : '')}
          onClick={() => select(tf)}>
          <span className="hookchart-timeframe-option-check" aria-hidden="true">
            {timeframe === tf && <Check size={17} strokeWidth={2.3}/>}
          </span>
          <span>{tf}</span>
        </button>)}
      </div>, document.body)}
  </div>;
}
