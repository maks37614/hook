import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Info, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { SupportedLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'other';
const platforms: Platform[] = ['ios', 'android', 'windows', 'macos', 'linux', 'other'];
const tipKeyPrefix = 'h00k-install-guide-shown-for-user-v2';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function detectInstallPlatform(agent: string, navigatorPlatform = '', touches = 0): Platform {
  const ua = agent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || (navigatorPlatform === 'MacIntel' && touches > 1)) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('macintosh') || navigatorPlatform.startsWith('Mac')) return 'macos';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'other';
}

function currentDevice(): Platform {
  return typeof navigator === 'undefined' ? 'other'
    : detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

function isInstalled(): boolean {
  return typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

type Copy = {
  button: string; title: string; intro: string; tip: string; learn: string;
  installNow: string; close: string; installed: string; online: string;
  names: Record<Platform, string>; steps: Record<Platform, string[]>;
};

const messages: Record<SupportedLanguage, Copy> = {
  uk: {
    button: 'Як встановити', title: 'Встановити H00K',
    intro: 'Оберіть пристрій, щоб побачити інструкцію.',
    tip: 'H00K можна встановити як програму прямо із сайту.',
    learn: 'Дізнатися як', installNow: 'Встановити зараз', close: 'Закрити',
    installed: 'H00K уже відкритий як встановлена програма на цьому пристрої.',
    online: 'Графіки та сигнали працюють онлайн через h00k.top. Для них потрібен інтернет.',
    names: { ios: 'iPhone / iPad', android: 'Android', windows: 'Windows', macos: 'Mac', linux: 'Linux', other: 'Інший' },
    steps: {
      ios: ['Відкрийте h00k.top у Safari.', 'Натисніть «Поділитися» → «На початковий екран».', 'Увімкніть «Відкрити як вебпрограму» і натисніть «Додати».'],
      android: ['Відкрийте h00k.top у Chrome.', 'Виберіть ⋮ → «Встановити додаток» або «Додати на головний екран».', 'Підтвердьте встановлення.'],
      windows: ['Відкрийте h00k.top у Microsoft Edge або Chrome.', 'Знайдіть «Встановити» в адресному рядку або меню. В Edge: … → «Програми» → «Встановити цей сайт як програму».', 'Підтвердьте встановлення.'],
      macos: ['Відкрийте h00k.top у Safari на macOS Sonoma 14+ або в Chrome.', 'У Safari виберіть «Файл» → «Додати в Dock»; у Chrome — встановлення сайту через меню.', 'Підтвердьте додавання.'],
      linux: ['Відкрийте h00k.top у Chrome або Chromium.', 'Оберіть встановлення сайту в меню або адресному рядку, якщо ця функція доступна.', 'Підтвердьте встановлення або створіть ярлик сайту.'],
      other: ['Оберіть свою операційну систему вище.', 'Відкрийте h00k.top у відповідному браузері.', 'Якщо встановлення не підтримується, продовжуйте користуватися сайтом.'],
    },
  },
  en: {
    button: 'How to install', title: 'Install H00K',
    intro: 'Choose a device for step-by-step instructions.',
    tip: 'You can install H00K as an app directly from the website.',
    learn: 'Show me how', installNow: 'Install now', close: 'Close',
    installed: 'H00K is already running as an installed app on this device.',
    online: 'Charts and signals stay online through h00k.top and need an internet connection.',
    names: { ios: 'iPhone / iPad', android: 'Android', windows: 'Windows', macos: 'Mac', linux: 'Linux', other: 'Other' },
    steps: {
      ios: ['Open h00k.top in Safari.', 'Tap Share → Add to Home Screen.', 'Enable Open as Web App, then tap Add.'],
      android: ['Open h00k.top in Chrome.', 'Tap ⋮ → Install app or Add to Home screen.', 'Confirm installation.'],
      windows: ['Open h00k.top in Microsoft Edge or Chrome.', 'Choose Install in the address bar or browser menu. In Edge: … → Apps → Install this site as an app.', 'Confirm installation.'],
      macos: ['Open h00k.top in Safari on macOS Sonoma 14+ or Chrome.', 'In Safari choose File → Add to Dock; in Chrome use the browser install menu.', 'Confirm.'],
      linux: ['Open h00k.top in Chrome or Chromium.', 'Choose the site installation action in the menu or address bar if available.', 'Confirm or create a website shortcut.'],
      other: ['Choose your operating system above.', 'Open h00k.top in the supported browser.', 'If installation is unavailable, continue using the website.'],
    },
  },
  ru: {
    button: 'Как установить', title: 'Установить H00K',
    intro: 'Выберите устройство, чтобы увидеть инструкцию.',
    tip: 'H00K можно установить как приложение прямо с сайта.',
    learn: 'Как установить', installNow: 'Установить сейчас', close: 'Закрыть',
    installed: 'H00K уже работает как установленное приложение на этом устройстве.',
    online: 'Графики и сигналы работают онлайн через h00k.top. Требуется интернет.',
    names: { ios: 'iPhone / iPad', android: 'Android', windows: 'Windows', macos: 'Mac', linux: 'Linux', other: 'Другое' },
    steps: {
      ios: ['Откройте h00k.top в Safari.', 'Нажмите «Поделиться» → «На экран Домой».', 'Включите «Открывать как веб-приложение» и нажмите «Добавить».'],
      android: ['Откройте h00k.top в Chrome.', 'Нажмите ⋮ → «Установить приложение» или «Добавить на главный экран».', 'Подтвердите установку.'],
      windows: ['Откройте h00k.top в Microsoft Edge или Chrome.', 'Найдите «Установить» в адресной строке или меню. В Edge: … → «Приложения» → «Установить этот сайт как приложение».', 'Подтвердите установку.'],
      macos: ['Откройте h00k.top в Safari на macOS Sonoma 14+ или Chrome.', 'В Safari выберите «Файл» → «Добавить в Dock», в Chrome — установку сайта через меню.', 'Подтвердите.'],
      linux: ['Откройте h00k.top в Chrome или Chromium.', 'Выберите установку сайта в меню или адресной строке, если доступно.', 'Подтвердите или создайте ярлык.'],
      other: ['Выберите операционную систему выше.', 'Откройте h00k.top в соответствующем браузере.', 'Если установка недоступна, продолжайте пользоваться сайтом.'],
    },
  },
  pl: {
    button: 'Jak zainstalować', title: 'Zainstaluj H00K',
    intro: 'Wybierz urządzenie, aby zobaczyć instrukcję.',
    tip: 'Możesz zainstalować H00K jako aplikację bezpośrednio ze strony.',
    learn: 'Pokaż instrukcję', installNow: 'Zainstaluj teraz', close: 'Zamknij',
    installed: 'H00K działa już jako zainstalowana aplikacja na tym urządzeniu.',
    online: 'Wykresy i sygnały korzystają z h00k.top i wymagają internetu.',
    names: { ios: 'iPhone / iPad', android: 'Android', windows: 'Windows', macos: 'Mac', linux: 'Linux', other: 'Inne' },
    steps: {
      ios: ['Otwórz h00k.top w Safari.', 'Dotknij Udostępnij → Do ekranu początkowego.', 'Włącz Otwórz jako aplikację internetową i dotknij Dodaj.'],
      android: ['Otwórz h00k.top w Chrome.', 'Wybierz ⋮ → Zainstaluj aplikację lub Dodaj do ekranu głównego.', 'Potwierdź instalację.'],
      windows: ['Otwórz h00k.top w Microsoft Edge lub Chrome.', 'Wybierz Instaluj z paska adresu albo menu. W Edge: … → Aplikacje → Zainstaluj tę witrynę jako aplikację.', 'Potwierdź instalację.'],
      macos: ['Otwórz h00k.top w Safari na macOS Sonoma 14+ lub Chrome.', 'W Safari wybierz Plik → Dodaj do Docka; w Chrome skorzystaj z opcji instalacji witryny.', 'Potwierdź.'],
      linux: ['Otwórz h00k.top w Chrome lub Chromium.', 'Wybierz instalację witryny w menu lub na pasku adresu, jeśli dostępna.', 'Potwierdź lub utwórz skrót.'],
      other: ['Wybierz system operacyjny powyżej.', 'Otwórz h00k.top w odpowiedniej przeglądarce.', 'Jeśli instalacja jest niedostępna, nadal korzystaj z witryny.'],
    },
  },
};

interface InstallAppButtonProps {
  /** "tip" appears once after successful registration, never on each login. */
  variant?: 'button' | 'tip';
}

export function InstallAppButton({ variant = 'button' }: InstallAppButtonProps) {
  const { language } = useLanguage();
  const { user, profile, updateProfileData } = useAuth();
  const accountId = user?.uid;
  const [platform] = useState<Platform>(currentDevice);
  const [selected, setSelected] = useState<Platform>(currentDevice);
  const [installed, setInstalled] = useState(isInstalled);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const shownAccountRef = useRef<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const t = messages[language];

  useEffect(() => {
    // A missing flag belongs to an account registered before this feature and
    // must NOT become a new onboarding notice at every subsequent login.
    if (variant !== 'tip') return;
    if (!accountId || profile?.uid !== accountId) {
      setShowTip(false);
      return;
    }
    if (profile.installGuideTipShown !== false || installed || shownAccountRef.current === accountId) return;

    const key = `${tipKeyPrefix}:${accountId}`;
    try {
      if (localStorage.getItem(key) === '1') return;
      // Mark before presenting so a refresh or parallel profile reload cannot
      // display the same notice a second time.
      localStorage.setItem(key, '1');
    } catch { /* The profile flag remains authoritative across devices. */ }
    shownAccountRef.current = accountId;
    setShowTip(true);
    void updateProfileData({ installGuideTipShown: true })
      .catch(error => console.warn('[Install tip] Could not save first display to profile', error));
  }, [variant, accountId, profile?.uid, profile?.installGuideTipShown, installed, updateProfileData]);

  useEffect(() => {
    const onInstallable = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setOpen(false);
      setShowTip(false);
    };
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const elements = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const dismissTip = () => {
    setShowTip(false);
    if (accountId) {
      try { localStorage.setItem(`${tipKeyPrefix}:${accountId}`, '1'); } catch { /* optional */ }
    }
  };
  const showGuide = () => {
    setSelected(platform);
    setOpen(true);
    dismissTip();
  };
  const closeGuide = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const installNow = () => {
    if (!promptEvent || installed || selected !== platform) return;
    const toShow = promptEvent;
    setPromptEvent(null);
    // Browser installation request must start directly from the user gesture.
    void toShow.prompt().then(() => toShow.userChoice).catch(() => { /* manual steps stay visible */ });
  };

  return (
    <>
      {/* The permanent guide action is in Profile (or the guest sign-in dialog). */}
      {variant === 'button' && (
        <button
          ref={trigger} type="button" onClick={showGuide} aria-haspopup="dialog" aria-expanded={open}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <Download className="h-3.5 w-3.5" /><span>{t.button}</span>
        </button>
      )}

      {variant === 'tip' && showTip && !!accountId && !installed && (
        <aside className="fixed bottom-3 right-3 z-40 w-[min(340px,calc(100vw-24px))] rounded-xl border border-cyan-500/30 bg-slate-900 p-3 text-slate-100 shadow-2xl" aria-label={t.title}>
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <p className="flex-1 text-xs leading-5">{t.tip}</p>
            <button type="button" onClick={dismissTip} aria-label={t.close} className="rounded p-1 text-slate-300 hover:bg-slate-800"><X className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={showGuide} className="mt-2 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600">{t.learn}</button>
        </aside>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeGuide(); }}
        >
          <div
            ref={dialog} role="dialog" aria-modal="true" aria-labelledby="h00k-install-title"
            aria-describedby="h00k-install-intro"
            className="max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="h00k-install-title" className="text-base font-bold">{t.title}</h2>
                <p id="h00k-install-intro" className="mt-1 text-xs text-slate-300">{t.intro}</p>
              </div>
              <button ref={closeButton} type="button" onClick={closeGuide} aria-label={t.close} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label={t.title}>
              {platforms.map((device) => (
                <button
                  key={device} type="button" aria-pressed={selected === device} onClick={() => setSelected(device)}
                  className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ' +
                    (selected === device ? 'border-cyan-500 bg-cyan-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700')}
                >{t.names[device]}</button>
              ))}
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-200">
              {t.steps[selected].map((step) => <li key={step}>{step}</li>)}
            </ol>
            {installed && <p className="mt-4 rounded-lg bg-slate-800 p-2.5 text-xs text-cyan-200">{t.installed}</p>}
            {promptEvent && !installed && selected === platform && (
              <button type="button" onClick={installNow} className="mt-4 flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500">
                <Download className="h-4 w-4" />{t.installNow}
              </button>
            )}
            <p className="mt-4 border-t border-slate-700 pt-3 text-xs leading-5 text-slate-400">{t.online}</p>
          </div>
        </div>, document.body
      )}
    </>
  );
}
