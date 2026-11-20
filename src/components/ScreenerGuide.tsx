import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import {
  SCREENER_TOUR_COPY, SCREENER_TOUR_STEPS, screenerTourLanguage,
  type ScreenerTourChapter,
} from './screenerTourContent';
import './screenerGuide.css';

type Highlight = { x: number; y: number; width: number; height: number; cardX: number; cardY: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const CHAPTERS: readonly ScreenerTourChapter[] = ['navigation', 'filters', 'market', 'tools'];

/**
 * Mount only when requested from the site header.
 * Spotlight is visual and pointer-transparent so it never changes page
 * state, triggers a scan, subscribes to an exchange, or alters saved filters.
 */
export function ScreenerGuide({ language, navigationOnly = false, onClose }: {
  language: string;
  navigationOnly?: boolean;
  onClose: () => void;
}) {
  const lang = screenerTourLanguage(language);
  const copy = SCREENER_TOUR_COPY[lang];
  const steps = useMemo(() => SCREENER_TOUR_STEPS.filter(({ selector, chapter }) => {
    if (navigationOnly && chapter !== 'navigation') return false;
    const element = document.querySelector<HTMLElement>(selector);
    return !!element && element.getClientRects().length > 0;
  }), [navigationOnly]);
  const [index, setIndex] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(index, Math.max(0, steps.length - 1))];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    let target: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const locate = () => document.querySelector<HTMLElement>(step.selector);
    const calculate = () => {
      frame = 0;
      const element = locate();
      if (!element || !element.getClientRects().length) return;
      if (target !== element) {
        target = element;
        resizeObserver?.observe(element);
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        // nearest avoids huge jumps when a header control is already visible.
        element.scrollIntoView({ block: step.key === 'results' ? 'start' : 'center', inline: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
      const rect = element.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      if (!rect.width || !rect.height || screenWidth < 140 || screenHeight < 160) return;
      // Clip oversized targets to the visual viewport (e.g. table or section).
      const left = clamp(rect.left - 5, 5, screenWidth - 9);
      const top = clamp(rect.top - 5, 5, screenHeight - 9);
      const right = clamp(rect.right + 5, left + 4, screenWidth - 5);
      const bottom = clamp(rect.bottom + 5, top + 4, screenHeight - 5);
      const width = Math.max(4, right - left);
      // Result grids can be many screens tall: guide the first visible rows,
      // not the entire page-sized container.
      const height = step.key === 'results' ? Math.min(140, Math.max(4, bottom - top)) : Math.max(4, bottom - top);
      const estimatedCardHeight = 268;
      const cardWidth = Math.min(350, screenWidth - 20);
      const visibleBottom = top + height;
      const below = visibleBottom + estimatedCardHeight + 12 <= screenHeight;
      const cardY = below
        ? visibleBottom + 12
        : clamp(top - estimatedCardHeight - 12, 8, Math.max(8, screenHeight - estimatedCardHeight - 8));
      const cardX = clamp(left, 10, Math.max(10, screenWidth - cardWidth - 10));
      setHighlight(current => current &&
        current.x === left && current.y === top &&
        current.width === width && current.height === height &&
        current.cardX === cardX && current.cardY === cardY
          ? current : { x: left, y: top, width, height, cardX, cardY });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(calculate); };
    resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    let mutationObserver: MutationObserver | null = null;
    // A loading or responsive page can replace a target after a click.
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        if (locate()?.getClientRects().length) {
          mutationObserver?.disconnect();
          schedule();
        }
      });
      if (!locate()) mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [step]);

  const hasHighlight = Boolean(highlight);
  useEffect(() => {
    if (hasHighlight) cardRef.current?.focus({ preventScroll: true });
  }, [hasHighlight]);

  if (!step || !highlight || typeof document === 'undefined') return null;
  const info = copy.steps[step.key];
  return createPortal(
    <div className="screener-tour-overlay" lang={lang} role="presentation">
      <div className="screener-tour-spotlight" aria-hidden="true"
        style={{ left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }} />
      <div role="dialog" aria-label={navigationOnly ? copy.pagesLabel : copy.label} aria-modal={false}
        className="screener-tour-card" ref={cardRef} tabIndex={-1}
        style={{ left: highlight.cardX, top: highlight.cardY }}>
        <div className="screener-tour-top">
          <span>{copy.step} {index + 1} {copy.of} {steps.length}</span>
          <button type="button" aria-label={copy.close} title={copy.close} onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="screener-tour-chapters" role="group" aria-label={navigationOnly ? copy.pagesLabel : copy.label}>
          {CHAPTERS.filter(chapter => steps.some(item => item.chapter === chapter)).map(chapter => (
            <button key={chapter} type="button" aria-pressed={step.chapter === chapter}
              className={step.chapter === chapter ? 'selected' : ''}
              onClick={() => {
                const at = steps.findIndex(item => item.chapter === chapter);
                if (at >= 0) setIndex(at);
              }}>
              {copy.chapters[chapter]}
            </button>
          ))}
        </div>
        <strong>{info.title}</strong>
        <p>{info.description}</p>
        <small>{copy.note}</small>
        <div className="screener-tour-footer">
          <div className="screener-tour-progress" aria-hidden="true">
            {steps.map((item, i) => <span key={item.key} className={i === index ? 'active' : ''} />)}
          </div>
          <div className="screener-tour-buttons">
            <button type="button" disabled={index === 0}
              onClick={() => setIndex(current => Math.max(0, current - 1))}>
              <ArrowLeft size={14} aria-hidden="true" /> {copy.previous}
            </button>
            <button type="button" className="primary"
              onClick={() => index === steps.length - 1 ? onClose() : setIndex(current => Math.min(steps.length - 1, current + 1))}>
              {index === steps.length - 1 ? copy.finish : copy.next}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ScreenerGuide;
