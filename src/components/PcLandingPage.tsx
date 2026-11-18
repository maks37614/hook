import React, { useMemo, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleHelp, ExternalLink, Globe2, Layers3, LayoutGrid, Link2, Maximize2,
  Monitor, MousePointer2, MoveHorizontal, PanelsTopLeft, Search, Settings2,
  ShieldCheck, Sparkles, WandSparkles, Zap,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Public file supplied for the PC download page. Google Drive displays a file
// page first, where visitors can choose Download; this is not a direct .exe URL.
const GOOGLE_DRIVE_INSTALLER = 'https://drive.google.com/file/d/1Pfif8g7d8ginmHbklMtUffKHbuzo_F03/view?usp=sharing';
const GITHUB_BUILDS = 'https://github.com/maks37614/h00k/actions/workflows/h00k-desktop-windows.yml';

const COPY = {
  uk: {
    eyebrow: 'Програма для Windows 10 / 11',
    heroTitle: 'h00k Desktop',
    heroText: 'Ваш робочий простір трейдера на комп’ютері. Скрінер, графіки та пошук монет поруч із торговими терміналами — з адаптивним розташуванням вікон і локальними налаштуваннями.',
    download: 'Завантажити h00k Desktop', see: 'Переглянути можливості',
    downloadHint: 'Windows 10 / 11 · 64-bit · Українська, English, Polski, Русский',
    sourceHint: 'Посилання відкриває файл у Google Drive. На сторінці файлу натисніть «Завантажити».',
    preview: 'Демонстрація інтерфейсу', multiChart: 'Мультиграфіки', featuresHeading: 'Що дає h00k Desktop',
    featuresIntro: 'Інструменти h00k у форматі окремого застосунку — для швидкої роботи разом з іншими програмами.',
    features: [
      ['Локальний робочий простір', 'Налаштування прикріплення, розміри та позиції панелей зберігаються на вашому ПК.'],
      ['Швидкий пошук монет', 'Знаходьте потрібний тикер у скрінері й відкривайте його графік без зайвих переходів.'],
      ['Передавання тикерів', 'Використовуйте наявну локальну інтеграцію з MetaScalp і Tiger.Trade для передавання символів.'],
      ['Мультивіконний режим', 'Розташовуйте кілька панелей h00k поруч з різними терміналами та на кількох моніторах.'],
      ['Гнучке прикріплення', 'Увесь сайт, вибрані розділи, плаваючі панелі або незалежні вікна — під ваш сценарій.'],
      ['Швидкий старт', 'Встановлення, вибір мови та покроковий Quick Start з налаштуванням терміналів.'],
    ],
    dockingTitle: 'Адаптація до торгових терміналів',
    dockingIntro: 'h00k Desktop розміщує власні вікна поруч із вікном термінала. Підлаштовується під його рух і зміну розміру, не вбудовуючись у сторонню програму.',
    attachLabel: 'Оберіть термінал', attachModes: 'Режими розташування',
    attachModeItems: ['Автоматично — вільна ділянка', 'Праворуч / ліворуч', 'Зверху / знизу', 'Окреме плаваюче вікно'],
    attachDetails: [
      'Пошук вікна термінала або вибір вручну',
      'Автоприкріплення, відкріплення та слідування за вікном',
      'Окремі профілі та розміри для кожного термінала',
      'Можливість роботи на кількох моніторах',
    ],
    supportNote: 'Важливо: до Vataga підтримується прикріплення вікна. Автоматичне передавання тикерів до Vataga поки не реалізоване.',
    linkageTitle: 'Швидка локальна лінковка монет',
    linkageText: 'Знайдіть монету в h00k, відкрийте графік і передайте символ у підключений термінал через підтримувану інтеграцію. Це допомагає зменшити кількість ручних дій.',
    linkageSteps: ['Знайдіть потрібну монету', 'Перегляньте графік і сигнал', 'Передайте тикер у MetaScalp або Tiger.Trade'],
    galleryTitle: 'Подивіться, як працює застосунок',
    galleryIntro: 'Приклади інтерфейсу на основі вікон інсталятора, Quick Start, налаштувань прикріплення та Термінала.',
    galleryTabs: ['Встановлення', 'Швидкий старт', 'Прикріплення', 'Графіки'],
    galleryDescriptions: [
      'Просте та швидке встановлення…',
      'Три прості кроки для першого запуску.',
      'Налаштування режиму, позиції та поведінки вікон.',
      'Кілька графіків з керуванням монетами в одній сітці.',
    ],
    demoDisclaimer: 'Схематична демонстрація — не поточні ринкові дані',
    howTitle: 'Як почати роботу',
    howSteps: [
      ['Встановлення', 'Завантажте збірку для Windows 10 або 11 та встановіть застосунок.'],
      ['Запустіть термінал', 'Відкрийте MetaScalp, Tiger.Trade або Vataga.'],
      ['Налаштуйте прикріплення', 'Оберіть вікно, режим і сторону розташування. Можна запустити автоматичний пошук.'],
    ],
    useCasesTitle: 'Один простір для різних сценаріїв',
    useCases: [
      ['Скальпінг', 'Швидкий пошук тикерів, графіки та передавання символів без постійного перемикання між програмами.'],
      ['Кілька моніторів', 'Розміщуйте h00k біля терміналів та зберігайте положення робочих панелей.'],
      ['Кілька терміналів', 'Вибирайте власний профіль MetaScalp, Tiger.Trade чи Vataga для кожного робочого місця.'],
    ],
    finalTitle: 'h00k Desktop — поруч із вашим терміналом',
    finalText: 'Скрінер і графіки h00k.top у гнучкому робочому просторі для Windows. Почніть з інсталятора та Quick Start.',
    secure: 'Для роботи застосунку не потрібні біржові API-ключі.',
    releaseTitle: 'Альтернативне завантаження',
    releaseHelp: 'Якщо Google Drive недоступний, відкрийте останню успішну збірку h00k Desktop Windows у GitHub Actions → Artifacts.',
    releaseLink: 'Відкрити GitHub Actions',
    noAutotrade: 'Застосунок не виконує угод автоматично.',
    terminalPreview: 'Торговий термінал',
    dockPreview: 'Панель h00k',
    chooseWindow: 'Вибір вікна',
    installFolder: 'Папка встановлення',
    installButton: 'Встановити',
    startButton: 'Запустити h00k',
    position: 'Позиція',
    auto: 'Автоматично',
    linkStatus: 'Передавання тикерів MetaScalp / Tiger.Trade',
  },
  en: {
    eyebrow: 'Windows 10 / 11 desktop app',
    heroTitle: 'h00k Desktop',
    heroText: 'Your trading workspace on the computer. Screener, charts and coin search alongside your trading terminals — with adaptive window placement and local settings.',
    download: 'Download h00k Desktop', see: 'Explore features',
    downloadHint: 'Windows 10 / 11 · 64-bit · Українська, English, Polski, Русский',
    sourceHint: 'The link opens a file on Google Drive. Choose Download on the file page to save it.',
    preview: 'Interface preview', multiChart: 'Multi-chart workspace', featuresHeading: 'What h00k Desktop offers',
    featuresIntro: 'Bring h00k tools into a dedicated desktop application that works alongside other software.',
    features: [
      ['Local workspace', 'Docking settings, panel sizes and positions are stored on your computer.'],
      ['Fast coin search', 'Find a ticker in the screener and open its chart with fewer steps.'],
      ['Send tickers', 'Use existing local MetaScalp and Tiger.Trade integrations to send symbols.'],
      ['Multi-window mode', 'Arrange several h00k panels alongside terminals and across multiple screens.'],
      ['Flexible docking', 'The full site, selected sections, floating panels or independent windows — your choice.'],
      ['Quick setup', 'Installer, language selection and step-by-step Quick Start for terminal setup.'],
    ],
    dockingTitle: 'Adapts to trading terminal windows',
    dockingIntro: 'h00k Desktop positions its own windows next to a trading terminal. It follows window movement and resizing without embedding into third-party software.',
    attachLabel: 'Select terminal', attachModes: 'Placement modes',
    attachModeItems: ['Automatic — available space', 'Right / left', 'Above / below', 'Separate floating window'],
    attachDetails: ['Find a terminal window or select it manually', 'Auto-attach, detach and follow window', 'Separate saved profiles and sizes per terminal', 'Multi-monitor support'],
    supportNote: 'Note: Vataga supports window docking. Automatic ticker transfer to Vataga is not implemented yet.',
    linkageTitle: 'Fast local ticker linking',
    linkageText: 'Find a coin in h00k, open a chart and send its symbol to a connected terminal using a supported integration. Fewer manual actions.',
    linkageSteps: ['Find a coin', 'Inspect the chart and signal', 'Send to MetaScalp or Tiger.Trade'],
    galleryTitle: 'See the application in action',
    galleryIntro: 'Interface examples based on the installer, Quick Start, docking settings and Terminal windows.',
    galleryTabs: ['Installer', 'Quick Start', 'Docking', 'Charts'],
    galleryDescriptions: ['Simple and quick installation…', 'Three simple first-launch steps.', 'Control docking mode, position and window behavior.', 'Manage multiple charts in one grid.'],
    demoDisclaimer: 'Illustrative preview — not live market data',
    howTitle: 'Getting started',
    howSteps: [
      ['Installation', 'Download a Windows 10 or 11 build and install the application.'],
      ['Start a terminal', 'Open MetaScalp, Tiger.Trade or Vataga.'],
      ['Configure docking', 'Choose a window, mode and side. Automatic window discovery is also available.'],
    ],
    useCasesTitle: 'One workspace, different workflows',
    useCases: [
      ['Scalping', 'Find tickers, inspect charts and send symbols with less app switching.'],
      ['Multiple monitors', 'Keep h00k alongside terminals and restore saved panel positions.'],
      ['Multiple terminals', 'Choose individual MetaScalp, Tiger.Trade and Vataga profiles for your workspaces.'],
    ],
    finalTitle: 'h00k Desktop — beside your terminal',
    finalText: 'The h00k.top screener and charts in a flexible Windows workspace. Start with the installer and Quick Start.',
    secure: 'No exchange API keys are required to use the application.',
    releaseTitle: 'Alternative download',
    releaseHelp: 'If Google Drive is unavailable, open the latest successful h00k Desktop Windows build in GitHub Actions → Artifacts.',
    releaseLink: 'Open GitHub Actions',
    noAutotrade: 'The application does not place trades automatically.',
    terminalPreview: 'Trading terminal', dockPreview: 'h00k panel', chooseWindow: 'Choose window',
    installFolder: 'Installation directory', installButton: 'Install', startButton: 'Launch h00k',
    position: 'Position', auto: 'Automatic',
    linkStatus: 'MetaScalp / Tiger.Trade ticker transfer',
  },
  pl: {
    eyebrow: 'Aplikacja na Windows 10 / 11',
    heroTitle: 'h00k Desktop',
    heroText: 'Twoja przestrzeń pracy tradera na komputerze. Screener, wykresy i wyszukiwanie monet obok terminali — z adaptacyjnym układem okien i ustawieniami lokalnymi.',
    download: 'Pobierz h00k Desktop', see: 'Poznaj funkcje',
    downloadHint: 'Windows 10 / 11 · 64-bit · Українська, English, Polski, Русский',
    sourceHint: 'Link otwiera plik w Google Drive. Aby go pobrać, wybierz Pobierz na stronie pliku.',
    preview: 'Podgląd interfejsu', multiChart: 'Wiele wykresów', featuresHeading: 'Co oferuje h00k Desktop',
    featuresIntro: 'Narzędzia h00k w osobnej aplikacji, wygodnej do pracy z innym oprogramowaniem.',
    features: [
      ['Lokalna przestrzeń robocza', 'Ustawienia dokowania, rozmiary i pozycje paneli są zapisywane lokalnie.'],
      ['Szybkie wyszukiwanie monet', 'Znajdź ticker w screenerze i otwórz jego wykres bez zbędnych kroków.'],
      ['Przesyłanie tickerów', 'Korzystaj z istniejącej integracji lokalnej z MetaScalp i Tiger.Trade.'],
      ['Tryb wielu okien', 'Układaj panele h00k obok terminali na wielu monitorach.'],
      ['Elastyczne dokowanie', 'Cała witryna, wybrane sekcje, panele pływające lub osobne okna.'],
      ['Szybki start', 'Instalator, wybór języka i instrukcja Quick Start krok po kroku.'],
    ],
    dockingTitle: 'Dopasowanie do okien terminali',
    dockingIntro: 'h00k Desktop umieszcza własne okna obok terminala oraz podąża za jego zmianami położenia i rozmiaru. Nie osadza się wewnątrz aplikacji zewnętrznej.',
    attachLabel: 'Wybierz terminal', attachModes: 'Tryby położenia',
    attachModeItems: ['Automatycznie — wolne miejsce', 'Prawo / lewo', 'Góra / dół', 'Osobne okno pływające'],
    attachDetails: ['Wykrywanie okna lub ręczny wybór', 'Automatyczne dokowanie, odłączanie i podążanie za oknem', 'Osobne profile i rozmiary dla terminali', 'Obsługa wielu monitorów'],
    supportNote: 'Uwaga: Vataga obsługuje dokowanie okna, ale automatyczne wysyłanie tickerów do Vataga nie jest jeszcze dostępne.',
    linkageTitle: 'Szybkie lokalne przekazywanie tickerów',
    linkageText: 'Znajdź monetę w h00k, otwórz wykres i prześlij symbol do terminala za pomocą obsługiwanej integracji.',
    linkageSteps: ['Znajdź monetę', 'Sprawdź wykres i sygnał', 'Prześlij do MetaScalp lub Tiger.Trade'],
    galleryTitle: 'Zobacz aplikację',
    galleryIntro: 'Przykładowe interfejsy instalatora, Quick Start, dokowania i terminala.',
    galleryTabs: ['Instalacja', 'Quick Start', 'Dokowanie', 'Wykresy'],
    galleryDescriptions: ['Prosta i szybka instalacja…', 'Trzy kroki po pierwszym uruchomieniu.', 'Ustaw tryb, pozycję i zachowanie okien.', 'Zarządzaj wieloma wykresami w siatce.'],
    demoDisclaimer: 'Podgląd poglądowy — nie są to dane rynkowe na żywo',
    howTitle: 'Jak zacząć',
    howSteps: [
      ['Instalacja', 'Pobierz wersję dla Windows 10 lub 11 i zainstaluj aplikację.'],
      ['Uruchom terminal', 'Otwórz MetaScalp, Tiger.Trade lub Vataga.'],
      ['Skonfiguruj dokowanie', 'Wybierz okno, tryb i stronę. Możesz też wyszukać okno automatycznie.'],
    ],
    useCasesTitle: 'Jedna przestrzeń, różne zastosowania',
    useCases: [
      ['Scalping', 'Szybkie wyszukiwanie, wykresy i wysyłanie tickerów bez ciągłego przełączania.'],
      ['Wiele monitorów', 'Ustaw h00k obok terminali i przywracaj położenie paneli.'],
      ['Wiele terminali', 'Osobne profile dla MetaScalp, Tiger.Trade i Vataga.'],
    ],
    finalTitle: 'h00k Desktop — obok Twojego terminala',
    finalText: 'Screener i wykresy h00k.top w elastycznym środowisku Windows. Zacznij od instalatora i Quick Start.',
    secure: 'Aplikacja nie wymaga kluczy API giełd.',
    releaseTitle: 'Alternatywne pobieranie',
    releaseHelp: 'Jeśli Google Drive jest niedostępny, otwórz ostatnią udaną kompilację h00k Desktop Windows w GitHub Actions → Artifacts.',
    releaseLink: 'Otwórz GitHub Actions',
    noAutotrade: 'Aplikacja nie zawiera automatycznego składania zleceń.',
    terminalPreview: 'Terminal handlowy', dockPreview: 'Panel h00k', chooseWindow: 'Wybór okna',
    installFolder: 'Folder instalacji', installButton: 'Instaluj', startButton: 'Uruchom h00k',
    position: 'Pozycja', auto: 'Automatycznie', linkStatus: 'Przekazywanie tickerów MetaScalp / Tiger.Trade',
  },
  ru: {
    eyebrow: 'Приложение для Windows 10 / 11',
    heroTitle: 'h00k Desktop',
    heroText: 'Ваше торговое пространство на компьютере. Скринер, графики и поиск монет рядом с торговыми терминалами — с адаптивным расположением окон и локальными настройками.',
    download: 'Скачать h00k Desktop', see: 'Посмотреть возможности',
    downloadHint: 'Windows 10 / 11 · 64-bit · Українська, English, Polski, Русский',
    sourceHint: 'Ссылка открывает файл в Google Drive. На странице файла нажмите «Скачать».',
    preview: 'Пример интерфейса', multiChart: 'Мультиграфики', featuresHeading: 'Возможности h00k Desktop',
    featuresIntro: 'Инструменты h00k в отдельной программе для удобной работы с другими приложениями.',
    features: [
      ['Локальное рабочее пространство', 'Настройки прикрепления, размеры и положение панелей сохраняются на ПК.'],
      ['Быстрый поиск монет', 'Находите тикер в скринере и открывайте график без лишних действий.'],
      ['Передача тикеров', 'Используйте существующую локальную интеграцию с MetaScalp и Tiger.Trade.'],
      ['Мультиоконный режим', 'Размещайте панели h00k рядом с терминалами на разных мониторах.'],
      ['Гибкое прикрепление', 'Весь сайт, отдельные разделы, плавающие панели или независимые окна.'],
      ['Быстрый старт', 'Установщик, выбор языка и пошаговый Quick Start.'],
    ],
    dockingTitle: 'Адаптация к окнам терминалов',
    dockingIntro: 'h00k Desktop размещает свои окна рядом с терминалом и следует за его перемещением и изменением размера, не встраиваясь в стороннюю программу.',
    attachLabel: 'Выберите терминал', attachModes: 'Режимы размещения',
    attachModeItems: ['Автоматически — свободное место', 'Справа / слева', 'Сверху / снизу', 'Отдельное плавающее окно'],
    attachDetails: ['Поиск окна или ручной выбор', 'Автоприкрепление, открепление и слежение за окном', 'Отдельные профили и размеры для терминалов', 'Поддержка нескольких мониторов'],
    supportNote: 'Важно: прикрепление окна к Vataga поддерживается, но автоматическая передача тикеров в Vataga пока не реализована.',
    linkageTitle: 'Быстрая локальная передача тикеров',
    linkageText: 'Найдите монету в h00k, откройте график и передайте символ в терминал через поддерживаемую интеграцию.',
    linkageSteps: ['Найдите монету', 'Посмотрите график и сигнал', 'Передайте в MetaScalp или Tiger.Trade'],
    galleryTitle: 'Посмотрите приложение',
    galleryIntro: 'Примеры интерфейса установщика, Quick Start, прикрепления и терминала.',
    galleryTabs: ['Установка', 'Quick Start', 'Прикрепление', 'Графики'],
    galleryDescriptions: ['Простая и быстрая установка…', 'Три шага первого запуска.', 'Режим, позиция и поведение окон.', 'Несколько графиков в одной сетке.'],
    demoDisclaimer: 'Иллюстрация — не рыночные данные в реальном времени',
    howTitle: 'Как начать',
    howSteps: [
      ['Установка', 'Скачайте сборку для Windows 10 или 11 и установите приложение.'],
      ['Запустите терминал', 'Откройте MetaScalp, Tiger.Trade или Vataga.'],
      ['Настройте прикрепление', 'Выберите окно, режим и сторону. Есть автоматический поиск.'],
    ],
    useCasesTitle: 'Одно пространство для разных задач',
    useCases: [
      ['Скальпинг', 'Быстрый поиск, графики и отправка тикеров без постоянного переключения между приложениями.'],
      ['Несколько мониторов', 'Размещайте h00k рядом с терминалами и сохраняйте положения панелей.'],
      ['Несколько терминалов', 'Отдельные профили для MetaScalp, Tiger.Trade и Vataga.'],
    ],
    finalTitle: 'h00k Desktop — рядом с вашим терминалом',
    finalText: 'Скринер и графики h00k.top в гибком рабочем пространстве Windows. Начните с установщика и Quick Start.',
    secure: 'Для приложения не нужны биржевые API-ключи.',
    releaseTitle: 'Альтернативная загрузка',
    releaseHelp: 'Если Google Drive недоступен, откройте последнюю успешную сборку h00k Desktop Windows в GitHub Actions → Artifacts.',
    releaseLink: 'Открыть GitHub Actions',
    noAutotrade: 'Приложение не совершает сделки автоматически.',
    terminalPreview: 'Торговый терминал', dockPreview: 'Панель h00k', chooseWindow: 'Выбор окна',
    installFolder: 'Папка установки', installButton: 'Установить', startButton: 'Запустить h00k',
    position: 'Позиция', auto: 'Автоматически', linkStatus: 'Передача тикеров MetaScalp / Tiger.Trade',
  },
} as const;

const featureIcons = [Monitor, Search, Link2, LayoutGrid, Layers3, Zap] as const;
const caseIcons = [Zap, Monitor, PanelsTopLeft] as const;
const SYMBOLS = ['INJUSDT', 'AIAUSDT', 'LABUSDT', 'MARSCoinUSDT', 'TRIAUSDT', 'HOMEUSDT', 'ONEUSDT', 'KOMAUSDT'];

function MiniChart({ index, compact = false }: { index: number; compact?: boolean }) {
  const points = useMemo(() => Array.from({ length: 65 }, (_, x) => {
    const drift = Math.sin(x * (0.18 + index * 0.007) + index) * 19 + Math.sin(x * 0.63 + index * 2) * 8;
    const trend = (index % 3 === 0 ? -0.3 : index % 3 === 1 ? 0.25 : 0) * x;
    return `${(x * 3.7).toFixed(1)},${Math.max(10, Math.min(88, 52 + drift + trend)).toFixed(1)}`;
  }).join(' '), [index]);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/70 bg-[#0a1423]">
      <div className="flex items-center justify-between gap-1 border-b border-slate-700/50 px-2 py-1.5 text-[9px] font-bold tracking-wide text-slate-400">
        <span data-no-translate className="truncate">{SYMBOLS[index % SYMBOLS.length]}</span><span className="shrink-0 text-cyan-500/80">BINANCE <span className="text-slate-500">PERP</span></span>
      </div>
      <svg viewBox="0 0 240 104" className={`block w-full ${compact ? 'h-16' : 'h-24 sm:h-28'}`} preserveAspectRatio="none" role="img" aria-label="Chart demonstration">
        <path d="M0 26 H240 M0 53 H240 M0 79 H240" stroke="#243344" strokeWidth=".65" fill="none" />
        <polyline points={points} stroke={index % 2 === 0 ? '#21e2bd' : '#06b6d4'} strokeWidth="1.6" fill="none" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: 32 }, (_, k) => <rect key={k} x={k * 7.4} y={94 - ((k * 17 + index * 9) % 24)} width="2.4" height={((k * 17 + index * 9) % 24) + 6} fill={k % 3 ? '#19ce98' : '#fb4d6a'} opacity=".65" />)}
      </svg>
      {!compact && <div className="flex justify-between border-t border-slate-700/40 px-2 py-1 text-[8px] text-slate-500"><span>Vol 24h</span><span>1m · 5m · 1h</span></div>}
    </div>
  );
}

function ChartWindow({ small = false }: { small?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-cyan-400/30 bg-[#060d1d] shadow-[0_16px_65px_rgba(0,0,0,.38)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/70 bg-slate-950 px-3 py-2">
        <span className="text-[10px] font-bold text-cyan-300">h00k <span className="ml-2 font-normal text-slate-400">TERMINAL</span></span>
        <div className="flex items-center gap-1.5 text-[9px] text-slate-400"><span className="rounded bg-cyan-950/70 px-2 py-1 text-cyan-200">4×</span><span className="rounded bg-slate-800 px-2 py-1">1m</span><span className="rounded bg-slate-800 px-2 py-1">1h</span><Settings2 size={12} /></div>
      </div>
      <div className={`grid ${small ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-2 p-2.5`}>
        {SYMBOLS.slice(0, small ? 4 : 8).map((symbol, index) => <MiniChart key={symbol} index={index} compact={small} />)}
      </div>
    </div>
  );
}

function WindowPreview({ terminal }: { terminal: string }) {
  return (
    <div className="relative mx-auto flex min-h-[225px] w-full max-w-[600px] items-center px-1 py-6 sm:min-h-[300px]">
      <div className="relative ml-auto w-[66%] overflow-hidden rounded-lg border border-slate-600/80 bg-slate-950 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-700 bg-[#111b2b] px-3 py-2 text-[10px] text-slate-300"><Monitor size={12} /> {terminal}<span className="ml-auto">− □ ×</span></div>
        <div className="grid grid-cols-2 gap-1.5 p-2"><MiniChart index={0} compact /><MiniChart index={5} compact /><MiniChart index={2} compact /><MiniChart index={3} compact /></div>
      </div>
      <div className="absolute left-0 top-[20%] w-[52%] overflow-hidden rounded-lg border border-cyan-400/70 bg-[#091c29] shadow-[0_0_35px_rgba(6,182,212,.2)]">
        <div className="flex items-center justify-between gap-2 border-b border-cyan-400/30 px-3 py-2 text-[10px]"><b className="text-cyan-300">h00k Desktop</b><Settings2 size={13} className="text-cyan-300" /></div>
        <div className="space-y-2 p-3">
          <div className="h-2 w-2/3 rounded bg-cyan-500/50" /><div className="h-2 w-full rounded bg-slate-700" />
          <div className="grid grid-cols-2 gap-1.5"><div className="h-8 rounded border border-cyan-500/50 bg-cyan-900/25" /><div className="h-8 rounded border border-slate-600 bg-slate-800/60" /></div>
          <div className="flex items-center gap-1 rounded border border-cyan-500/30 bg-slate-950 px-2 py-2 text-[9px] text-cyan-200"><CheckCircle2 size={11} /> Auto attach</div>
        </div>
      </div>
      <div className="absolute bottom-1 right-[17%] rounded-full border border-cyan-500/50 bg-[#091626] px-3 py-1.5 text-[9px] font-bold text-cyan-200 shadow-[0_0_25px_rgba(34,211,238,.16)]">Follow window · Auto attach</div>
    </div>
  );
}

function SetupPreview({ mode, c }: { mode: number; c: typeof COPY[keyof typeof COPY] }) {
  if (mode === 3) return <ChartWindow />;
  if (mode === 2) return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-cyan-500/35 bg-[#061523] p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between border-b border-slate-700 pb-3"><b className="text-xl text-cyan-300">h00k</b><span className="text-xs text-slate-400">Docking settings</span></div>
      <div className="mb-4 text-sm font-semibold text-white">1. {c.attachLabel}</div>
      <div className="mb-6 grid grid-cols-3 gap-2">{['MetaScalp', 'Tiger.Trade', 'Vataga'].map((s, i) => <div key={s} className={`rounded-lg border px-2 py-3 text-center text-[11px] sm:text-sm ${i === 0 ? 'border-cyan-400/80 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{s}</div>)}</div>
      <div className="mb-3 text-sm font-semibold text-white">2. {c.attachModes}</div>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">{['Full h00k', 'Sections', 'Floating', 'Multi-window'].map((s, i) => <div key={s} className={`rounded-lg border px-2 py-3 text-center text-[10px] sm:text-xs ${i === 0 ? 'border-cyan-400/80 bg-cyan-500/15 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{s}</div>)}</div>
      <div className="mb-3 text-sm font-semibold text-white">3. {c.position}</div>
      <div className="rounded-lg border border-cyan-400/50 bg-cyan-950/40 py-3 text-center text-xs text-cyan-200">{c.auto} · Right · Left · Top · Bottom</div>
    </div>
  );
  if (mode === 1) return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-cyan-500/30 bg-[#061523] p-5 sm:p-8">
      <div className="mb-5 flex justify-between border-b border-slate-700 pb-4"><b className="text-xl text-cyan-300">h00k <span className="text-xs font-normal tracking-widest text-slate-400">QUICK START</span></b><span className="text-xs text-slate-400">1 / 3</span></div>
      {c.howSteps.map(([title, desc], i) => <div key={title} className="mb-3 flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-900/70 p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-900/55 font-bold text-cyan-300">{i + 1}</span><div className="text-sm text-white"><strong>{title}</strong><p className="mt-1 text-xs font-normal text-slate-400">{desc}</p></div></div>)}
      <div className="mt-5 flex justify-end"><span className="rounded-md bg-cyan-400 px-5 py-2 text-xs font-bold text-slate-950">{c.startButton}</span></div>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-cyan-500/35 bg-[#061422] shadow-[0_0_30px_rgba(6,182,212,.09)]">
      <div className="flex items-center justify-between border-b border-slate-700 bg-[#071b2a] px-4 py-3"><span className="text-xs font-bold tracking-widest text-cyan-300">h00k <span className="ml-2 font-normal text-slate-400">DESKTOP SETUP</span></span><span className="text-slate-400">×</span></div>
      <div className="px-5 py-8 sm:px-8">
        <img src="/h00k-robot-logo.svg" alt="h00k" className="mx-auto h-20 w-auto drop-shadow-[0_0_18px_rgba(34,211,238,.45)]" />
        <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full w-[72%] rounded-full bg-cyan-400" /></div>
        <div className="mt-8 rounded-lg border border-slate-700 bg-slate-950/70 p-4">
          <p className="mb-2 text-sm font-semibold text-white">{c.installFolder}</p>
          <div className="overflow-hidden rounded border border-slate-600 bg-[#091b27] px-3 py-3 text-[10px] text-slate-400 sm:text-xs">C:\\Users\\User\\AppData\\Local\\Programs\\h00k Desktop</div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-300"><Check size={15} className="rounded bg-cyan-400 text-slate-950" /> Desktop shortcut</div>
        </div>
        <div className="mt-6 flex justify-end"><span className="rounded-lg bg-cyan-400 px-6 py-2 text-sm font-bold text-slate-950">{c.installButton}</span></div>
      </div>
    </div>
  );
}

export const PcLandingPage: React.FC = () => {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.uk;
  const [selectedTerminal, setSelectedTerminal] = useState(0);
  const [selectedPreview, setSelectedPreview] = useState(0);
  const terminals = ['MetaScalp', 'Tiger.Trade', 'Vataga'];
  const downloadUrl = GOOGLE_DRIVE_INSTALLER;
  const featureDescriptions = [...c.features];
  const scrollToGallery = () => document.getElementById('pc-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div data-no-translate className="pc-landing relative isolate w-full overflow-x-hidden bg-[#070d1a] text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(ellipse_at_78%_12%,rgba(8,145,178,.22),transparent_55%),radial-gradient(ellipse_at_15%_34%,rgba(5,150,105,.09),transparent_50%)]" />
      <div className="mx-auto max-w-[1320px] px-4 pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-14">
        <section className="grid items-center gap-9 pb-16 lg:grid-cols-[.92fr_1.08fr] lg:gap-12 lg:pb-24">
          <div className="flex min-w-0 flex-col items-center text-center">
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-[64px] lg:leading-[1.09]"><span className="text-cyan-300">h00k</span> Desktop</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{c.heroText}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-[#03131d] shadow-[0_0_25px_rgba(34,211,238,.22)] transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-100"><ArrowDownToLine size={18} />{c.download}<ExternalLink size={13} /></a>
              <button type="button" onClick={scrollToGallery} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-cyan-500/40 bg-slate-900/70 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-950/45"><BookOpen size={17} />{c.see}<ArrowRight size={15} /></button>
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">{c.downloadHint}</p>
            <p className="mt-2 max-w-2xl text-center text-[11px] leading-5 text-slate-500">{c.sourceHint}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-400"><span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-cyan-400" /> MetaScalp</span><span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-cyan-400" /> Tiger.Trade</span><span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-cyan-400" /> Vataga (Docking)</span></div>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="relative rotate-0 rounded-2xl border border-cyan-400/40 bg-[#0b1928]/85 p-2 shadow-[0_25px_80px_rgba(0,0,0,.55),0_0_40px_rgba(6,182,212,.12)] sm:p-3"><ChartWindow /><div className="absolute -bottom-4 left-5 flex items-center gap-2 rounded-lg border border-cyan-400/50 bg-[#082537] px-3 py-2 text-[10px] font-bold text-cyan-200 shadow-xl sm:left-8"><Sparkles size={13} /> {c.multiChart}</div></div>
          </div>
        </section>

        <section className="border-t border-slate-800/80 py-14 lg:py-20">
          <div className="mb-8"><h2 className="text-2xl font-extrabold text-white sm:text-3xl">{c.featuresHeading}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{c.featuresIntro}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featureDescriptions.map(([title, description], index) => {
              const Icon = featureIcons[index];
              return <article key={title} className="group rounded-2xl border border-cyan-900/60 bg-gradient-to-br from-[#0d2532] to-[#0b1624] p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40"><div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 group-hover:shadow-[0_0_18px_rgba(34,211,238,.12)]"><Icon size={23} /></div><h3 className="text-sm font-bold leading-snug text-white sm:text-base">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-400 sm:text-sm">{description}</p></article>;
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-900/60 bg-gradient-to-br from-[#091e2c] via-[#091523] to-[#07101d] p-5 sm:p-7 lg:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[.86fr_1.14fr]">
            <div>
              <span className="text-xs font-bold uppercase tracking-[.2em] text-cyan-400">DOCKING · WINDOWS</span>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight text-white sm:text-3xl">{c.dockingTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{c.dockingIntro}</p>
              <p className="mt-7 text-xs font-bold uppercase tracking-wide text-slate-400">{c.attachLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">{terminals.map((terminal, index) => <button key={terminal} type="button" aria-pressed={selectedTerminal === index} onClick={() => setSelectedTerminal(index)} className={`rounded-lg border px-4 py-2 text-xs font-bold transition sm:text-sm ${selectedTerminal === index ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-700'}`}>{terminal}</button>)}</div>
              <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{c.attachDetails.map(t => <div key={t} className="flex items-start gap-2 text-xs leading-5 text-slate-300"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-cyan-400" />{t}</div>)}</div>
            </div>
            <div><WindowPreview terminal={terminals[selectedTerminal]} /></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-700/60 pt-5">{c.attachModeItems.map(s => <span key={s} className="rounded-full border border-cyan-900/75 bg-cyan-950/30 px-3 py-2 text-[11px] text-cyan-100">{s}</span>)}</div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs leading-6 text-amber-200/85"><CircleHelp size={16} className="mt-1 shrink-0" />{c.supportNote}</div>
        </section>

        <section className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div className="order-2 lg:order-1"><div className="rounded-2xl border border-cyan-800/45 bg-[#0b1b2b] p-5 shadow-[0_18px_60px_rgba(0,0,0,.22)]">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold text-cyan-200"><Search size={16} /> h00k Screener <ChevronRight size={13} /> {c.linkStatus}</div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300"><Search size={17} className="text-cyan-400" /> BTCUSDT <span className="ml-auto text-[10px] text-slate-500">BINANCE · FUTURES</span></div>
            <div className="my-4 flex justify-center"><ArrowRight size={27} className="text-cyan-300" /></div>
            <div className="grid grid-cols-2 gap-2"><div className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-900/20 px-2 py-4 text-xs font-bold text-cyan-200">MetaScalp <Check size={14} /></div><div className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-900/20 px-2 py-4 text-xs font-bold text-cyan-200">Tiger.Trade <Check size={14} /></div></div>
          </div></div>
          <div className="order-1 lg:order-2"><span className="text-xs font-bold uppercase tracking-widest text-cyan-400">LOCAL LINKING</span><h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">{c.linkageTitle}</h2><p className="mt-4 text-sm leading-7 text-slate-300">{c.linkageText}</p><ol className="mt-6 space-y-4">{c.linkageSteps.map((s, i) => <li key={s} className="flex items-center gap-3 text-sm text-slate-200"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/70 text-xs font-black text-cyan-300">{i + 1}</span>{s}</li>)}</ol></div>
        </section>

        <section id="pc-gallery" className="scroll-mt-28 border-y border-slate-800/70 py-14 lg:py-20">
          <div className="mb-8"><h2 className="text-2xl font-extrabold text-white sm:text-3xl">{c.galleryTitle}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{c.galleryIntro}</p></div>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={c.galleryTitle}>{c.galleryTabs.map((tab, index) => <button type="button" key={tab} onClick={() => setSelectedPreview(index)} aria-pressed={selectedPreview === index} className={`rounded-lg border px-4 py-2.5 text-xs font-bold transition sm:text-sm ${selectedPreview === index ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white'}`}>{tab}</button>)}</div>
          <div className="rounded-2xl border border-cyan-900/60 bg-gradient-to-b from-[#0e2230] to-[#070f1b] p-4 sm:p-8"><div className="mx-auto max-w-4xl"><SetupPreview mode={selectedPreview} c={c} /></div><p className="mt-5 text-center text-sm text-slate-300">{c.galleryDescriptions[selectedPreview]}</p><p className="mt-1 text-center text-[11px] text-slate-500">{c.demoDisclaimer}</p></div>
        </section>

        <section className="py-16 lg:py-20">
          <h2 className="mb-8 text-2xl font-extrabold text-white sm:text-3xl">{c.howTitle}</h2>
          <div className="grid gap-4 md:grid-cols-3">{c.howSteps.map(([title, desc], index) => <article key={title} className="rounded-2xl border border-slate-700/70 bg-[#0c1928] p-6"><span className="flex size-11 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/50 text-lg font-black text-cyan-300">{index + 1}</span><h3 className="mt-5 text-base font-bold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{desc}</p></article>)}</div>
        </section>

        <section className="pb-16 lg:pb-20">
          <h2 className="mb-8 text-2xl font-extrabold text-white sm:text-3xl">{c.useCasesTitle}</h2>
          <div className="grid gap-4 md:grid-cols-3">{c.useCases.map(([title, desc], index) => { const Icon = caseIcons[index]; return <article key={title} className="rounded-2xl border border-cyan-900/60 bg-[#0b2230] p-6"><Icon size={26} className="text-cyan-300" /><h3 className="mt-5 text-base font-bold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{desc}</p></article>; })}</div>
        </section>

        <section id="pc-download" className="overflow-hidden rounded-3xl border border-cyan-500/45 bg-[radial-gradient(ellipse_at_15%_45%,rgba(6,182,212,.2),transparent_55%),linear-gradient(120deg,#09202c,#061422)] px-6 py-9 sm:px-10 sm:py-12">
          <div className="grid items-center gap-7 md:grid-cols-[180px_1fr]">
            <img src="/h00k-robot-logo.svg" alt="h00k" className="mx-auto h-28 w-auto max-w-full drop-shadow-[0_0_22px_rgba(34,211,238,.4)]" />
            <div><h2 className="text-2xl font-extrabold text-white sm:text-3xl">{c.finalTitle}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{c.finalText}</p><div className="mt-6 flex flex-wrap gap-3"><a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-300"><ArrowDownToLine size={17} />{c.download}<ExternalLink size={14} /></a><span className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-3 text-sm text-slate-200"><Monitor size={16} /> Windows 10 / 11 · x64</span></div></div>
          </div>
        </section>
        <aside className="mt-5 rounded-xl border border-slate-700/70 bg-slate-900/40 px-5 py-4">
          <p className="text-sm font-semibold text-slate-200">{c.releaseTitle}</p>
          <p className="mt-1 text-xs leading-6 text-slate-400">{c.releaseHelp}</p>
          <a href={GITHUB_BUILDS} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 focus-visible:underline">
            {c.releaseLink}<ExternalLink size={13} />
          </a>
        </aside>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-slate-400"><span className="flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-400" />{c.secure}</span><span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-cyan-400" />{c.noAutotrade}</span></div>
      </div>
    </div>
  );
};

export default PcLandingPage;
