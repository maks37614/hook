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
  }): string;
  remove(widgetId: string): void;
}
declare global {
  interface Window { turnstile?: TurnstileAPI; }
}

let loader: Promise<TurnstileAPI> | null = null;
function loadTurnstile(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise<TurnstileAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) :
      reject(new Error('Turnstile API failed to initialize'));
    script.onerror = () => {
      script.remove();
      reject(new Error('Turnstile script was blocked'));
    };
    document.head.appendChild(script);
  }).catch(error => {
    loader = null; // Allow retry if an extension or temporary outage blocked the script.
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
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  onChangeRef.current = onTokenChange;

  useEffect(() => {
    let active = true;
    let widgetId: string | null = null;
    let api: TurnstileAPI | null = null;
    onChangeRef.current(null);
    setError(false);
    void loadTurnstile().then(loaded => {
      if (!active || !containerRef.current) return;
      api = loaded;
      widgetId = loaded.render(containerRef.current, {
        sitekey: siteKey,
        action: AUTH_CAPTCHA_ACTION,
        theme: 'dark',
        size: 'flexible',
        language,
        callback: token => {
          if (active) { setError(false); onChangeRef.current(token); }
        },
        'expired-callback': () => { if (active) onChangeRef.current(null); },
        'error-callback': () => {
          if (active) { onChangeRef.current(null); setError(true); }
        },
        'timeout-callback': () => { if (active) onChangeRef.current(null); },
      });
    }).catch(() => { if (active) setError(true); });

    return () => {
      active = false;
      onChangeRef.current(null);
      if (api && widgetId !== null) api.remove(widgetId);
    };
  }, [siteKey, retry, language]);

  return (
    <div className="space-y-2" aria-label={translatePhrase(language, "Перевірка CAPTCHA")}>
      <div ref={containerRef} className="min-h-16 w-full" />
      {error && (
        <div className="flex items-center justify-between gap-2 text-xs text-amber-200">
          <span>{translatePhrase(language, "Не вдалося завантажити CAPTCHA. Перевірте з'єднання або блокувальник.")}</span>
          <button type="button" className="shrink-0 underline hover:text-white"
            onClick={() => setRetry(value => value + 1)}>{translatePhrase(language, 'Повторити')}</button>
        </div>
      )}
    </div>
  );
}
