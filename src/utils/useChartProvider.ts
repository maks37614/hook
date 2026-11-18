import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { chartProviderStorageKey, resolveChartProvider } from './chartPreferences';

/** The user's live profile is authoritative; the cache is isolated by account. */
export function useChartProvider() {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  let cachedValue: string | null = null;
  try {
    if (uid && typeof window !== 'undefined') cachedValue = localStorage.getItem(chartProviderStorageKey(uid));
  } catch {}
  const provider = resolveChartProvider(uid, profile, cachedValue);

  useEffect(() => {
    if (!uid || profile?.uid !== uid) return;
    try { localStorage.setItem(chartProviderStorageKey(uid), provider); } catch {}
  }, [uid, profile?.uid, provider]);

  return provider;
}
