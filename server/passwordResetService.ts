import firebaseConfig from '../firebase-applet-config.json';
import { createLocalPasswordReset, revokeLocalPasswordReset, hasLocalEmailAccount } from './authService';

const publicSite = 'https://h00k.top';
const genericStatus = 'Якщо акаунт існує, лист з інструкціями буде надіслано на вказану адресу.';

export const passwordResetStatusMessage = genericStatus;

async function sendLocalResetEmail(email: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM_EMAIL?.trim();
  const address = from?.includes('<') && from.endsWith('>')
    ? from.slice(from.lastIndexOf('<') + 1, -1) : from;
  if (!apiKey || !from || !address || /[\r\n]/.test(from) ||
      !/^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(address))
    throw new Error('Для листів відновлення пароля не налаштовано RESEND_API_KEY / PASSWORD_RESET_FROM_EMAIL');
  const url = publicSite + '/#reset-password/' + token;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Відновлення пароля h00k.top',
      text: 'Ви запросили відновлення або зміну пароля h00k.top.\n\n' +
        'Перейдіть за посиланням (дійсне 30 хвилин, одноразове):\n' + url +
        '\n\nЯкщо це були не ви, проігноруйте цей лист.',
      html: '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">' +
        '<h2>Відновлення пароля h00k.top</h2><p>Щоб встановити новий пароль, відкрийте посилання:</p>' +
        '<p><a href="' + url + '">Встановити новий пароль</a></p>' +
        '<p>Посилання одноразове й діє 30 хвилин. Якщо ви не надсилали запиту, проігноруйте лист.</p></body></html>',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error('[Password reset] Email provider rejected delivery:', response.status);
    throw new Error('Не вдалося надіслати лист. Повторіть спробу пізніше.');
  }
}

async function sendFirebaseResetEmail(email: string) {
  // Existing Firebase email/password accounts are managed by Firebase Auth.
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' +
      encodeURIComponent(firebaseConfig.apiKey),
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.ok) return;
  let reason = '';
  try { reason = String((await response.json())?.error?.message || ''); } catch {}
  // Firebase may expose EMAIL_NOT_FOUND when enumeration protection is off.
  // Never expose it to users, including through response status.
  if (reason === 'EMAIL_NOT_FOUND' || reason === 'USER_NOT_FOUND') return;
  console.error('[Password reset] Firebase delivery failed:', response.status, reason.slice(0, 80));
  throw new Error('Не вдалося надіслати лист. Повторіть спробу пізніше.');
}

export async function dispatchPasswordReset(email: string): Promise<void> {
  if (hasLocalEmailAccount(email)) {
    const token = createLocalPasswordReset(email)!;
    try { await sendLocalResetEmail(email, token); }
    catch (error) { revokeLocalPasswordReset(token); throw error; }
  } else {
    await sendFirebaseResetEmail(email);
  }
}
