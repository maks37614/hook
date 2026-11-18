/**
 * Lightweight visual-only backdrop for a routed HookChart.
 *
 * The actual Screener/Formations React subtree still UNMOUNTS. This renderer
 * copies only a small, bounded selection of *visible* HTML nodes once, with
 * no media, URLs, WebSockets, timers, handlers, canvases or custom elements.
 * It is NOT a background page and does not preserve React component state.
 */
export const CHART_BACKDROP_NODE_LIMIT = 220;
export const CHART_BACKDROP_VISIT_LIMIT = 720;
const MAX_TEXT_CHARS = 140;
const MAX_TEXT_NODES = 380;
const MAX_DEPTH = 24;

// Never create nodes that can fetch, execute, animate independently, or
// instantiate native/custom multimedia features. Input contents can be private.
const OMIT_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'noscript', 'iframe', 'img', 'picture',
  'video', 'audio', 'source', 'track', 'object', 'embed', 'canvas', 'svg',
  'math', 'template', 'input', 'textarea', 'select', 'option', 'datalist',
  'form', 'progress', 'meter',
]);
const TAGS = new Set([
  'div', 'span', 'header', 'main', 'footer', 'nav', 'section', 'article',
  'aside', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'small', 'strong', 'b', 'em',
  'i', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'label',
  'blockquote', 'time', 'button',
]);
const SAFE_INLINE_STYLES = [
  'display', 'width', 'height', 'min-width', 'max-width', 'min-height',
  'max-height', 'grid-template-columns', 'grid-template-rows', 'gap',
  'row-gap', 'column-gap', 'align-items', 'justify-content',
  'flex', 'flex-direction', 'flex-wrap', 'padding', 'margin',
  'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'text-align', 'font-size', 'font-weight', 'line-height',
  'color', 'background-color', 'border-radius',
];

type CaptureBudget = {
  nodes: number;
  visited: number;
  textNodes: number;
  limit: number;
  width: number;
  height: number;
};

function visibleInViewport(element: HTMLElement, budget: CaptureBudget): boolean {
  const rect = element.getBoundingClientRect();
  // Zero-sized test DOM / CSS-less markup is still eligible; this makes
  // the helper work without browser layout and remains subject to the cap.
  if (!rect.width && !rect.height) return true;
  return rect.bottom > 0 && rect.top < budget.height &&
    rect.right > 0 && rect.left < budget.width;
}

function copyVisibleMarkup(source: Element, budget: CaptureBudget, depth = 0): HTMLElement | null {
  if (budget.nodes >= budget.limit ||
      budget.visited >= CHART_BACKDROP_VISIT_LIMIT || depth >= MAX_DEPTH) return null;
  budget.visited++;
  const tag = source.tagName.toLowerCase();
  if (OMIT_TAGS.has(tag) || source.getAttribute('role') === 'dialog' ||
      source.getAttribute('aria-modal') === 'true' ||
      source.classList.contains('fixed')) return null;
  if (source instanceof HTMLElement && !visibleInViewport(source, budget)) return null;

  // createElement + an allow-list, NOT cloneNode: no src/srcset, href, poster,
  // image-set or data attributes can be copied into the backdrop.
  const copy = source.ownerDocument.createElement(TAGS.has(tag) ? tag : 'div');
  budget.nodes++;
  if (source instanceof HTMLElement) {
    // Tailwind utility classes preserve the prior page's colors/spacing,
    // while obvious URL-valued classes are excluded.
    const classes = Array.from(source.classList).filter(name =>
      !/url\(|image-set\(|\b(?:animate|transition|backdrop-blur)-/i.test(name));
    copy.className = classes.join(' ');
    for (const property of SAFE_INLINE_STYLES) {
      const value = source.style.getPropertyValue(property);
      if (value && !/url\(|image-set\(|expression\(/i.test(value)) {
        copy.style.setProperty(property, value);
      }
    }
  }
  // No attributes, event-handler props, form values or CSS URLs are copied.
  for (const node of source.childNodes) {
    if (budget.nodes >= budget.limit ||
        budget.visited >= CHART_BACKDROP_VISIT_LIMIT ||
        budget.textNodes >= MAX_TEXT_NODES) break;
    if (node.nodeType === 3) {
      budget.textNodes++;
      const text = (node.textContent || '').slice(0, MAX_TEXT_CHARS);
      if (text.trim()) copy.appendChild(source.ownerDocument.createTextNode(text));
    } else if (node.nodeType === 1) {
      const child = copyVisibleMarkup(node as Element, budget, depth + 1);
      if (child) copy.appendChild(child);
    }
  }
  copy.setAttribute('aria-hidden', 'true');
  return copy;
}

export function captureChartPageBackdrop(root: HTMLElement | null): HTMLDivElement | null {
  if (!root || typeof window === 'undefined') return null;
  const sources = Array.from(root.children)
    .filter((child): child is HTMLElement =>
      child instanceof HTMLElement && ['HEADER', 'MAIN', 'FOOTER'].includes(child.tagName));
  if (!sources.some(source => source.tagName === 'MAIN')) return null;

  const frame = root.ownerDocument.createElement('div');
  frame.className = 'chart-page-backdrop__frozen text-slate-100';
  frame.setAttribute('aria-hidden', 'true');
  frame.inert = true;
  const budget: CaptureBudget = {
    nodes: 0, visited: 0, textNodes: 0,
    limit: window.innerWidth <= 640 ? 140 : CHART_BACKDROP_NODE_LIMIT,
    width: window.innerWidth, height: window.innerHeight,
  };
  for (const source of sources) {
    if (budget.nodes >= budget.limit ||
        budget.visited >= CHART_BACKDROP_VISIT_LIMIT) break;
    const rect = source.getBoundingClientRect();
    const part = copyVisibleMarkup(source, budget);
    if (!part) continue;
    part.style.position = 'absolute';
    part.style.left = `${rect.left}px`;
    part.style.top = `${rect.top}px`;
    part.style.width = `${rect.width || budget.width}px`;
    part.style.margin = '0';
    part.style.pointerEvents = 'none';
    frame.appendChild(part);
  }
  return frame.hasChildNodes() ? frame : null;
}
