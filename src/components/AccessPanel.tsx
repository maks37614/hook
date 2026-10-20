import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAccess } from '../context/AccessContext';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';

// Registration is required; trials and activation codes are not.
export const RegistrationGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading, logout } = useAuth();
  const { access, loading, error, refresh } = useAccess();
  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">Завантаження акаунта…</div>;
  if (!user) return <AuthModal isOpen isRestrictedMode initialMode="signup" onClose={() => {}} />;
  if (loading || !access) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-5 text-center text-slate-200"><ShieldCheck className="text-cyan-400" size={32} /><p>{error || 'Завантажуємо акаунт…'}</p>{error && <div className="flex gap-3"><button onClick={() => void refresh()} className="rounded-lg bg-cyan-500 px-4 py-2 text-slate-950">Повторити</button><button onClick={() => void logout()} className="rounded-lg border border-slate-600 px-4 py-2">Вийти</button></div>}</div>;
  return <React.Fragment key={user.uid}>{children}</React.Fragment>;
};
