import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, MailCheck } from 'lucide-react';
import { useLanguage, type SupportedLanguage } from '../context/LanguageContext';
import { pendingRegistrationEmail, registrationMailbox } from '../utils/registrationConfirmation';

const copy = {
  uk: {
    title: 'Ви успішно зареєструвалися',
    genericTitle: 'Підтвердьте електронну пошту',
    subtitle: 'Підтвердіть пошту, щоб активувати акаунт h00k.',
    sent: 'Перевірте вхідні повідомлення на',
    genericSent: 'Перевірте свою поштову скриньку. Посилання для підтвердження може надійти за кілька хвилин.',
    action: 'Відкрити',
    otherMailbox: 'Відкрийте пошту у своєму поштовому застосунку та перейдіть за посиланням із листа.',
    spam: 'Якщо листа немає, перевірте папку «Спам».',
    account: 'Якщо ця адреса вже використовується, увійдіть або відновіть пароль.',
    home: 'На головну',
    language: 'Мова',
  },
  en: {
    title: 'You have registered successfully',
    genericTitle: 'Confirm your email address',
    subtitle: 'Confirm your email to activate your h00k account.',
    sent: 'Check the inbox for',
    genericSent: 'Check your mailbox. The verification link may take a few minutes to arrive.',
    action: 'Open',
    otherMailbox: 'Open your email app and follow the verification link.',
    spam: 'If you cannot find the email, check your spam folder.',
    account: 'If this address is already registered, sign in or reset your password.',
    home: 'Back to homepage',
    language: 'Language',
  },
  pl: {
    title: 'Rejestracja zakończona pomyślnie',
    genericTitle: 'Potwierdź adres e-mail',
    subtitle: 'Potwierdź e-mail, aby aktywować konto h00k.',
    sent: 'Sprawdź skrzynkę odbiorczą adresu',
    genericSent: 'Sprawdź pocztę. Link potwierdzający może dotrzeć za kilka minut.',
    action: 'Otwórz',
    otherMailbox: 'Otwórz aplikację pocztową i kliknij link potwierdzający.',
    spam: 'Jeśli wiadomość nie dotarła, sprawdź folder Spam.',
    account: 'Jeżeli adres jest już zarejestrowany, zaloguj się lub zresetuj hasło.',
    home: 'Strona główna',
    language: 'Język',
  },
  ru: {
    title: 'Вы успешно зарегистрировались',
    genericTitle: 'Подтвердите электронную почту',
    subtitle: 'Подтвердите почту, чтобы активировать аккаунт h00k.',
    sent: 'Проверьте входящие сообщения для',
    genericSent: 'Проверьте почту. Ссылка для подтверждения может прийти через несколько минут.',
    action: 'Открыть',
    otherMailbox: 'Откройте почтовое приложение и перейдите по ссылке из письма.',
    spam: 'Если письма нет, проверьте папку «Спам».',
    account: 'Если этот адрес уже зарегистрирован, войдите или восстановите пароль.',
    home: 'На главную',
    language: 'Язык',
  },
} as const;

/** Standalone lightweight route: no screener, quote streams, charts or trading workers. */
export const RegistrationConfirmationPage: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const tr = copy[language] ?? copy.uk;
  const [email] = useState(() => pendingRegistrationEmail());
  const mailbox = email ? registrationMailbox(email) : null;

  useEffect(() => {
    document.title = (email ? tr.title : tr.genericTitle) + ' — h00k.top';
  }, [email, tr.title, tr.genericTitle]);

  return (
    <div data-registration-confirmation-page className="flex min-h-[100dvh] flex-col bg-[#080e18] text-slate-100">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
        <a href="/" aria-label="h00k.top" className="flex items-center">
          <img src="/h00k-robot-logo.svg" alt="h00k" width={112} height={45} className="h-10 w-auto" />
        </a>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>{tr.language}</span>
          <select aria-label={tr.language} value={language}
            onChange={event => setLanguage(event.target.value as SupportedLanguage)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200">
            <option value="uk">UA</option>
            <option value="en">EN</option>
            <option value="pl">PL</option>
            <option value="ru">RU</option>
          </select>
        </label>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-5">
        <section aria-labelledby="registration-confirmation-heading"
          className="w-full max-w-lg rounded-3xl border border-cyan-500/20 bg-[#101928] px-6 py-9 text-center shadow-2xl shadow-black/30 sm:px-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
            <MailCheck className="h-8 w-8 text-emerald-300" aria-hidden="true" />
          </div>
          <h1 id="registration-confirmation-heading" className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {email ? tr.title : tr.genericTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{tr.subtitle}</p>
          {email ? (
            <p className="mt-5 text-sm text-slate-400">
              {tr.sent}
              <strong data-no-translate className="mt-1 block break-all font-semibold text-cyan-200">{email}</strong>
            </p>
          ) : <p className="mt-5 text-sm leading-relaxed text-slate-400">{tr.genericSent}</p>}
          {mailbox ? (
            <a href={mailbox.href} target="_blank" rel="noopener noreferrer"
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500 px-5 py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90">
              <span>{tr.action} {mailbox.name}</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : <p className="mt-6 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-300">
            {tr.otherMailbox}
          </p>}
          <p className="mt-5 text-xs leading-relaxed text-slate-400">{tr.spam}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{tr.account}</p>
          <a href="/" className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{tr.home}
          </a>
        </section>
      </main>
    </div>
  );
};
