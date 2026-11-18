'use strict';

// Only a presentation adapter for the unprivileged h00k.top page in Electron.
// It never exposes Node.js, window handles, local files, or Desktop IPC.
function installDesktopLanguagePicker() {
  if (window.__h00kDesktopLanguagePickerInstalled) return;
  window.__h00kDesktopLanguagePickerInstalled = true;

  const languages = [
    { code: 'uk', label: 'Українська' },
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
    { code: 'pl', label: 'Polski' },
  ];
  const byCode = Object.fromEntries(languages.map(item => [item.code, item]));
  const namespace = 'http://www.w3.org/2000/svg';
  let active = null;

  function svgNode(tag, attrs) {
    const el = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  }
  function flag(code) {
    const svg = svgNode('svg', {
      viewBox: '0 0 32 20', width: 21, height: 14,
      'aria-hidden': 'true', focusable: 'false', class: 'h00k-desktop-flag',
    });
    const rect = (x, y, width, height, fill) =>
      svg.appendChild(svgNode('rect', { x, y, width, height, fill }));
    if (code === 'uk') {
      rect(0, 0, 32, 10, '#0057B7'); rect(0, 10, 32, 10, '#FFD700');
    } else if (code === 'pl') {
      rect(0, 0, 32, 10, '#FFFFFF'); rect(0, 10, 32, 10, '#DC143C');
    } else if (code === 'ru') {
      rect(0, 0, 32, 7, '#FFFFFF');
      rect(0, 7, 32, 6, '#0039A6');
      rect(0, 13, 32, 7, '#D52B1E');
    } else {
      rect(0, 0, 32, 20, '#012169');
      svg.appendChild(svgNode('path', {
        d: 'M0 0 L32 20 M32 0 L0 20', stroke: '#FFFFFF', 'stroke-width': 7,
      }));
      svg.appendChild(svgNode('path', {
        d: 'M0 0 L32 20 M32 0 L0 20', stroke: '#C8102E', 'stroke-width': 3,
      }));
      svg.appendChild(svgNode('path', {
        d: 'M16 0 V20 M0 10 H32', stroke: '#FFFFFF', 'stroke-width': 9,
      }));
      svg.appendChild(svgNode('path', {
        d: 'M16 0 V20 M0 10 H32', stroke: '#C8102E', 'stroke-width': 4.5,
      }));
    }
    svg.appendChild(svgNode('rect', {
      x: 0.5, y: 0.5, width: 31, height: 19, rx: 1,
      fill: 'none', stroke: '#94a3b8', 'stroke-opacity': 0.42,
    }));
    return svg;
  }
  function matchesLanguageSelect(select) {
    if (!select || select.tagName !== 'SELECT') return false;
    const options = Array.from(select.options || []);
    return options.length === languages.length &&
      languages.every(({ code }) => options.some(option => option.value === code));
  }
  function update() {
    if (!active) return;
    const { select, trigger, rows } = active;
    const code = byCode[select.value] ? select.value : 'uk';
    const caption = document.createElement('span');
    caption.textContent = code.toUpperCase();
    trigger.replaceChildren(flag(code), caption);
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || 'Language');
    trigger.setAttribute('title', select.getAttribute('title') || 'Language');
    for (const row of rows) row.setAttribute('aria-selected', String(row.dataset.language === code));
  }
  function close(restoreFocus = false) {
    if (!active) return;
    active.menu.hidden = true;
    active.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) active.trigger.focus();
  }
  function open() {
    if (!active) return;
    update();
    active.menu.hidden = false;
    active.trigger.setAttribute('aria-expanded', 'true');
    const selected = active.rows.find(row => row.dataset.language === active.select.value) ||
      active.rows[0];
    selected.focus();
  }
  function choose(code) {
    if (!active || !byCode[code]) return;
    const select = active.select;
    close();
    if (select.value !== code) {
      // React's delegated onChange listens for the actual native select event.
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(select, code);
      else select.value = code;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    update();
    window.setTimeout(update, 0);
    active.trigger.focus();
  }
  function install(select) {
    const parent = select.parentNode;
    if (!parent) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'h00k-desktop-language-picker';
    wrapper.dataset.h00kDesktopPicker = 'true';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'h00k-desktop-language-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'h00k-desktop-language-menu';
    menu.id = 'h00k-desktop-language-options';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', select.getAttribute('aria-label') || 'Language');
    menu.hidden = true;
    trigger.setAttribute('aria-controls', menu.id);
    const rows = languages.map(({code,label}) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'h00k-desktop-language-option';
      row.dataset.language = code;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(select.value === code));
      row.appendChild(flag(code));
      const name = document.createElement('span');
      name.textContent = label;
      row.appendChild(name);
      const abbrev = document.createElement('span');
      abbrev.className = 'h00k-desktop-language-code';
      abbrev.textContent = code.toUpperCase();
      row.appendChild(abbrev);
      row.addEventListener('click', () => choose(code));
      row.addEventListener('keydown', event => {
        const index = languages.findIndex(item => item.code === code);
        if (event.key === 'Escape') {
          event.preventDefault(); close(true);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          rows[(index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length].focus();
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); rows[event.key === 'Home' ? 0 : rows.length - 1].focus();
        } else if (event.key === 'Tab') {
          close();
        }
      });
      return row;
    });
    menu.append(...rows);
    wrapper.append(trigger, menu);
    // Keep the React-controlled select at its ORIGINAL DOM position and preserve
    // its native onChange handler. Moving it inside our wrapper breaks React
    // reconciliation when navigation unmounts the header.
    parent.insertBefore(wrapper, select);
    select.style.display = 'none';
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    active = { select, wrapper, trigger, menu, rows };
    trigger.addEventListener('click', () => menu.hidden ? open() : close());
    trigger.addEventListener('keydown', event => {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); open();
      } else if (event.key === 'Escape') {
        close(true);
      }
    });
    select.addEventListener('change', update);
    update();
  }
  function scan() {
    if (active && (!active.select.isConnected || !active.wrapper.isConnected)) {
      active.wrapper.remove();
      active = null;
    }
    const row = document.querySelector('.app-header [data-header-brand-row]');
    const select = row && Array.from(row.querySelectorAll('select')).find(matchesLanguageSelect);
    if (select && (!active || active.select !== select)) {
      if (active) { active.wrapper.remove(); active = null; }
      install(select);
    } else if (active) update();
  }
  document.addEventListener('pointerdown', event => {
    if (active && !active.wrapper.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active && !active.menu.hidden) close(true);
  });
  // Initial login is asynchronous. A small, bounded one-second probe is much
  // cheaper than observing every market-data DOM mutation across multiple tabs.
  scan();
  window.setInterval(scan, 1_000);
  document.addEventListener('DOMContentLoaded', scan, { once: true });
}
const SITE_LANGUAGE_PICKER_CSS = [
  '.h00k-desktop-language-picker { position:relative; display:inline-flex; align-items:center; flex:0 0 auto; z-index:20; }',
  '.h00k-desktop-language-trigger { display:inline-flex; align-items:center; gap:5px; padding:4px 3px; border:0; background:transparent; box-shadow:none; color:#e2e8f0; font:700 12px/1.2 system-ui,sans-serif; cursor:pointer; white-space:nowrap; -webkit-app-region:no-drag !important; }',
  '.h00k-desktop-language-trigger:hover { color:#67e8f9; }',
  '.h00k-desktop-language-trigger:focus-visible,.h00k-desktop-language-option:focus-visible { outline:2px solid #22d3ee; outline-offset:2px; }',
  '.h00k-desktop-flag { display:block; width:21px; height:14px; flex:none; border-radius:2px; }',
  '.h00k-desktop-language-menu { position:absolute; top:calc(100% + 7px); right:0; min-width:150px; padding:5px; z-index:9999; border:1px solid #31566b; border-radius:10px; background:#0c1724; color:#e8f6fb; box-shadow:0 14px 34px rgba(0,0,0,.5); -webkit-app-region:no-drag !important; }',
  '.h00k-desktop-language-menu[hidden] { display:none !important; }',
  '.h00k-desktop-language-option { width:100%; display:flex; align-items:center; gap:9px; padding:8px 9px; border:0; border-radius:6px; background:transparent; color:#e8f6fb; font:500 12px/1.3 system-ui,sans-serif; text-align:left; white-space:nowrap; cursor:pointer; -webkit-app-region:no-drag !important; }',
  '.h00k-desktop-language-option:hover,.h00k-desktop-language-option:focus-visible,.h00k-desktop-language-option[aria-selected="true"] { background:#19384a; color:#7cf4e3; }',
  '.h00k-desktop-language-code { margin-left:auto; color:#8cb4c4; font:700 11px/1 monospace; }',
].join('\n');
function siteLanguagePickerScript() {
  return '(' + installDesktopLanguagePicker.toString() + ')();';
}
module.exports = { SITE_LANGUAGE_PICKER_CSS, installDesktopLanguagePicker, siteLanguagePickerScript };
