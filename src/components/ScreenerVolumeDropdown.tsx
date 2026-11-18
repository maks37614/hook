import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { SCREENER_VOLUME_CAPS, type ScreenerVolumeMode } from '../utils/screenerVolume';
import { useLanguage } from '../context/LanguageContext';


interface Props {
  id: string;
  labelId: string;
  value: number;
  mode?: ScreenerVolumeMode;
  onChange: (value: number) => void;
}

export const ScreenerVolumeDropdown: React.FC<Props> = ({ id, labelId, value, mode = 'to', onChange }) => {
  const { t } = useLanguage();
  const unlimited = t('screenerVolumeUnlimited');
  const options = useMemo(() => {
    const entries: Array<{ value: number; label: string }> = [
      { value: 0, label: unlimited },
      ...SCREENER_VOLUME_CAPS.map(option => ({
        value: option.value,
        // The direction is shown by the adjacent ≥ / ≤ sign and switch icon.
        label: option.label.replace(/^До /, ''),
      })),
    ];
    // Saved presets can contain numeric thresholds between the predefined tiers.
    // Preserve their real filter value instead of incorrectly displaying "unlimited".
    if (Number.isFinite(value) && value > 0 && !entries.some(option => option.value === value)) {
      const label = '$' + new Intl.NumberFormat('en-US', {
        notation: 'compact', maximumFractionDigits: 2,
      }).format(value);
      const insertAt = entries.findIndex(option => option.value > value);
      entries.splice(insertAt < 0 ? entries.length : insertAt, 0, { value, label });
    }
    return entries;
  }, [unlimited, value]);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef({ text: '', time: 0 });
  const listId = id + '-options';
  const valueId = id + '-value';
  const optionId = (index: number) => id + '-option-' + index;

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  const choose = (index: number) => {
    onChange(options[index].value);
    close(true);
  };

  const openAt = (index: number) => {
    setActiveIndex(index);
    searchRef.current = { text: '', time: 0 };
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const reposition = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const margin = 8;
      const gap = 4;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const below = Math.max(0, viewportTop + viewportHeight - anchor.bottom - gap - margin);
      const above = Math.max(0, anchor.top - viewportTop - gap - margin);
      const showBelow = below >= Math.min(192, above);
      const maxHeight = Math.min(224, showBelow ? below : above);
      const width = Math.min(anchor.width, Math.max(0, viewportWidth - margin * 2));
      const left = Math.max(viewportLeft + margin,
        Math.min(anchor.right - width, viewportLeft + viewportWidth - width - margin));
      setPosition({
        width, maxHeight, left,
        ...(showBelow
          ? { top: anchor.bottom + gap }
          : { bottom: window.innerHeight - anchor.top + gap }),
      });
    };

    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (event.type === 'focusin' && (target === document.body || target === document.documentElement)) return;
      if (target && !buttonRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !listRef.current?.contains(event.target)) reposition();
    };
    const onBlur = () => setOpen(false);

    reposition();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    resizeObserver?.observe(document.body);
    if (buttonRef.current) resizeObserver?.observe(buttonRef.current);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('blur', onBlur);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    return () => {
      resizeObserver?.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('blur', onBlur);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    };
  }, [open]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !position || !list) return;
    list.focus({ preventScroll: true });
    const option = list.children[activeIndex] as HTMLElement | undefined;
    if (!option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [open, position, activeIndex]);

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Tab') {
      close(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
      return;
    }
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (activeIndex + 1) % options.length
      : event.key === 'ArrowUp' ? (activeIndex - 1 + options.length) % options.length
      : null;
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const key = event.key.toLocaleLowerCase();
      const text = now - searchRef.current.time < 700 ? searchRef.current.text + key : key;
      searchRef.current = { text, time: now };
      const match = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(text));
      if (match >= 0) {
        event.preventDefault();
        setActiveIndex(match);
      }
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId + ' ' + valueId}
        title={mode === 'from'
          ? t('screener.volume.fromTooltip')
          : t('screener.volume.toTooltip')}
        onClick={() => open ? close() : openAt(selectedIndex)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            openAt(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : selectedIndex);
          }
        }}
        className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-md bg-transparent px-0 py-1 text-xs font-medium text-slate-200 transition-colors hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/70"
      >
        <span id={valueId} className="flex min-w-0 items-center gap-1 truncate">
          {value > 0 && <span className="shrink-0 font-bold text-cyan-400">{mode === 'from' ? '≥' : '≤'}</span>}
          <span className="truncate">{options[selectedIndex].label}</span>
        </span>
        <ChevronDown aria-hidden="true" className={'h-3 w-3 shrink-0 text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && position && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={handleListKeyDown}
          style={position}
          className="fixed z-[100] m-0 list-none overflow-y-auto overscroll-contain touch-pan-y rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs shadow-xl outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              onClick={() => choose(index)}
              onPointerMove={event => { if (event.pointerType === 'mouse') setActiveIndex(index); }}
              className={'flex min-h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 '
                + (activeIndex === index ? 'bg-slate-800 ' : '')
                + (option.value === value ? 'text-cyan-300' : 'text-slate-300')}
            >
              <span className="h-3 w-3 shrink-0" aria-hidden="true">
                {option.value === value && <Check className="h-3 w-3" />}
              </span>
              <span>{option.label}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
};
