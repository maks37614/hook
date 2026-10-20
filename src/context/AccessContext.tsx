import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import type { AccountAccess } from '../types/access';

interface AccessContextValue {
  access: AccountAccess | null;
  loading: boolean;
  error: string | null;
  hasFullAccess: boolean;
  refresh: () => Promise<void>;
}
const unavailable: AccessContextValue = {
  access: null, loading: true, error: null, hasFullAccess: false, refresh: async () => {},
};
export const AccessContext = createContext<AccessContextValue>(unavailable);
export const useAccess = () => useContext(AccessContext);

export const AccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const uid = user?.uid;
  const currentUid = useRef(uid); currentUid.current = uid;
  const sequence = useRef(0);
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!uid) { setAccess(null); setLoading(false); return; }
    try {
      const response = await fetch('/api/access/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (request !== sequence.current || uid !== currentUid.current) return;
      if (!response.ok || !body.success || body.access?.userId !== uid)
        throw new Error(response.status === 401 ? 'Сесія завершилася. Увійдіть повторно.' : body.error || 'Не вдалося перевірити акаунт');
      setAccess(body.access); setError(null); setLoading(false);
    } catch (value: any) {
      if (request !== sequence.current || uid !== currentUid.current) return;
      setAccess(null); setError(value.message || 'Не вдалося завантажити акаунт'); setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    setAccess(null); setLoading(!!uid); setError(null);
    void refresh();
    if (!uid) return;
    const timer = setInterval(() => void refresh(), 60000);
    const changed = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('signalhook:access-check', changed);
    document.addEventListener('visibilitychange', changed);
    return () => {
      clearInterval(timer); sequence.current++;
      window.removeEventListener('signalhook:access-check', changed);
      document.removeEventListener('visibilitychange', changed);
    };
  }, [uid, refresh]);

  const verifiedAccess = access?.userId === uid ? access : null;
  return <AccessContext.Provider value={{
    access: verifiedAccess, loading: !!uid && (loading || (!verifiedAccess && !error)),
    error, hasFullAccess: !!verifiedAccess?.hasFullAccess, refresh,
  }}>{children}</AccessContext.Provider>;
};
