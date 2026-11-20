import { apiFetch } from './apiFetch';

const KEY = 'h00k_desktop_remote_link_';
let currentUserId: string | null = null;

/** Opt-in per account and per device. No persistent secrets or trading credentials. */
export function setDesktopRemoteLinkIdentity(uid: string | null): void {
  currentUserId = uid;
}
export function desktopRemoteLinkEnabled(uid = currentUserId): boolean {
  if (!uid || typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(KEY + uid) === '1'; }
  catch { return false; }
}
export function setDesktopRemoteLinkEnabled(uid: string, enabled: boolean): void {
  if (!uid || typeof localStorage === 'undefined') return;
  try {
    if (enabled) localStorage.setItem(KEY + uid, '1');
    else localStorage.removeItem(KEY + uid);
  } catch { /* Storage may be blocked */ }
}
export async function desktopRemoteLinkStatus(): Promise<boolean> {
  const response = await apiFetch('/api/desktop-link/status', { cache: 'no-store' });
  if (!response.ok) return false;
  const data = await response.json().catch(() => null);
  return data?.online === true;
}
export async function sendTickerViaDesktop(input: {
  symbol: string; exchange: 'binance' | 'bybit';
  marketType: 'spot' | 'futures'; binding: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const response = await apiFetch('/api/desktop-link/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (response.status === 202) return {
      success: true,
      message: 'Команду передано в h00k Desktop. MetaScalp перемкне групу ' + input.binding + '.',
    };
    const data = await response.json().catch(() => null);
    if (response.status === 409 && data?.error === 'DESKTOP_OFFLINE')
      return { success: false, message: 'h00k Desktop не підключено. Запустіть Desktop на комп’ютері та увійдіть у той самий акаунт.' };
    if (response.status === 429)
      return { success: false, message: 'Занадто часті перемикання. Спробуйте ще раз.' };
    if (response.status === 401 || response.status === 403)
      return { success: false, message: 'Сесія h00k.top недійсна. Увійдіть у свій акаунт повторно.' };
    return { success: false, message: 'Не вдалося передати команду в h00k Desktop.' };
  } catch {
    return { success: false, message: 'Немає зв’язку зі службою лінковки h00k Desktop.' };
  }
}
