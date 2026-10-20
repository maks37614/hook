import React, { useEffect, useState } from 'react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { AlertCircle, CheckCircle2, LockKeyhole } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from '../firebase';

function explain(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code')
    return 'Посилання більше не дійсне: його вже використано або минув термін дії. Якщо лист отриманий щойно, адміністратор має перевірити API-ключ Firebase.';
  if (code === 'auth/invalid-api-key') return 'API-ключ Firebase у посиланні недійсний. Перевірте налаштування API-ключа.';
  if (code === 'auth/unauthorized-domain' || code === 'auth/unauthorized-continue-uri')
    return 'Домен h00k.top не додано до дозволених доменів Firebase.';
  if (code === 'auth/network-request-failed') return 'Не вдалося підключитися до Firebase. Перевірте інтернет-з’єднання.';
  if (code === 'auth/weak-password') return 'Занадто слабкий пароль. Введіть складніший пароль.';
  if (code === 'auth/too-many-requests') return 'Забагато спроб. Спробуйте пізніше.';
  return 'Не вдалося підтвердити посилання Firebase. Запросіть новий лист або зверніться до підтримки.';
}

export function FirebasePasswordResetPage({ code, emailLinkApiKey }: { code: string; emailLinkApiKey: string | null }) {
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let active = true;
    verifyPasswordResetCode(auth, code)
      .then(address => { if (active) setVerifiedEmail(address); })
      .catch(value => { if (active) setError(explain(value)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (working || done || !verifiedEmail || error) return;
    if (password.length < 8 || password.length > 256) { setFormError('Пароль має містити від 8 до 256 символів.'); return; }
    if (password !== repeat) { setFormError('Паролі не збігаються.'); return; }
    setFormError('');
    setWorking(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setPassword(''); setRepeat(''); setDone(true);
    } catch (value) {
      const authCode = (value as { code?: string })?.code || '';
      if (authCode === 'auth/expired-action-code' || authCode === 'auth/invalid-action-code') setError(explain(value));
      else setFormError(explain(value));
    } finally { setWorking(false); }
  }
  async function resend(event: React.FormEvent) {
    event.preventDefault();
    if (resending || !email.trim()) return;
    setResending(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error('Email request failed');
      setResent(true);
    } catch { setError('Не вдалося надіслати лист. Спробуйте пізніше.'); }
    finally { setResending(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#070e1c] p-4 text-slate-100">
    <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
      <div className="flex items-center gap-3"><LockKeyhole size={28} className="text-cyan-400"/><h1 className="text-lg font-bold">Відновлення пароля h00k.top</h1></div>
      {loading ? <p role="status" className="text-sm text-slate-300">Перевірка посилання Firebase…</p>
        : done ? <p role="status" className="flex gap-2 rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          <CheckCircle2 className="shrink-0" size={18}/> Пароль змінено! Увійдіть із новим паролем.</p>
        : error ? <>
          <p role="alert" className="flex gap-2 rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">
            <AlertCircle className="shrink-0" size={18}/>{error}</p>
          {emailLinkApiKey && emailLinkApiKey !== firebaseConfig.apiKey &&
            <p className="text-xs text-amber-200">API-ключ у листі відрізняється від ключа вебзастосунку. Перевірте конфігурацію Firebase.</p>}
          <form onSubmit={resend} className="space-y-2">
            <label className="block text-sm">Email для нового посилання
              <input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-500"/>
            </label>
            <button type="submit" disabled={resending} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
              {resending ? 'Надсилання…' : 'Запросити новий лист'}
            </button>
            {resent && <p role="status" className="text-xs text-emerald-300">Якщо акаунт існує, новий лист надійде на вказану адресу.</p>}
          </form>
        </> : <form onSubmit={save} className="space-y-4">
          <p className="text-xs text-slate-300">Пошта підтверджена: <strong className="text-white">{verifiedEmail}</strong></p>
          {formError && <p role="alert" className="rounded-lg border border-amber-600/50 bg-amber-950/30 p-3 text-xs text-amber-200">{formError}</p>}
          <label className="block text-sm">Новий пароль
            <input type="password" autoComplete="new-password" minLength={8} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-500"/>
          </label>
          <label className="block text-sm">Повторіть новий пароль
            <input type="password" autoComplete="new-password" minLength={8} maxLength={256} required value={repeat} onChange={event => setRepeat(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-500"/>
          </label>
          <button type="submit" disabled={working} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
            {working ? 'Зміна пароля…' : 'Встановити пароль'}
          </button>
        </form>}
      <a href="/#screener" className="block text-center text-sm text-cyan-300 hover:underline">Повернутися до входу</a>
    </section>
  </main>;
}
