
/** Per-account, local-only appearance. Never change exchange candles or order data. */
export const SITE_SURFACES = [
  { id: 'classic', label: 'Стандартна', description: 'Оригінальний темно-синій h00k', preview: '#0f172a' },
  { id: 'midnight', label: 'Нічна', description: 'Глибокий темно-синій фон', preview: '#0b1530' },
  { id: 'graphite', label: 'Графіт', description: 'Нейтральний темно-сірий', preview: '#171a20' },
  { id: 'plum', label: 'Сливова', description: 'Темний фіолетовий відтінок', preview: '#21152d' },
  { id: 'mist', label: 'Ранковий туман', description: 'Світло-блакитна', preview: '#eef5fc' },
  { id: 'sand', label: 'Теплий пісок', description: 'Тепла кремова', preview: '#fff5e8' },
  { id: 'lavender', label: 'Лаванда', description: 'Ніжна бузкова', preview: '#f4effb' },
  { id: 'mint', label: 'Світла м’ята', description: 'М’яка зелена', preview: '#ebfaf5' },
  { id: 'mint-dark', label: 'Мятний', description: 'Темний синьо-м’ятний фон, як у Community', preview: 'linear-gradient(120deg, #145367 0%, #102638 52%, #101928 100%)' },
] as const;
export const SITE_ACCENTS = [
  { id: 'cyan', label: 'Бірюзовий', preview: '#22d3ee' },
  { id: 'blue', label: 'Синій', preview: '#60a5fa' },
  { id: 'violet', label: 'Фіолетовий', preview: '#a78bfa' },
  { id: 'teal', label: 'М’ятний', preview: '#2dd4bf' },
  { id: 'amber', label: 'Бурштиновий', preview: '#fbbf24' },
] as const;
export const SITE_FONTS = [
  { id: 'jakarta', label: 'Plus Jakarta Sans', css: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" },
  // Thin, modern Cyrillic/Latin letterforms visually close to the provided sample.
  { id: 'inter-light', label: 'Inter Light', css: "'Inter', Arial, sans-serif" },
  { id: 'system', label: 'Системний', css: 'system-ui, -apple-system, sans-serif' },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, serif' },
  { id: 'mono', label: 'Моноширинний', css: "'JetBrains Mono', Consolas, monospace" },
] as const;
export const SITE_TEXT_SCALES = [0.9, 1, 1.1, 1.2] as const;
// These colors decorate chart CARD FRAMES only, never the HookChart canvas.
export const SITE_CHART_PRESETS = [
  { label: 'Стандартний', color: '#131722' },
  { label: 'Бірюзова рамка', color: '#22d3ee' },
  { label: 'Синя рамка', color: '#60a5fa' },
  { label: 'Фіолетова рамка', color: '#a78bfa' },
  { label: 'Бурштинова рамка', color: '#fbbf24' },
  { label: 'Графіт', color: '#191d25' },
  { label: 'Чорний', color: '#0d1015' },
  { label: 'Темно-синій', color: '#101e32' },
  { label: 'Сливовий', color: '#21172a' },
] as const;
export type SiteSurface = typeof SITE_SURFACES[number]['id'];
export type SiteAccent = typeof SITE_ACCENTS[number]['id'];
export type SiteFont = typeof SITE_FONTS[number]['id'];
export type SiteTextScale = typeof SITE_TEXT_SCALES[number];

export interface SiteAppearance {
  surface: SiteSurface;
  accent: SiteAccent;
  font: SiteFont;
  textScale: SiteTextScale;
  /** Outer chart card border only (legacy profile field name retained for existing users). */
  chartColor: string;
  customCss: string;
}
export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  surface: 'classic', accent: 'cyan', font: 'verdana', textScale: 1,
  chartColor: '#131722', customCss: '',
};
export const SITE_APPEARANCE_STORAGE_KEY = 'h00k:site-appearance:v2';
export const MAX_CUSTOM_CSS_LENGTH = 3500;

/** Any 6-digit hex shade is safe for a decorative frame; the chart canvas never changes. */
export function isSafeChartColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Bounded allowlisted CSS, scoped to this browser's #root only.
 * No external URLs, imports, pseudo selectors, overlay/visibility or SVG/canvas changes.
 */
const CSS_PROPERTIES = new Set(['color','background-color','border-color','border-radius','font-size','font-weight','letter-spacing']);
const CSS_SELECTOR = /^(?:\.[a-zA-Z_][a-zA-Z0-9_-]*|button|input|textarea|select|h1|h2|h3|h4|p|span|label)(?:\s+(?:\.[a-zA-Z_][a-zA-Z0-9_-]*|button|input|textarea|select|h1|h2|h3|h4|p|span|label)){0,2}$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export function compilePersonalCss(source: unknown): { css: string; error: string | null } {
  if (typeof source !== 'string') return { css: '', error: 'CSS має бути текстом.' };
  if (!source.trim()) return { css: '', error: null };
  if (source.length > MAX_CUSTOM_CSS_LENGTH) return { css: '', error: 'Максимум 3500 символів CSS.' };
  if (/[\\@]/.test(source) || /\/\*|\*\//.test(source))
    return { css: '', error: 'Заборонені @правила, коментарі та CSS-екранування.' };
  const parts = source.trim().split('}');
  if (parts.pop()?.trim()) return { css: '', error: 'Перевірте закривальні дужки CSS.' };
  if (parts.length > 24) return { css: '', error: 'Максимум 24 CSS-правила.' };
  const compiled: string[] = [];
  for (const part of parts) {
    const segments = part.split('{');
    if (segments.length !== 2 || !segments[0].trim() || !segments[1].trim())
      return { css: '', error: 'Формат: .class { color: #ffffff; }' };
    const selectors = segments[0].split(',').map(x => x.trim());
    if (selectors.length > 4 || selectors.some(x => !CSS_SELECTOR.test(x)))
      return { css: '', error: 'Дозволені прості селектори класів і текстових елементів.' };
    const declarations = segments[1].split(';').map(x => x.trim()).filter(Boolean);
    if (!declarations.length || declarations.length > 12)
      return { css: '', error: 'Максимум 12 властивостей у правилі.' };
    const safe: string[] = [];
    for (const decl of declarations) {
      const m = /^([a-z-]+)\s*:\s*([^:;{}]+)$/.exec(decl);
      if (!m || !CSS_PROPERTIES.has(m[1])) return { css: '', error: 'Непідтримувана CSS-властивість.' };
      const prop = m[1], val = m[2].trim();
      let allowed = false;
      if (['color','background-color','border-color'].includes(prop)) allowed = HEX.test(val);
      else if (prop === 'font-size') {
        const size = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(val);
        allowed = !!size && (size[2] === 'px' ? +size[1] >= 9 && +size[1] <= 24 : +size[1] >= .7 && +size[1] <= 1.6);
      } else if (prop === 'border-radius') {
        const size = /^(\d+(?:\.\d+)?)px$/.exec(val);
        allowed = !!size && +size[1] <= 28;
      } else if (prop === 'font-weight') allowed = /^(400|500|600|700|800)$/.test(val);
      else if (prop === 'letter-spacing') allowed = /^(0|[012](?:\.\d+)?px)$/.test(val);
      if (!allowed) return { css: '', error: 'Недозволене значення: ' + prop };
      safe.push(prop + ':' + val);
    }
    compiled.push(selectors.map(s => '#root ' + s).join(',') + '{' + safe.join(';') + '}');
  }
  return { css: compiled.join('\n'), error: null };
}
export function normalizeSiteAppearance(value: unknown): SiteAppearance {
  const o = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    surface: SITE_SURFACES.find(x => x.id === o.surface)?.id ?? DEFAULT_SITE_APPEARANCE.surface,
    accent: SITE_ACCENTS.find(x => x.id === o.accent)?.id ?? DEFAULT_SITE_APPEARANCE.accent,
    font: SITE_FONTS.find(x => x.id === o.font)?.id ?? DEFAULT_SITE_APPEARANCE.font,
    textScale: SITE_TEXT_SCALES.find(x => x === o.textScale) ?? DEFAULT_SITE_APPEARANCE.textScale,
    chartColor: isSafeChartColor(o.chartColor) ? o.chartColor.toLowerCase() : DEFAULT_SITE_APPEARANCE.chartColor,
    customCss: typeof o.customCss === 'string' && !compilePersonalCss(o.customCss).error ? o.customCss : '',
  };
}
export function validateSiteAppearance(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (Object.keys(o).some(k => !['surface','accent','font','textScale','chartColor','customCss'].includes(k))) return false;
  if (!SITE_SURFACES.some(s => s.id === o.surface) || !SITE_ACCENTS.some(a => a.id === o.accent)) return false;
  if (o.font !== undefined && !SITE_FONTS.some(f => f.id === o.font)) return false;
  if (o.textScale !== undefined && !SITE_TEXT_SCALES.some(s => s === o.textScale)) return false;
  if (o.chartColor !== undefined && !isSafeChartColor(o.chartColor)) return false;
  if (o.customCss !== undefined && compilePersonalCss(o.customCss).error) return false;
  return true;
}

let activeUid: string | null = null;
let chartBackground: string | null = null;
const chartListeners = new Set<() => void>();
const PERSONAL_STYLE_ID = 'h00k-personal-interface-css';
export function getSiteChartBackground(): string | null { return chartBackground; }
export function subscribeSiteChartBackground(fn: () => void): () => void {
  chartListeners.add(fn);
  return () => { chartListeners.delete(fn); };
}
/**
 * Fetch the optional font only when it is selected or the Interface editor
 * is opened. The same link is reused across route changes and other users.
 */
export function ensureSiteFontLoaded(font: SiteFont): void {
  if (font !== 'inter-light' || typeof document === 'undefined') return;
  if (document.getElementById('h00k-site-inter-light-font')) return;
  const link = document.createElement('link');
  link.id = 'h00k-site-inter-light-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap';
  document.head.appendChild(link);
}

export function applySiteAppearance(value: unknown): SiteAppearance {
  const next = normalizeSiteAppearance(value);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.dataset.siteSurface !== next.surface) root.dataset.siteSurface = next.surface;
    if (root.dataset.siteAccent !== next.accent) root.dataset.siteAccent = next.accent;
    if (root.dataset.siteFont !== next.font) root.dataset.siteFont = next.font;
    ensureSiteFontLoaded(next.font);
    const font = SITE_FONTS.find(x => x.id === next.font)!.css;
    if (root.style.getPropertyValue('--site-font-family') !== font) root.style.setProperty('--site-font-family', font);
    const scale = String(next.textScale);
    if (root.style.getPropertyValue('--site-text-scale') !== scale) root.style.setProperty('--site-text-scale', scale);
    if (root.style.getPropertyValue('--site-chart-frame-color') !== next.chartColor)
      root.style.setProperty('--site-chart-frame-color', next.chartColor);
    const custom = next.chartColor !== DEFAULT_SITE_APPEARANCE.chartColor ? 'true' : 'false';
    if (root.dataset.siteChartCustom !== custom) root.dataset.siteChartCustom = custom;
    const css = compilePersonalCss(next.customCss).css;
    let style = document.getElementById(PERSONAL_STYLE_ID) as HTMLStyleElement | null;
    if (css) {
      if (!style) { style = document.createElement('style'); style.id = PERSONAL_STYLE_ID; document.head.appendChild(style); }
      if (style.textContent !== css) style.textContent = css;
    } else if (style) style.remove();
  }
  const newBackground = next.chartColor === DEFAULT_SITE_APPEARANCE.chartColor ? null : next.chartColor;
  if (chartBackground !== newBackground) {
    chartBackground = newBackground;
    chartListeners.forEach(fn => fn());
  }
  return next;
}
function cacheKey(uid: string): string { return SITE_APPEARANCE_STORAGE_KEY + ':' + uid; }
export function readCachedSiteAppearance(uid?: string | null): SiteAppearance {
  if (typeof window === 'undefined' || !uid) return { ...DEFAULT_SITE_APPEARANCE };
  try { return normalizeSiteAppearance(JSON.parse(window.localStorage.getItem(cacheKey(uid)) || 'null')); }
  catch { return { ...DEFAULT_SITE_APPEARANCE }; }
}
export function cacheSiteAppearance(value: unknown, uid?: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const json = JSON.stringify(normalizeSiteAppearance(value));
    if (window.localStorage.getItem(cacheKey(uid)) !== json) window.localStorage.setItem(cacheKey(uid), json);
  } catch { /* Private mode may disable storage. */ }
}
export function setSiteAppearanceIdentity(uid: string | null): void {
  activeUid = uid;
  applySiteAppearance(uid ? readCachedSiteAppearance(uid) : DEFAULT_SITE_APPEARANCE);
}
export function initializeSiteAppearance(): void {
  applySiteAppearance(DEFAULT_SITE_APPEARANCE);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
      if (activeUid && event.key === cacheKey(activeUid)) applySiteAppearance(readCachedSiteAppearance(activeUid));
    });
  }
}
