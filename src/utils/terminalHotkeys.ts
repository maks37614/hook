/** Terminal-wide shortcuts use Alt+Shift, away from HookChart's default
 * single-key, Ctrl and Shift shortcuts.  Every action has a real page handler. */
export const TERMINAL_SHORTCUTS = [
  { id: 'exitTerminal', code: 'Escape', group: 'general' },
  { id: 'help', code: 'KeyH', group: 'general' },
  { id: 'linking', code: 'KeyL', group: 'general' },
  { id: 'addChart', code: 'KeyN', group: 'general' },
  { id: 'presets', code: 'KeyP', group: 'general' },
  { id: 'favorites', code: 'KeyF', group: 'general' },
  { id: 'settings', code: 'KeyS', group: 'general' },
  { id: 'fullscreen', code: 'Enter', group: 'general' },
  { id: 'autoScale', code: 'KeyA', group: 'layout' },
  { id: 'eco', code: 'KeyE', group: 'layout' },
  { id: 'oneColumn', code: 'Digit1', group: 'layout' },
  { id: 'twoColumns', code: 'Digit2', group: 'layout' },
  { id: 'threeColumns', code: 'Digit3', group: 'layout' },
  { id: 'fourColumns', code: 'Digit4', group: 'layout' },
  { id: 'previousTimeframe', code: 'ArrowUp', group: 'navigation' },
  { id: 'nextTimeframe', code: 'ArrowDown', group: 'navigation' },
  { id: 'previousPage', code: 'ArrowLeft', group: 'navigation' },
  { id: 'nextPage', code: 'ArrowRight', group: 'navigation' },
] as const;

export type TerminalShortcutId = (typeof TERMINAL_SHORTCUTS)[number]['id'];
export type TerminalShortcutGroup = (typeof TERMINAL_SHORTCUTS)[number]['group'];

export type TerminalHotkeyMap = Record<TerminalShortcutId, string>;

export const DEFAULT_TERMINAL_HOTKEYS: TerminalHotkeyMap = Object.fromEntries(
  TERMINAL_SHORTCUTS.map(row => [row.id, row.id === 'exitTerminal' ? 'Escape' : 'Alt+Shift+' + row.code]),
) as TerminalHotkeyMap;

type ShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'code' | 'repeat'> & { key?: string };

/** Match physical letter keys just like the HookChart recorder. */
export function terminalHotkeyFromEvent(event: ShortcutEvent): string {
  const base = event.code && (/^Key[A-Z]$/.test(event.code) || /^Digit[0-9]$/.test(event.code) ||
    ['NumpadAdd', 'NumpadSubtract', 'Equal', 'Minus'].includes(event.code))
    ? event.code : (event.key || event.code);
  if (!base) return '';
  const mods = [
    event.ctrlKey && base !== 'Ctrl' ? 'Ctrl' : '',
    event.altKey && base !== 'Alt' ? 'Alt' : '',
    event.shiftKey && base !== 'Shift' ? 'Shift' : '',
    event.metaKey && base !== 'Meta' ? 'Meta' : '',
  ].filter(Boolean);
  return [...mods, base].join('+');
}

export function normalizeTerminalHotkeys(value?: Partial<TerminalHotkeyMap> | null): TerminalHotkeyMap {
  const result = { ...DEFAULT_TERMINAL_HOTKEYS };
  for (const row of TERMINAL_SHORTCUTS) {
    if (typeof value?.[row.id] === 'string' && value[row.id]!.length <= 70)
      result[row.id] = value[row.id]!;
  }
  return result;
}

export function terminalHotkeyStorageKey(uid?: string | null): string {
  return 'h00k_terminal_hotkeys_v1:' + (uid || 'guest');
}

export function loadTerminalHotkeys(uid?: string | null): TerminalHotkeyMap {
  if (typeof localStorage === 'undefined') return normalizeTerminalHotkeys();
  try { return normalizeTerminalHotkeys(JSON.parse(localStorage.getItem(terminalHotkeyStorageKey(uid)) || '{}')); }
  catch { return normalizeTerminalHotkeys(); }
}

export function saveTerminalHotkeys(uid: string | null | undefined, hotkeys: TerminalHotkeyMap): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(terminalHotkeyStorageKey(uid), JSON.stringify(normalizeTerminalHotkeys(hotkeys))); }
  catch { /* Browsers may disable storage. */ }
}

/** The Escape page action remains customizable; other shortcuts can be cleared. */
export function terminalShortcutAction(event: ShortcutEvent, bindings: TerminalHotkeyMap = DEFAULT_TERMINAL_HOTKEYS): TerminalShortcutId | null {
  if (event.repeat) return null;
  const code = terminalHotkeyFromEvent(event);
  return TERMINAL_SHORTCUTS.find(row => !!bindings[row.id] && bindings[row.id].split('|').includes(code))?.id ?? null;
}

export function displayTerminalShortcut(spec: string): string {
  if (!spec) return '—';
  const labels: Record<string, string> = {
    Escape: 'Esc', Enter: 'Enter', ArrowUp: '↑', ArrowDown: '↓',
    ArrowLeft: '←', ArrowRight: '→', NumpadAdd: 'Num +', NumpadSubtract: 'Num −',
  };
  return spec.split('|').map(sequence => sequence.split('+').map(key =>
    labels[key] ?? (key.startsWith('Key') ? key.slice(3) : key.startsWith('Digit') ? key.slice(5) : key),
  ).join(' + ')).join(' / ');
}
