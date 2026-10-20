import { auth } from '../firebase';

export async function currentAuthToken(): Promise<string | undefined> {
  try {
    const local = JSON.parse(localStorage.getItem('signalhook_local_session') || 'null');
    if (local?.user?.isLocalUser && local.accessToken) return local.accessToken;
  } catch {}
  return auth.currentUser ? auth.currentUser.getIdToken() : undefined;
}

// Install once before React mounts so all existing notification controls use the same session.
export function installAuthenticatedFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch(input, options);
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options?.headers).forEach((value, key) => headers.set(key, value));
    const token = await currentAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await nativeFetch(input, { ...options, headers });
    if (response.status === 403) window.dispatchEvent(new Event('signalhook:access-check'));
    return response;
  };
}
