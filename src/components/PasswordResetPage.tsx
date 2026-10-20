import React, { useState } from 'react';
import { LockKeyhole, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

export function PasswordResetPage({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (working) return;
    if (password.length < 8 || password.length > 256) {
      setError('Пароль має містити від 8 до 256 символів.'); return;
    }
    if (password !== confirmation) { setError('Паролі не збігаються.'); return; }
    setError(''); setWorking(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Посилання недійсне.');
      setFinished(true);
      setPassword(''); setConfirmation('');
      // The server invalidated the local sessions; remove this browser's
      // stale copy so a fresh login is required immediately.
      try { localStorage.removeItem('signalhook_local_session'); } catch {}
      // Remove the token from browser history immediately after use.
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#password-reset-complete');
    } catch (value: any) {
      setError(value.message || 'Не вдалося змінити пароль.');
    } finally { setWorking(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#070e1c] p-4 text-slate-100">
    <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="mb-4 flex items-center gap-3"><LockKeyhole className="text-cyan-400" size={30}/><h1 className="text-xl font-bold">Новий пароль h00k.top</h1></div>
      {finished ? <>
        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200"><CheckCircle2 className="shrink-0" size={18}/> Пароль змінено. Усі попередні сеанси завершено. Увійдіть із новим паролем.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 block w-full rounded-xl bg-cyan-500 p-3 text-center text-sm font-bold text-slate-950">Повернутися до входу</button>
      </> : <>
        <p className="mb-5 text-sm text-slate-400">Введіть новий пароль. Посилання з листа одноразове й діє 30 хвилин.</p>
        {error && <p role="alert" className="mb-4 flex gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200"><AlertCircle className="shrink-0" size={18}/>{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">Новий пароль
            <div className="relative mt-1">
              <input autoComplete="new-password" type={show ? 'text' : 'password'} required minLength={8} maxLength={256}
                value={password} onChange={event => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 pr-12 text-white outline-none focus:border-cyan-400"/>
              <button type="button" aria-label={show ? 'Приховати пароль' : 'Показати пароль'} onClick={() => setShow(value => !value)}
                className="absolute right-3 top-3 text-slate-400">{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
            </div>
          </label>
          <label className="block text-sm">Повторіть пароль
            <input autoComplete="new-password" type={show ? 'text' : 'password'} required minLength={8} maxLength={256}
              value={confirmation} onChange={event => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-cyan-400"/>
          </label>
          <button type="submit" disabled={working} className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
            {working ? 'Змінюємо пароль…' : 'Встановити новий пароль'}
          </button>
        </form>
        <a href="/#screener" className="mt-4 block text-center text-sm text-cyan-300 hover:text-cyan-200">Повернутися на сайт</a>
      </>}
    </section>
  </main>;
}
