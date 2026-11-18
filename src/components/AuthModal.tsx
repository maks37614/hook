import React, { useEffect, useState } from 'react';
import { AuthCaptcha } from './AuthCaptcha';
import { X, LogIn, UserPlus, Mail, Lock, UserRound, Eye, EyeOff, AlertCircle, CheckCircle2, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';

export type AuthPromptReason = 'chart' | 'alerts' | 'linking' | 'general' | null;
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  onSuccess?: () => void;
  isRestrictedMode?: boolean;
  promptReason?: AuthPromptReason;
}
type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen, onClose, initialMode = 'signin', onSuccess, isRestrictedMode = false, promptReason = null,
}) => {
  const {
    signInWithEmail, registerWithEmail, resendVerification, requestPasswordReset, resetPassword,
    resetToken, authError, authErrorCode, authNotice, clearAuthError,
  } = useAuth();
  const { language } = useLanguage();
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);
  const [captchaStatus, setCaptchaStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  useEffect(() => {
    if (isOpen) {
      setMode(resetToken ? 'reset' : initialMode);
      setPassword('');
      setPasswordConfirmation('');
      setLocalError(null);
      setCaptchaToken(null);
      setCaptchaEpoch(value => value + 1);
      clearAuthError();
    }
  }, [isOpen, initialMode]);
  // A successful reset clears resetToken. Do not clear authNotice again when it
  // changes: the "password updated" success message must remain visible.
  useEffect(() => {
    if (isOpen && resetToken) setMode('reset');
  }, [isOpen, resetToken]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setCaptchaStatus('loading');
    setCaptchaSiteKey(null);
    void fetch('/api/auth/config', { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('CAPTCHA config unavailable');
        return response.json();
      })
      .then(config => {
        if (!active) return;
        const key = config?.captcha?.configured && typeof config.captcha.siteKey === 'string'
          ? config.captcha.siteKey : null;
        setCaptchaSiteKey(key);
        setCaptchaStatus(key ? 'ready' : 'unavailable');
      })
      .catch(() => { if (active) setCaptchaStatus('unavailable'); });
    return () => { active = false; };
  }, [isOpen]);

  if (!isOpen) return null;
  const changeMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setPasswordConfirmation('');
    setCaptchaToken(null);
    setCaptchaEpoch(value => value + 1);
    setLocalError(null);
    clearAuthError();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    clearAuthError();
    if (mode !== 'reset' && !email.trim()) { setLocalError('Введіть адресу email.'); return; }
    if (['signin', 'signup', 'reset'].includes(mode) && !password) {
      setLocalError('Введіть пароль.'); return;
    }
    if (['signup', 'reset'].includes(mode) && password.length < 12) {
      setLocalError('Пароль має містити щонайменше 12 символів.'); return;
    }
    if (['signup', 'reset'].includes(mode) && password !== passwordConfirmation) {
      setLocalError('Паролі не збігаються. Введіть однаковий пароль у двох полях.'); return;
    }
    if (mode !== 'reset' && !captchaToken) { setLocalError('Спочатку пройдіть перевірку CAPTCHA.'); return; }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password, remember, captchaToken || '');
        setPassword('');
        onSuccess?.();
        onClose();
      } else if (mode === 'signup') {
        await registerWithEmail(email.trim(), password, displayName, captchaToken || '');
        setPassword('');
        setPasswordConfirmation('');
      } else if (mode === 'forgot') {
        await requestPasswordReset(email.trim(), captchaToken || '');
      } else {
        await resetPassword(password);
        setPassword('');
        setPasswordConfirmation('');
        setMode('signin');
      }
    } catch {
      // AuthContext provides localized error and error code.
    } finally {
      setBusy(false);
      if (mode !== 'reset') { setCaptchaToken(null); setCaptchaEpoch(value => value + 1); }
    }
  };
  const sendAgain = async () => {
    if (!captchaToken) { setLocalError('Спочатку пройдіть перевірку CAPTCHA.'); return; }
    setBusy(true);
    try { await resendVerification(email, captchaToken); } catch {}
    finally { setBusy(false); setCaptchaToken(null); setCaptchaEpoch(value => value + 1); }
  };
  const title = mode === 'signup' ? 'Безкоштовна реєстрація' :
    mode === 'forgot' ? 'Відновлення доступу' :
    mode === 'reset' ? 'Новий пароль' : 'Вхід до h00k';
  const explanation = mode === 'signup'
    ? 'Створіть акаунт без коду запрошення та без оплати.'
    : mode === 'forgot'
      ? 'Надішлемо посилання для відновлення на ваш email.'
      : mode === 'reset'
        ? 'Створіть новий надійний пароль для свого акаунта.'
        : promptReason === 'alerts'
          ? 'Увійдіть, щоб увімкнути персональні сповіщення.'
          : 'Ваші налаштування, архів і обрані монети будуть доступні між пристроями.';

  const localizedTitle = translatePhrase(language, title);
  const localizedExplanation = translatePhrase(language, explanation);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-3 backdrop-blur-md sm:p-5"
      role="presentation"
      onMouseDown={(event) => { if (!isRestrictedMode && event.target === event.currentTarget) onClose(); }}
    >
      <div data-ui-a11y="auth-modal" role="dialog" aria-modal="true" aria-label={localizedTitle}
        className="vq-modal-shell my-auto flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900 shadow-2xl shadow-cyan-950/40">
        <div className="vq-modal-header flex shrink-0 items-start justify-between border-b border-slate-800 bg-slate-950/60 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/15 p-2 text-cyan-300">
              {mode === 'signup' ? <UserPlus size={19}/> : <LogIn size={19}/>}
            </span>
            <div>
              <h2 className="text-base font-bold text-white">{localizedTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{localizedExplanation}</p>
            </div>
          </div>
          {!isRestrictedMode && <button type="button" onClick={onClose} aria-label={translatePhrase(language, "Закрити")}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={18}/></button>}
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {(mode === 'signin' || mode === 'signup') && (
            <div role="tablist" aria-label={translatePhrase(language, "Авторизація")} className="vq-modal-controls mb-5 flex rounded-xl border border-slate-700 bg-slate-950/60 p-1">
              {(['signin', 'signup'] as const).map(option => (
                <button key={option} role="tab" aria-selected={mode === option}
                  type="button" onClick={() => changeMode(option)}
                  className={'flex-1 rounded-lg py-2 text-xs font-bold transition-colors ' +
                    (mode === option ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white')}>
                  {option === 'signin' ? 'Увійти' : 'Зареєструватися'}
                </button>
              ))}
            </div>
          )}
          {(localError || authError) && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0"/>
              <span>{translatePhrase(language, localError || authError || '')}</span>
            </div>
          )}
          {mode === 'signup' && authErrorCode === 'MAIL_DELIVERY_FAILED' && (
            <p className="mb-3 text-xs text-amber-200">
              Акаунт може бути створений. Після відновлення пошти натисніть «Надіслати лист підтвердження ще раз».
            </p>
          )}
          {authNotice && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0"/>
              <span>{translatePhrase(language, authNotice)}</span>
            </div>
          )}
          <form onSubmit={submit} className="vq-modal-controls space-y-3">
            {mode === 'signup' && (
              <label className="block text-xs font-medium text-slate-300">
                Ім'я або позивний
                <span className="relative mt-1 block">
                  <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                  <input type="text" maxLength={80} autoComplete="nickname" value={displayName}
                    onChange={event => setDisplayName(event.target.value)} placeholder="Наприклад: Alex Scalper"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400"/>
                </span>
              </label>
            )}
            {mode !== 'reset' && (
              <label className="block text-xs font-medium text-slate-300">
                Електронна пошта
                <span className="relative mt-1 block">
                  <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                  <input type="email" required autoComplete="email" maxLength={254} value={email}
                    onChange={event => setEmail(event.target.value)} placeholder="name@example.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400"/>
                </span>
              </label>
            )}
            {mode !== 'forgot' && (
              <label className="block text-xs font-medium text-slate-300">
                {mode === 'reset' ? 'Новий пароль' : 'Пароль'}
                <span className="relative mt-1 block">
                  <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                  <input type={showPassword ? 'text' : 'password'} required
                    minLength={mode === 'signin' ? 1 : 12} maxLength={128}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password} onChange={event => setPassword(event.target.value)}
                    placeholder={mode === 'signin' ? 'Ваш пароль' : 'Щонайменше 12 символів'}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-11 text-sm text-white outline-none focus:border-cyan-400"/>
                  <button type="button" aria-label={translatePhrase(language, showPassword ? 'Приховати пароль' : 'Показати пароль')} aria-pressed={showPassword}
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-white">
                    {showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}
                  </button>
                </span>
              </label>
            )}
            {(mode === 'signup' || mode === 'reset') && (
              <label className="block text-xs font-medium text-slate-300">
                Повторіть пароль
                <span className="relative mt-1 block">
                  <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                  <input type={showPassword ? 'text' : 'password'} required
                    minLength={12} maxLength={128} autoComplete="new-password"
                    value={passwordConfirmation}
                    onChange={event => setPasswordConfirmation(event.target.value)}
                    placeholder="Введіть пароль ще раз"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400"/>
                </span>
              </label>
            )}
            {mode === 'signin' && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}
                    className="accent-cyan-500"/> Запам'ятати мене
                </label>
                <button type="button" onClick={() => changeMode('forgot')}
                  className="text-xs text-cyan-300 hover:text-cyan-200">Забули пароль?</button>
              </div>
            )}
            {mode !== 'reset' && (
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 px-2 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
                  <ShieldCheck size={14} className="text-cyan-300" /> Захист від ботів
                </div>
                {captchaStatus === 'ready' && captchaSiteKey
                  ? <AuthCaptcha key={`${mode}-${captchaEpoch}`} siteKey={captchaSiteKey} onTokenChange={setCaptchaToken} />
                  : <p role="status" className="text-xs leading-relaxed text-amber-200">
                      {captchaStatus === 'loading' ? 'Завантажуємо перевірку CAPTCHA…' :
                        'CAPTCHA ще не налаштована або недоступна. Зверніться до адміністратора.'}
                    </p>}
              </div>
            )}
            <button type="submit" disabled={busy || (mode !== 'reset' && !captchaToken)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50">
              {mode === 'reset' ? <KeyRound size={17}/> : <ShieldCheck size={17}/>}
              {busy ? 'Обробка…' : mode === 'signup' ? 'Зареєструватися безкоштовно' :
                mode === 'forgot' ? 'Надіслати посилання' : mode === 'reset' ? 'Змінити пароль' : 'Увійти'}
            </button>
          </form>
          {(authErrorCode === 'EMAIL_UNVERIFIED' || authErrorCode === 'EMAIL_EXISTS' || authErrorCode === 'MAIL_DELIVERY_FAILED') && (
            <button type="button" disabled={busy || !captchaToken} onClick={sendAgain}
              className="mt-3 w-full rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-950/30 disabled:opacity-50">
              Надіслати лист підтвердження ще раз
            </button>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" onClick={() => changeMode('signin')}
              className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-cyan-300">
              <ArrowLeft size={15}/> Повернутися до входу
            </button>
          )}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-500">
            Безкоштовний акаунт · CAPTCHA · Захищені сесії · Підтвердження email
          </p>
        </div>
      </div>
    </div>
  );
};
