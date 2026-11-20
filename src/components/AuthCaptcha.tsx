import { useEffect, useRef, useState } from 'react';
import { AUTH_CAPTCHA_ACTION } from '../utils/captchaAction';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';

interface TurnstileAPI {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: 'dark';
    size: 'flexible';
    language: 'uk' | 'en' | 'ru' | 'pl';
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
    'timeout-callback': () => void;
    'before-interactive-callback': () => void;
    'after-interactive-callback': () => void;
    'refresh-expired': 'auto';
    'refresh-timeout': 'auto';
  }): string;
  remove(widgetId: string): void;
}
declare global {
  interface Window { turnstile?: TurnstileAPI; }
}

const SCRIPT_TIMEOUT_MS = 10_000;
const CHALLENGE_NOTICE_MS = 15_000;

const feedback = {
  uk: {
    slow: 'Перевірка триває довше звичайного. Якщо вона зависла, спробуйте ще раз.',
    error: 'Не вдалося завершити CAPTCHA. Перевірте з’єднання або блокувальник.',
    retry: 'Повторити',
  },
  en: {
    slow: 'Verification is taking longer than usual. If it is stuck, try again.',
    error: 'Could not complete CAPTCHA. Check your connection or ad blocker.',
    retry: 'Retry',
  },
  pl: {
    slow: 'Weryfikacja trwa dłużej niż zwykle. Jeśli się zawiesiła, spróbuj ponownie.',
    error: 'Nie udało się ukończyć CAPTCHA. Sprawdź połączenie lub blokadę reklam.',
    retry: 'Ponów',
  },
  ru: {
    slow: 'Проверка длится дольше обычного. Если она зависла, попробуйте снова.',
    error: 'Не удалось завершить CAPTCHA. Проверьте соединение или блокировщик.',
    retry: 'Повторить',
  },
};

let loader: Promise<TurnstileAPI> | null = null;
function loadTurnstile(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise<TurnstileAPI>((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    const finish = (api?: TurnstileAPI, error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (api) resolve(api);
      else {
        script.remove();
        reject(error || new Error('Turnstile script unavailable'));
      }
    };
    const timeout = window.setTimeout(() => finish(undefined, new Error('Turnstile script timed out')), SCRIPT_TIMEOUT_MS);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => finish(window.turnstile, new Error('Turnstile API failed to initialize'));
    script.onerror = () => finish(undefined, new Error('Turnstile script was blocked'));
    document.head.appendChild(script);
  }).catch(error => {
    loader = null; // A later manual retry can load the script again.
    throw error;
  });
  return loader;
}

interface Props {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
}

export function AuthCaptcha({ siteKey, onTokenChange }: Props) {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onTokenChange);
  const [status, setStatus] = useState<'loading' | 'ready' | 'slow' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  onChangeRef.current = onTokenChange;

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    let widgetId: string | null = null;
    let api: TurnstileAPI | null = null;
    let noticeTimer: number | null = null;
    const clearNoticeTimer = () => {
      if (noticeTimer !== null) window.clearTimeout(noticeTimer);
      noticeTimer = null;
    };
    const startNoticeTimer = () => {
      clearNoticeTimer();
      noticeTimer = window.setTimeout(() => {
        if (active) setStatus(value => value === 'loading' ? 'slow' : value);
      }, CHALLENGE_NOTICE_MS);
    };
    onChangeRef.current(null);
    setStatus('loading');
    startNoticeTimer();
    void loadTurnstile().then(loaded => {
      if (!active || !container) return;
      api = loaded;
      widgetId = loaded.render(container, {
        sitekey: siteKey,
        action: AUTH_CAPTCHA_ACTION,
        theme: 'dark',
        size: 'flexible',
        language,
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
        callback: token => {
          if (!active) return;
          clearNoticeTimer();
          setStatus('ready');
          onChangeRef.current(token);
        },
        'expired-callback': () => {
          if (!active) return;
          onChangeRef.current(null);
          setStatus('loading');
          startNoticeTimer();
        },
        'error-callback': () => {
          if (!active) return;
          onChangeRef.current(null);
          clearNoticeTimer();
          setStatus('error');
        },
        'timeout-callback': () => {
          if (!active) return;
          onChangeRef.current(null);
          clearNoticeTimer();
          setStatus('error');
        },
        'before-interactive-callback': () => {
          // Do not warn while the visitor is solving an interactive challenge.
          if (!active) return;
          clearNoticeTimer();
          setStatus('ready');
        },
        'after-interactive-callback': () => {
          if (active) startNoticeTimer();
        },
      });
    }).catch(() => {
      if (!active) return;
      clearNoticeTimer();
      setStatus('error');
    });

    return () => {
      active = false;
      clearNoticeTimer();
      onChangeRef.current(null);
      if (api && widgetId !== null) {
        try { api.remove(widgetId); } catch { /* Widget may already have been removed. */ }
      }
      // Clear any partially rendered widget before a manual retry.
      container?.replaceChildren();
    };
  }, [siteKey, retry, language]);

  const messages = feedback[language] || feedback.uk;
  return (
    <div className="space-y-2" aria-label={translatePhrase(language, 'Перевірка CAPTCHA')}>
      <div ref={containerRef} className="min-h-16 w-full" />
      {(status === 'slow' || status === 'error') && (
        <div role="status" className="flex items-center justify-between gap-2 text-xs text-amber-200">
          <span>{status === 'slow' ? messages.slow : messages.error}</span>
          <button type="button" className="shrink-0 underline hover:text-white"
            onClick={() => setRetry(value => value + 1)}>{messages.retry}</button>
        </div>
      )}
    </div>
  );
}
