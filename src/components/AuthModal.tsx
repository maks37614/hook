import React, { useEffect, useState } from 'react';
import { X, LogIn, UserPlus, Mail, Lock, User as UserIcon, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type AuthPromptReason = 'chart' | 'alerts' | 'linking' | 'general' | null;
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  onSuccess?: () => void;
  isRestrictedMode?: boolean;
  promptReason?: AuthPromptReason;
}
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'signin', onSuccess, isRestrictedMode = false }) => {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [resetRequested, setResetRequested] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (isOpen) { setMode(initialMode); clearAuthError(); setError(null); setResetRequested(false); setPassword(''); } }, [isOpen, initialMode]);
  if (!isOpen) return null;
  const close = () => { if (!isRestrictedMode && !busy) onClose(); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); clearAuthError();
    try { await action(); onSuccess?.(); onClose(); }
    catch (value: any) { setError(value.message || 'Не вдалося ввійти. Повторіть спробу.'); }
    finally { setBusy(false); }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'signup' && password.length < 8) { setError('Пароль повинен містити не менше 8 символів'); return; }
    void run(() => mode === 'signup' ? registerWithEmail(email, password, displayName) : signInWithEmail(email, password));
  };
  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); clearAuthError();
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Не вдалося надіслати лист.');
      setResetRequested(true);
    } catch (error: any) {
      setError(error.message || 'Не вдалося надіслати лист. Спробуйте пізніше.');
    } finally { setBusy(false); }
  };
  const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400';
  return <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4 backdrop-blur-md" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="relative my-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl sm:p-7">
      {!isRestrictedMode && <button aria-label="Закрити" onClick={close} className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:text-white"><X size={18} /></button>}
      <div className="mb-5 flex items-center gap-3"><ShieldCheck className="text-cyan-400" size={30} /><div><h1 id="auth-title" className="text-lg font-bold">{mode === 'signup' ? 'Створити акаунт' : mode === 'forgot' ? 'Відновлення пароля' : 'Вхід у signalhook'}</h1><p className="mt-1 text-xs text-slate-400">Усі сторінки доступні після реєстрації</p></div></div>
      <div className="mb-5 rounded-xl border border-cyan-800 bg-cyan-950/40 p-3 text-sm text-cyan-100">{mode === 'forgot' ? 'Введіть email акаунта. Якщо він існує, на пошту надійде посилання для зміни пароля.' : 'Створіть акаунт і користуйтеся всіма функціями без коду активації.'}</div>
      {mode !== 'forgot' && <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
        {(['signin', 'signup'] as const).map(value => <button key={value} type="button" disabled={busy} onClick={() => { setMode(value); setError(null); clearAuthError(); }} className={`flex items-center justify-center gap-2 rounded-lg p-2 text-sm ${mode === value ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>{value === 'signin' ? <LogIn size={16} /> : <UserPlus size={16} />}{value === 'signin' ? 'Вхід' : 'Реєстрація'}</button>)}
      </div>}
      {(error || authError) && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200"><AlertCircle size={18} className="shrink-0" /><span>{authError || error}</span></div>}
      {resetRequested && <div role="status" className="mb-4 rounded-xl border border-emerald-700 bg-emerald-950/35 p-3 text-sm text-emerald-200">Якщо акаунт існує, лист із посиланням на зміну пароля буде надіслано. Перевірте також «Спам».</div>}
      {mode !== 'forgot' && <><button type="button" disabled={busy} onClick={() => void run(signInWithGoogle)} className="mb-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50">Продовжити з Google</button>
      <p className="mb-4 text-center text-xs text-slate-500">або через електронну пошту</p></>}
      <form onSubmit={mode === 'forgot' ? requestReset : submit} className="space-y-4">
        {mode === 'signup' && <label className="block text-sm">Ім’я<div className="relative mt-1"><UserIcon className="absolute left-3 top-3 text-slate-500" size={18} /><input name="name" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={100} className={input} /></div></label>}
        <label className="block text-sm">Email<div className="relative mt-1"><Mail className="absolute left-3 top-3 text-slate-500" size={18} /><input name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className={input} /></div></label>
        {mode !== 'forgot' && <label className="block text-sm">Пароль<div className="relative mt-1"><Lock className="absolute left-3 top-3 text-slate-500" size={18} /><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 6} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'Мінімум 8 символів' : ''} className={input + ' pr-12'} /><button aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'} type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
        <button disabled={busy} type="submit" className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{busy ? 'Зачекайте…' : mode === 'forgot' ? 'Надіслати посилання' : mode === 'signup' ? 'Зареєструватися' : 'Увійти'}</button>
      </form>
      {mode === 'signin' && <button type="button" disabled={busy} onClick={() => { setMode('forgot'); setError(null); setResetRequested(false); clearAuthError(); }} className="mt-4 w-full text-center text-sm font-semibold text-cyan-300 hover:text-cyan-200">Забули пароль?</button>}
      {mode === 'forgot' && <button type="button" disabled={busy} onClick={() => { setMode('signin'); setError(null); setResetRequested(false); clearAuthError(); }} className="mt-4 w-full text-center text-sm font-semibold text-cyan-300 hover:text-cyan-200">Повернутися до входу</button>}
    </section>
  </div>;
};
