import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import { mergeProfileUpdate } from '../utils/hookchartData';
import { DEFAULT_APP_PREFERENCES, getStoredPreferences, saveStoredPreferences, setPreferencesIdentity } from '../utils/userPreferences';
import { DEFAULT_METASCALP_SETTINGS, saveStoredMetaScalpSettings } from '../utils/metaScalpService';
import { setApiIdentity, apiFetch } from '../utils/apiFetch';
import { setDesktopRemoteLinkIdentity } from '../utils/desktopRemoteLink';
import { applySiteAppearance, cacheSiteAppearance, normalizeSiteAppearance, setSiteAppearanceIdentity } from '../utils/siteAppearance';
import {
  PROFILE_GUEST_FOCUS_REFRESH_MS, PROFILE_SIGNAL_COALESCE_MS, PROFILE_SYNC_SIGNAL_KEY,
  isProfileSyncRelevant, parseProfileSyncSignal, publishProfileSyncSignal,
  shouldRefreshProfileOnFocus,
} from '../utils/profileSync';

export interface H00kUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  emailVerified: boolean;
}
export interface AuthSessionSummary {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

interface AuthContextType {
  user: H00kUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string, remember?: boolean, captchaToken?: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name?: string, captchaToken?: string) => Promise<void>;
  resendVerification: (email: string, captchaToken?: string) => Promise<void>;
  requestPasswordReset: (email: string, captchaToken?: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  resetToken: string | null;
  updateProfileData: (updates: Partial<UserProfile>) => Promise<void>;
  /** Atomic per-workspace write: a stale device receives a 409 instead of overwriting new charts. */
  updateTerminalWorkspace: (workspace: NonNullable<UserProfile['terminalSettings']>, expectedVersion: string | null) => Promise<string | null>;
  /** Refresh the account from PostgreSQL to reconcile a stale Terminal workspace version. */
  refreshProfile: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  listSessions: () => Promise<AuthSessionSummary[]>;
  revokeSession: (id: string) => Promise<void>;
  authError: string | null;
  authErrorCode: string | null;
  authNotice: string | null;
  clearAuthError: () => void;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

let initialResetToken: string | null = null;
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  initialResetToken = params.get('resetPassword');
}

async function authRequest(path: string, body: unknown): Promise<any> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    const error = new Error(data.error || 'Не вдалося виконати запит. Спробуйте пізніше.') as Error & { code?: string };
    error.code = data.code || 'AUTH_ERROR';
    throw error;
  }
  return data;
}
function stripLegacySecrets(profile: UserProfile): UserProfile {
  const clean = { ...profile };
  delete clean.telegramBotToken;
  delete clean.telegramChatId;
  delete clean.telegramBotUsername;
  return clean;
}
function applySitePreferences(profile: UserProfile, uid: string) {
  // Profile data from PostgreSQL is authoritative for this UID, including
  // missing fields on older accounts. Never reuse the previous owner's values.
  setPreferencesIdentity(uid);
  setDesktopRemoteLinkIdentity(uid);
  saveStoredPreferences({
    defaultExchange: profile.defaultExchange ?? DEFAULT_APP_PREFERENCES.defaultExchange,
    defaultMarketType: profile.defaultMarketType ?? DEFAULT_APP_PREFERENCES.defaultMarketType,
    defaultTimeframe: profile.defaultTimeframe ?? DEFAULT_APP_PREFERENCES.defaultTimeframe,
    soundAlertsEnabled: profile.soundAlertsEnabled ?? DEFAULT_APP_PREFERENCES.soundAlertsEnabled,
  });
  saveStoredMetaScalpSettings(profile.metaScalpSettings || DEFAULT_METASCALP_SETTINGS, uid);
  setSiteAppearanceIdentity(uid);
  const appearance = normalizeSiteAppearance(profile.siteAppearance);
  applySiteAppearance(appearance);
  cacheSiteAppearance(appearance, uid);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<H00kUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(initialResetToken);
  // React Strict Mode may replay the mount effect: reuse one verification POST.
  // Otherwise the second mount could check /session before the first request sets its cookie.
  const verifyTokenRef = useRef<string | null>(
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('verifyEmail')
  );
  const verifyRequestRef = useRef<Promise<any> | null>(null);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  // Avoid applying an old focus/session response after login, logout or a
  // concurrent local save. Cross-tab signals contain no private profile data.
  const identityEpochRef = useRef(0);
  const profileWriteSequenceRef = useRef(0);
  const bootstrappedRef = useRef(false);
  const lastSessionCheckRef = useRef(0);
  userRef.current = user;
  profileRef.current = profile;

  const setIdentity = useCallback((payload: any) => {
    if (!payload?.user?.uid || !payload.profile || !payload.csrf) throw new Error('Неповні дані сесії.');
    const nextUser = payload.user as H00kUser;
    const nextProfile = stripLegacySecrets(payload.profile as UserProfile);
    identityEpochRef.current += 1;
    lastSessionCheckRef.current = Date.now();
    setApiIdentity(nextUser.uid, String(payload.csrf));
    userRef.current = nextUser;
    profileRef.current = nextProfile;
    setUser(nextUser);
    setProfile(nextProfile);
    applySitePreferences(nextProfile, nextUser.uid);
  }, []);
  const clearIdentity = useCallback(() => {
    identityEpochRef.current += 1;
    lastSessionCheckRef.current = Date.now();
    setApiIdentity(null, null);
    setDesktopRemoteLinkIdentity(null);
    setPreferencesIdentity(null);
    setSiteAppearanceIdentity(null);
    userRef.current = null;
    profileRef.current = null;
    setUser(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Do not destroy browser-local user settings during auth bootstrap.
    const params = new URLSearchParams(window.location.search);
    const verifyToken = verifyTokenRef.current;
    if (verifyToken || params.has('resetPassword')) {
      params.delete('verifyEmail');
      params.delete('resetPassword');
      const query = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
    }
    let cancelled = false;
    const bootstrap = async () => {
      try {
        if (verifyToken) {
          if (!verifyRequestRef.current) {
            verifyRequestRef.current = authRequest('/api/auth/verify-email', { token: verifyToken });
          }
          const response = await verifyRequestRef.current;
          if (!cancelled) {
            setIdentity(response);
            setAuthNotice('Електронну пошту підтверджено. Ви увійшли до h00k.');
          }
        } else {
          const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
          if (response.ok) {
            const result = await response.json();
            if (!cancelled) setIdentity(result);
          } else if (!cancelled) clearIdentity();
        }
      } catch (error: any) {
        if (!cancelled) {
          clearIdentity();
          setAuthError(error?.message || 'Не вдалося перевірити авторизацію.');
        }
      } finally {
        if (!cancelled) {
          lastSessionCheckRef.current = Date.now();
          bootstrappedRef.current = true;
          setLoading(false);
        }
      }
    };
    void bootstrap();
    return () => { cancelled = true; mounted.current = false; };
  }, [setIdentity, clearIdentity]);

  // One session read after a same-browser profile signal, or when the user
  // returns to this tab after an extended absence. NO polling interval,
  // background fetching or additional market-data subscriptions.
  useEffect(() => {
    let disposed = false;
    let fetching = false;
    let needsAnotherRead = false;
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    const runRefresh = async () => {
      if (disposed || !bootstrappedRef.current) return;
      if (document.visibilityState === 'hidden') { needsAnotherRead = true; return; }
      if (fetching) { needsAnotherRead = true; return; }
      fetching = true;
      try {
        const identityEpoch = identityEpochRef.current;
        // A local profile PATCH is authoritative until its server response
        // returns. Never replace it with an older session GET response.
        await writeQueue.current.catch(() => {});
        if (disposed || identityEpoch !== identityEpochRef.current) return;
        const writeSequence = profileWriteSequenceRef.current;
        const expectedUid = userRef.current?.uid ?? null;
        lastSessionCheckRef.current = Date.now();
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (disposed || identityEpoch !== identityEpochRef.current ||
            writeSequence !== profileWriteSequenceRef.current ||
            expectedUid !== (userRef.current?.uid ?? null)) return;
        if (response.status === 401) {
          clearIdentity();
          return;
        }
        if (!response.ok) return; // Network / backend failure is not a logout.
        const payload = await response.json();
        if (disposed || identityEpoch !== identityEpochRef.current ||
            writeSequence !== profileWriteSequenceRef.current ||
            expectedUid !== (userRef.current?.uid ?? null) ||
            !payload?.user?.uid || !payload.profile || !payload.csrf) return;
        // Refresh a browser session's CSRF credential even if the same UID has
        // unchanged profile fields (another tab may have replaced its cookie).
        if (payload.user.uid === expectedUid &&
            payload.profile.updatedAt === profileRef.current?.updatedAt) {
          setApiIdentity(expectedUid, String(payload.csrf));
          return;
        }
        setIdentity(payload);
      } catch {
        // Offline tabs keep their current controls; next foreground can retry.
      } finally {
        fetching = false;
        if (!disposed && needsAnotherRead && !document.hidden) {
          needsAnotherRead = false;
          scheduleRefresh('signal');
        }
      }
    };

    function scheduleRefresh(reason: 'focus' | 'signal') {
      if (disposed || !bootstrappedRef.current) return;
      if (document.visibilityState === 'hidden') {
        needsAnotherRead = true;
        return;
      }
      if (reason === 'focus' && !needsAnotherRead &&
          !shouldRefreshProfileOnFocus(lastSessionCheckRef.current, Date.now(),
            userRef.current?.uid ? undefined : PROFILE_GUEST_FOCUS_REFRESH_MS)) return;
      if (fetching) {
        if (reason === 'signal') needsAnotherRead = true;
        return;
      }
      if (scheduled !== null) return; // Coalesce bursts of chart setting saves.
      const elapsed = Date.now() - lastSessionCheckRef.current;
      const delay = reason === 'signal' || needsAnotherRead
        ? Math.max(180, PROFILE_SIGNAL_COALESCE_MS - Math.max(0, elapsed)) : 0;
      scheduled = setTimeout(() => {
        scheduled = null;
        needsAnotherRead = false;
        void runRefresh();
      }, delay);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PROFILE_SYNC_SIGNAL_KEY) return;
      const signal = parseProfileSyncSignal(event.newValue);
      if (signal && isProfileSyncRelevant(signal, userRef.current?.uid ?? null)) {
        scheduleRefresh('signal');
      }
    };
    const onForeground = () => {
      if (document.visibilityState !== 'hidden')
        scheduleRefresh(needsAnotherRead ? 'signal' : 'focus');
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onForeground);
    window.addEventListener('pageshow', onForeground);
    window.addEventListener('online', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    return () => {
      disposed = true;
      if (scheduled !== null) clearTimeout(scheduled);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onForeground);
      window.removeEventListener('pageshow', onForeground);
      window.removeEventListener('online', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [setIdentity, clearIdentity]);

  const handleError = (error: any): never => {
    const text = error?.message || 'Помилка авторизації.';
    setAuthError(text);
    setAuthErrorCode(error?.code || null);
    throw error;
  };
  const clearAuthError = () => {
    setAuthError(null);
    setAuthErrorCode(null);
    setAuthNotice(null);
  };
  const signInWithEmail = async (email: string, pass: string, remember = true, captchaToken = '') => {
    clearAuthError();
    try {
      const result = await authRequest('/api/auth/login', { email, password: pass, remember, captchaToken });
      setIdentity(result);
      publishProfileSyncSignal(result.user.uid, 'session');
    }
    catch (error) { handleError(error); }
  };
  const registerWithEmail = async (email: string, pass: string, name?: string, captchaToken = '') => {
    clearAuthError();
    try {
      await authRequest('/api/auth/register', { email, password: pass, displayName: name, captchaToken });
      // Registration confirmation is rendered on /check-email, not inside this modal.
    } catch (error) { handleError(error); }
  };
  const resendVerification = async (email: string, captchaToken = '') => {
    clearAuthError();
    try {
      await authRequest('/api/auth/resend-verification', { email, captchaToken });
      setAuthNotice('Якщо адреса зареєстрована, перевірте пошту.');
    } catch (error) { handleError(error); }
  };
  const requestPasswordReset = async (email: string, captchaToken = '') => {
    clearAuthError();
    try {
      await authRequest('/api/auth/forgot-password', { email, captchaToken });
      setAuthNotice('Якщо такий акаунт існує, лист із посиланням на відновлення надійде найближчим часом.');
    } catch (error) { handleError(error); }
  };
  const resetPassword = async (pass: string) => {
    clearAuthError();
    if (!resetToken) return handleError(new Error('Посилання відновлення недійсне.'));
    try {
      await authRequest('/api/auth/reset-password', { token: resetToken, password: pass });
      setResetToken(null);
      setAuthNotice('Пароль змінено. Тепер увійдіть до акаунта.');
      clearIdentity();
      publishProfileSyncSignal(null, 'session');
    } catch (error) { handleError(error); }
  };
  const updateProfileData = async (updates: Partial<UserProfile>) => {
    const account = userRef.current;
    if (!account) throw new Error('Увійдіть у свій акаунт.');
    const clean = stripLegacySecrets(updates as UserProfile);
    profileWriteSequenceRef.current += 1;
    delete clean.uid;
    delete clean.email;
    delete clean.createdAt;
    delete clean.updatedAt;
    const write = writeQueue.current.catch(() => {}).then(async () => {
      if (userRef.current?.uid !== account.uid) throw new Error('Обліковий запис змінився.');
      const original = profileRef.current || { uid: account.uid, email: account.email, displayName: account.displayName };
      const updated = mergeProfileUpdate(original, clean);
      const payload = { ...clean,
        ...(clean.hookChartPreferences ? { hookChartPreferences: updated.hookChartPreferences } : {}),
      };
      const response = await apiFetch('/api/account/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const failure = new Error(result.error || 'Не вдалося зберегти профіль.') as Error & { code?: string };
        failure.code = result.code;
        throw failure;
      }
      if (userRef.current?.uid !== account.uid) throw new Error('Обліковий запис змінився.');
      const nextProfile = stripLegacySecrets(result.profile as UserProfile);
      // A 200 response must not be presented as a successful profile save
      // unless PostgreSQL returned the requested account values. This also
      // catches accidentally dropped fields after a backend change.
      const accountFields: Array<keyof UserProfile> = [
        'displayName', 'defaultExchange', 'defaultMarketType', 'defaultTimeframe', 'timeZone',
      ];
      if (accountFields.some(field => clean[field] !== undefined && nextProfile[field] !== clean[field])) {
        throw new Error('Сервер не підтвердив збереження налаштувань профілю. Спробуйте ще раз.');
      }
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      setUser(result.user as H00kUser);
      applySitePreferences(nextProfile, account.uid);
      publishProfileSyncSignal(account.uid, 'profile');
    });
    writeQueue.current = write;
    await write;
  };
  const updateTerminalWorkspace = async (
    workspace: NonNullable<UserProfile['terminalSettings']>, expectedVersion: string | null,
  ): Promise<string | null> => {
    // The expected version travels inside the workspace PATCH but is discarded
    // by the server before JSONB persistence. Never trust a version from the UI.
    await updateProfileData({
      terminalSettings: { ...workspace, _expectedVersion: expectedVersion } as NonNullable<UserProfile['terminalSettings']>,
    });
    return profileRef.current?.terminalSettings?.version ?? null;
  };
  const refreshProfile = async (): Promise<UserProfile> => {
    const account = userRef.current;
    if (!account) throw new Error('Увійдіть у свій акаунт.');
    // Do not let a refresh race an in-flight profile PATCH.
    await writeQueue.current.catch(() => {});
    const epoch = identityEpochRef.current;
    const response = await fetch('/api/auth/session', {
      credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) throw new Error('Не вдалося оновити хмарні налаштування Термінала.');
    const payload = await response.json();
    if (identityEpochRef.current !== epoch || userRef.current?.uid !== account.uid
        || payload?.user?.uid !== account.uid || !payload.profile || !payload.csrf) {
      throw new Error('Сесія змінилася під час синхронізації Термінала.');
    }
    setIdentity(payload);
    return stripLegacySecrets(payload.profile as UserProfile);
  };
  const logout = async () => {
    if (userRef.current) {
      try {
        const response = await apiFetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) throw new Error('Не вдалося завершити сесію.');
      } catch (error) { throw error; }
    }
    clearIdentity();
    publishProfileSyncSignal(null, 'session');
  };
  const logoutAll = async () => {
    const response = await apiFetch('/api/auth/logout-all', { method: 'POST' });
    if (!response.ok) throw new Error('Не вдалося завершити сесії.');
    clearIdentity();
    publishProfileSyncSignal(null, 'session');
  };
  const listSessions = async (): Promise<AuthSessionSummary[]> => {
    const response = await apiFetch('/api/auth/sessions');
    if (!response.ok) throw new Error('Не вдалося завантажити сесії.');
    const data = await response.json();
    return Array.isArray(data.sessions) ? data.sessions : [];
  };
  const revokeSession = async (id: string) => {
    const response = await apiFetch('/api/auth/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!response.ok) throw new Error('Не вдалося завершити сесію.');
    const result = await response.json();
    if (result.revokedCurrent) {
      clearIdentity();
      publishProfileSyncSignal(null, 'session');
    }
  };

  return <AuthContext.Provider value={{
    user, profile, loading, signInWithEmail, registerWithEmail,
    resendVerification, requestPasswordReset, resetPassword, resetToken,
    updateProfileData, updateTerminalWorkspace, refreshProfile, logout, logoutAll, listSessions, revokeSession,
    authError, authErrorCode, authNotice, clearAuthError,
  }}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
