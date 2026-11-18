/** A short-lived, tab-local handoff from the successful signup request.
 * Never put an address, password, CAPTCHA or verification token in the URL.
 */
export const REGISTRATION_CONFIRMATION_KEY = 'h00k_registration_confirmation_v1';
const MAX_AGE_MS = 30 * 60 * 1000;

export type RegistrationMailbox = Readonly<{ name: string; href: string }>;

const MAILBOXES: Record<string, RegistrationMailbox> = {
  'gmail.com': { name: 'Gmail', href: 'https://mail.google.com/' },
  'googlemail.com': { name: 'Gmail', href: 'https://mail.google.com/' },
  'outlook.com': { name: 'Outlook', href: 'https://outlook.live.com/mail/' },
  'hotmail.com': { name: 'Outlook', href: 'https://outlook.live.com/mail/' },
  'live.com': { name: 'Outlook', href: 'https://outlook.live.com/mail/' },
  'icloud.com': { name: 'iCloud Mail', href: 'https://www.icloud.com/mail/' },
  'me.com': { name: 'iCloud Mail', href: 'https://www.icloud.com/mail/' },
  'mac.com': { name: 'iCloud Mail', href: 'https://www.icloud.com/mail/' },
  'yahoo.com': { name: 'Yahoo Mail', href: 'https://mail.yahoo.com/' },
  'yahoo.co.uk': { name: 'Yahoo Mail', href: 'https://mail.yahoo.com/' },
  'proton.me': { name: 'Proton Mail', href: 'https://mail.proton.me/' },
  'protonmail.com': { name: 'Proton Mail', href: 'https://mail.proton.me/' },
  'ukr.net': { name: 'UKR.NET', href: 'https://mail.ukr.net/' },
};

export function registrationMailbox(email: string): RegistrationMailbox | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at >= email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  // Only link to known, explicitly trusted services, never an arbitrary address domain.
  return MAILBOXES[domain] ?? null;
}

export function rememberRegistrationEmail(email: string, storage?: Pick<Storage, 'setItem'>, now = Date.now()): void {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
    const normalized = email.trim().slice(0, 254);
    if (!target || normalized.lastIndexOf('@') < 1) return;
    target.setItem(REGISTRATION_CONFIRMATION_KEY, JSON.stringify({ email: normalized, at: now }));
  } catch { /* Private browsing / disabled storage still allows the success route. */ }
}

export function pendingRegistrationEmail(storage?: Pick<Storage, 'getItem'>, now = Date.now()): string | null {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
    const raw = target?.getItem(REGISTRATION_CONFIRMATION_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (typeof payload?.email !== 'string' || typeof payload?.at !== 'number'
      || now < payload.at || now - payload.at > MAX_AGE_MS) return null;
    const email = payload.email.trim();
    return email.length <= 254 && email.lastIndexOf('@') > 0 ? email : null;
  } catch { return null; }
}
