import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Dark, touch-friendly dropdown matching the screener's volume filter menu.
 * The floating list is portaled outside scrollable configuration modals so
 * mobile Safari never replaces it with its native bright select picker.
 */
export interface SurveillanceDropdownOption<Value extends string> {
  value: Value;
  label: string;
}

interface Props<Value extends string> {
  id: string;
  labelId: string;
  value: Value;
  options: ReadonlyArray<SurveillanceDropdownOption<Value>>;
  onChange: (value: Value) => void;
}

export function SurveillanceFieldDropdown<Value extends string>({
  id,
  labelId,
  value,
  options,
  onChange,
}: Props<Value>) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = id + '-options';
  const valueId = id + '-value';
  const optionId = (index: number) => id + '-option-' + index;

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const reposition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const margin = 8;
      const gap = 5;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const below = Math.max(0, viewportTop + viewportHeight - anchor.bottom - gap - margin);
      const above = Math.max(0, anchor.top - viewportTop - gap - margin);
      const showBelow = below >= Math.min(110, above);
      const maxHeight = Math.min(240, showBelow ? below : above);
      // Market names must not be clipped by their half-width form field.
      const width = Math.min(Math.max(anchor.width, 184), Math.max(0, viewportWidth - margin * 2));
      // Clamp *both* menus to the visible viewport, including the right field.
      const left = Math.max(
        viewportLeft + margin,
        Math.min(anchor.left, viewportLeft + viewportWidth - width - margin),
      );
      setPosition({
        width,
        maxHeight,
        left,
        ...(showBelow
          ? { top: anchor.bottom + gap }
          : { bottom: window.innerHeight - anchor.top + gap }),
      });
    };

    const onOutside = (event: Event) => {
      const target = event.target as Node | null;
      if (event.type === 'focusin' && (target === document.body || target === document.documentElement)) return;
      if (target && !triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
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
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('blur', onBlur);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    return () => {
      resizeObserver?.disconnect();
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
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
    const current = list.children[activeIndex] as HTMLElement | undefined;
    if (current) {
      if (current.offsetTop < list.scrollTop) list.scrollTop = current.offsetTop;
      else if (current.offsetTop + current.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = current.offsetTop + current.offsetHeight - list.clientHeight;
      }
    }
  }, [open, position, activeIndex]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
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
    } else if (event.key.length === 1) {
      const match = options.findIndex(item => item.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (match >= 0) setActiveIndex(match);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId + ' ' + valueId}
        onClick={() => open ? close() : (setActiveIndex(selectedIndex), setOpen(true))}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : selectedIndex;
            setActiveIndex(index);
            setOpen(true);
          }
        }}
        className="flex min-h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2 text-left text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70"
      >
        <span id={valueId} className="min-w-0 truncate">{options[selectedIndex]?.label ?? value}</span>
        <ChevronDown aria-hidden="true" className={'h-4 w-4 shrink-0 text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && position && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={onListKeyDown}
          style={position}
          className="fixed z-[100] m-0 list-none overflow-y-auto overscroll-contain touch-pan-y rounded-xl border border-slate-700 bg-slate-950 p-1.5 text-sm shadow-2xl shadow-black/70 outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              onClick={() => choose(index)}
              onPointerMove={event => { if (event.pointerType === 'mouse') setActiveIndex(index); }}
              className={'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors '
                + (activeIndex === index || option.value === value ? 'bg-slate-800 ' : 'hover:bg-slate-900 ')
                + (option.value === value ? 'text-cyan-300' : 'text-slate-300')}
            >
              <span className="h-4 w-4 shrink-0" aria-hidden="true">
                {option.value === value && <Check className="h-4 w-4 stroke-[2.5]" />}
              </span>
              <span className="min-w-0">{option.label}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
