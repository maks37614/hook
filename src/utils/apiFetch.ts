let signedInUid: string | null = null;
let csrf: string | null = null;

/** Ephemeral per-tab credential; never persist CSRF tokens in localStorage. */
export function setApiIdentity(uid: string | null, csrfToken: string | null) {
  signedInUid = uid;
  csrf = csrfToken;
}

/** One same-origin, account-scoped API transport for alerts, Telegram and surveillance. */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!url.startsWith('/api/') || url.startsWith('//')) throw new Error('Неприпустима адреса запиту');
  const account = signedInUid;
  if (!account) throw new Error('Увійдіть у свій акаунт, щоб продовжити.');
  const queryOwner = new URL(url, 'https://h00k.top').searchParams.get('userId');
  let bodyOwner: string | undefined;
  if (typeof options.body === 'string') {
    try { bodyOwner = JSON.parse(options.body)?.userId; } catch {}
  }
  if ([queryOwner, bodyOwner].some(owner => owner && owner !== account)) {
    throw new Error('Акаунт змінився. Повторіть дію.');
  }
  const headers = new Headers(options.headers);
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) throw new Error('Захищена сесія ще не готова. Повторіть дію.');
    headers.set('X-CSRF-Token', csrf);
  }
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers });
  if (signedInUid !== account) throw new Error('Акаунт змінився. Повторіть дію.');
  return response;
}
