import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import type { TelegramStatus } from '../types';

type TelegramAction = 'connect' | 'disconnect' | 'test';
interface TelegramContextValue {
  status: TelegramStatus | null;
  loading: boolean;
  busy: TelegramAction | null;
  linkUrl: string | null;
  errorCode: string | null;
  feedback: 'sent' | 'queued' | null;
  refresh: () => Promise<TelegramStatus | null>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendTest: () => Promise<void>;
}
const TelegramContext = createContext<TelegramContextValue | null>(null);

async function requestJson(url: string, method = 'GET', body?: Record<string, unknown>) {
  const response = await apiFetch(url, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.success === false && !data.queued)) {
    const error = new Error(data.error || 'Telegram request failed') as Error & { code?: string };
    error.code = data.errorCode || 'request_failed';
    throw error;
  }
  return data;
}

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const accountRef = useRef(user?.uid);
  accountRef.current = user?.uid;
  const initializedAccount = useRef<string | null>(null);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<TelegramAction | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'sent' | 'queued' | null>(null);

  const refresh = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) {
      setStatus(null);
      setLinkUrl(null);
      return null;
    }
    const data = await requestJson('/api/telegram/status');
    if (accountRef.current !== uid) return null;
    const next = data as TelegramStatus;
    setStatus(next);
    setErrorCode(null);
    if (next.isConfigured || (next.linkExpiresAt && next.linkExpiresAt <= Date.now())) setLinkUrl(null);
    return next;
  }, [user?.uid]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      initializedAccount.current = null;
      setStatus(null);
      setLinkUrl(null);
      setErrorCode(null);
      setFeedback(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const accountChanged = initializedAccount.current !== uid;
    initializedAccount.current = uid;
    if (accountChanged) {
      setStatus(null);
      setLinkUrl(null);
      setErrorCode(null);
      setFeedback(null);
      setBusy(null);
    }
    setLoading(true);
    requestJson('/api/telegram/config', 'POST', { language })
      .then((data) => {
        if (!cancelled && accountRef.current === uid) {
          const next = data as TelegramStatus;
          setStatus(next);
          if (next.isConfigured) setLinkUrl(null);
        }
      })
      .catch((error: Error & { code?: string }) => {
        if (!cancelled && accountRef.current === uid) setErrorCode(error.code || 'request_failed');
      })
      .finally(() => {
        if (!cancelled && accountRef.current === uid) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.uid, language]);

  useEffect(() => {
    if (!user?.uid || !status?.linkPending) return;
    const timer = window.setInterval(() => { refresh().catch(() => {}); }, 2500);
    return () => window.clearInterval(timer);
  }, [user?.uid, status?.linkPending, refresh]);

  const connect = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) { setErrorCode('sign_in'); return; }
    setBusy('connect');
    setErrorCode(null);
    setFeedback(null);
    setLinkUrl(null);
    try {
      const data = await requestJson('/api/telegram/link', 'POST', { language });
      if (accountRef.current !== uid) return;
      setLinkUrl(data.url || null);
      setStatus(current => current ? {
        ...current, linkPending: true, linkExpiresAt: data.expiresAt, botUsername: data.botUsername || current.botUsername,
      } : current);
      await refresh().catch(() => {});
    } catch (error) {
      if (accountRef.current === uid) setErrorCode((error as { code?: string }).code || 'request_failed');
    } finally {
      if (accountRef.current === uid) setBusy(null);
    }
  }, [user?.uid, language, refresh]);

  const disconnect = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) { setErrorCode('sign_in'); return; }
    setBusy('disconnect');
    setErrorCode(null);
    setFeedback(null);
    try {
      const data = await requestJson('/api/telegram/disconnect', 'POST', {});
      if (accountRef.current === uid) {
        setStatus(data as TelegramStatus);
        setLinkUrl(null);
      }
    } catch (error) {
      if (accountRef.current === uid) setErrorCode((error as { code?: string }).code || 'request_failed');
    } finally {
      if (accountRef.current === uid) setBusy(null);
    }
  }, [user?.uid]);

  const sendTest = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) { setErrorCode('sign_in'); return; }
    setBusy('test');
    setErrorCode(null);
    setFeedback(null);
    try {
      const data = await requestJson('/api/telegram/test', 'POST', { language });
      if (accountRef.current === uid) setFeedback(data.queued ? 'queued' : data.success ? 'sent' : null);
    } catch (error) {
      if (accountRef.current === uid) setErrorCode((error as { code?: string }).code || 'request_failed');
    } finally {
      if (accountRef.current === uid) setBusy(null);
    }
  }, [user?.uid, language]);

  return (
    <TelegramContext.Provider value={{ status, loading, busy, linkUrl, errorCode, feedback, refresh, connect, disconnect, sendTest }}>
      {children}
    </TelegramContext.Provider>
  );
};

export function useTelegram() {
  const context = useContext(TelegramContext);
  if (!context) throw new Error('useTelegram must be used within TelegramProvider');
  return context;
}
