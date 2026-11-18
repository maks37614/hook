import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { localizeFormationGuideBias, localizeFormationGuideItem } from '../locales/formationGuideTranslations';
import { translatePhrase } from '../locales';
import { X, BookOpen, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface GuideItem {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  description: string;
  entryRule: string;
  stopLossRule: string;
  targetRule: string;
  volumeRule: string;
}

const GUIDE_ITEMS: GuideItem[] = [
  {
    id: 'double_bottom',
    name: 'Подвійне дно (W-патерн)',
    nameEn: 'Double Bottom',
    category: 'Розворотна формація',
    bias: 'bullish',
    description: 'Формація з двома близькими мінімумами та проміжною вершиною (лінією шиї). Сама формація є лише гіпотезою й потребує breakout, retest та інших підтверджень.',
    entryRule: 'Вхід здійснюється при пробої лінії шиї знизу вгору або на консервативному ретесті лінії шиї зверху.',
    stopLossRule: 'Стоп-лос розміщується за друге дно або трохи нижче локального мінімуму консолідації.',
    targetRule: 'Тейк-профіт дорівнює висоті від мінімумів дна до лінії шиї, відкладеній вгору від точки пробою.',
    volumeRule: 'Обсяг на формуванні першого дна високий, на другому дні знижується, а на пробої лінії шиї різко зростає.',
  },
  {
    id: 'double_top',
    name: 'Подвійна вершина (M-патерн)',
    nameEn: 'Double Top',
    category: 'Розворотна формація',
    bias: 'bearish',
    description: 'Ведмежий розворотний патерн, що сигналізує про вичерпання сил покупців після двох невдалих спроб оновити максимум.',
    entryRule: 'Вхід у шорт при пробої лінії шиї (западини між вершинами) вниз або на зворотному ретесті знизу.',
    stopLossRule: 'Стоп-лос ставиться за другу вершину або за максимальний шип.',
    targetRule: 'Ціль дорівнює висоті від вершин до лінії шиї, відкладеній униз.',
    volumeRule: 'Сплеск обсягу продавців при пробої лінії шиї вниз.',
  },
  {
    id: 'asc_triangle',
    name: 'Висхідний трикутник',
    nameEn: 'Ascending Triangle',
    category: 'Пробійна формація',
    bias: 'bullish',
    description: 'Характеризується горизонтальним опором і серією підвищуваних мінімумів (Higher Lows). Показує пресинг покупців.',
    entryRule: 'Вхід у лонг при імпульсному пробої горизонтального рівня опору або на його ретесті.',
    stopLossRule: 'Стоп-лос розміщується під останній локальний підвищуваний мінімум.',
    targetRule: 'Ціль дорівнює максимальній висоті трикутника (від основи до опору), відкладеній вгору.',
    volumeRule: 'Обсяг падає під час формування трикутника і вибухає на пробої опору.',
  },
  {
    id: 'desc_triangle',
    name: 'Спадний трикутник',
    nameEn: 'Descending Triangle',
    category: 'Пробійна формація',
    bias: 'bearish',
    description: 'Горизонтальна лінія підтримки і серія знижуваних максимумів (Lower Highs). Продавці методично вибивають лімітні заявки покупців.',
    entryRule: 'Вхід у шорт при закритті свічки нижче рівня підтримки.',
    stopLossRule: 'Стоп-лос ставиться за останній знижуваний максимум.',
    targetRule: 'Ціль дорівнює висоті основи трикутника, відкладеній униз від рівня підтримки.',
    volumeRule: 'Збільшення обсягу на пробої рівня підтримки.',
  },
  {
    id: 'bull_flag',
    name: 'Бичачий прапор (Bull Flag)',
    nameEn: 'Bull Flag',
    category: 'Продовження тренду',
    bias: 'bullish',
    description: 'Потужне вертикальне імпульсне зростання (флагшток) змінюється компактною спадною або бічною консолідацією зі згасанням обсягу.',
    entryRule: 'Вхід при пробої верхньої похилої лінії полотна прапора.',
    stopLossRule: 'Стоп-лос ставиться під нижню межу полотна прапора.',
    targetRule: 'Довжина нового імпульсу часто дорівнює довжині попереднього флагштока.',
    volumeRule: 'Величезний обсяг на флагштоку, спадний обсяг у полотні та новий сплеск обсягу на виході з прапора.',
  },
  {
    id: 'bear_flag',
    name: 'Ведмежий прапор (Bear Flag)',
    nameEn: 'Bear Flag',
    category: 'Продовження тренду',
    bias: 'bearish',
    description: 'Різкий обвал ціни (флагшток) з подальшим слабким висхідним відкатом. Попереджає про швидке продовження розпродажу.',
    entryRule: 'Вхід у шорт при пробої нижньої межі висхідного каналу.',
    stopLossRule: 'Стоп-лос за верхню межу каналу відкату.',
    targetRule: 'Висота флагштока, відкладена вниз від точки пробою.',
    volumeRule: 'Високий обсяг на падінні, спад обсягу на відкаті.',
  },
  {
    id: 'volatility_squeeze',
    name: 'Стиснення діапазону (Squeeze)',
    nameEn: 'Volatility Squeeze',
    category: 'Накопичення / Стиснення',
    bias: 'neutral',
    description: 'Критичне звуження торгового діапазону та падіння ATR. Фаза стиснення волатильності перед потенційним направленим breakout; до пробою напрямок залишається нейтральним.',
    entryRule: 'Вхід за напрямком імпульсного виходу з меж діапазону накопичення.',
    stopLossRule: 'Стоп-лос за протилежну межу діапазону накопичення.',
    targetRule: 'Мінімум 2-3 величини діапазону стиснення.',
    volumeRule: 'Аномально низький обсяг у період стиснення з різким вибуховим зростанням на старті руху.',
  },
  {
    id: 'candlestick_pa',
    name: 'Свічкові формації (Пін-бар, Поглинання)',
    nameEn: 'Price Action Candlesticks',
    category: 'Свічковий аналіз ціни',
    bias: 'bullish',
    description: 'Відображають миттєву боротьбу попиту та пропозиції на ключових рівнях: Молот/Пін-бар (хибний пробій і різкий викуп) та Поглинання (зміна контролю).',
    entryRule: 'Вхід на закритті свічки або на 50% відкаті довгої тіні пін-бара.',
    stopLossRule: 'За тінь пін-бара або за екстремум свічки поглинання.',
    targetRule: 'Найближчий рівень опору/підтримки з R:R від 1:2.',
    volumeRule: 'Розворотні свічки на підвищеному обсязі мають максимальну силу.',
  },
];

const KotapychGuide = React.lazy(() => import('./encyclopedia/KotapychGuide').then(module => ({ default: module.KotapychGuide })));
const OpenInterestGuide = React.lazy(() => import('./encyclopedia/OpenInterestGuide').then(module => ({ default: module.OpenInterestGuide })));
const ClassicRulesGuide = React.lazy(() => import('./encyclopedia/ClassicRulesGuide').then(module => ({ default: module.ClassicRulesGuide })));

interface FormationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormationGuideModal: React.FC<FormationGuideModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  // Hooks must run on every render, including when the modal is closed.
  const [selectedId, setSelectedId] = useState<string>(GUIDE_ITEMS[0].id);
  const [mainCategory, setMainCategory] = useState<'scalping' | 'patterns' | 'indicators'>('scalping');
  const [scalpingSubcategory, setScalpingSubcategory] = useState<'kotapych' | 'classic'>('kotapych');
  const activeSourceItem = GUIDE_ITEMS.find((item) => item.id === selectedId) || GUIDE_ITEMS[0];
  const activeItem = localizeFormationGuideItem(language, activeSourceItem);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto touch-scroll">
      <div className="encyclopedia-modal relative w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">{tr("Енциклопедія формацій & Патернів")}</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">{tr("Правила входу, встановлення стоп-лосу та цілей")}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title={tr("Закрити енциклопедію")}
            aria-label={tr("Закрити енциклопедію")}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main encyclopedia categories */}
        <div role="tablist" aria-label={tr("Загальні категорії енциклопедії")} className="flex flex-wrap items-center gap-2 px-3 sm:px-6 py-2.5 border-b border-slate-800 bg-slate-950/30">
          <button type="button" role="tab" aria-selected={mainCategory === 'scalping'} onClick={() => setMainCategory('scalping')}
            className={'rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ' + (mainCategory === 'scalping'
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}>
            {tr("Скальпінг")}
          </button>
          <button type="button" role="tab" aria-selected={mainCategory === 'patterns'} onClick={() => setMainCategory('patterns')}
            className={'rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ' + (mainCategory === 'patterns'
              ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}>
            {tr("Формації-Патерни")}
          </button>
          <button type="button" role="tab" aria-selected={mainCategory === 'indicators'} onClick={() => setMainCategory('indicators')}
            className={'rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ' + (mainCategory === 'indicators'
              ? 'bg-sky-500/15 border-sky-500/40 text-sky-200'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white')}>
            {tr("Індикатори")}
          </button>
        </div>

        {/* Sidebar: nested category and its entries */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 overflow-y-auto md:overflow-hidden divide-y md:divide-y-0">
          {/* List */}
          <div className="md:border-r border-slate-800 bg-slate-950/40 p-2 sm:p-3 space-y-1 overflow-y-auto max-h-[165px] md:max-h-full touch-scroll">
            {mainCategory === 'scalping' ? (
              <div className="space-y-1" role="group" aria-label={tr("Підкатегорії скальпінгу")}>
                <button type="button" aria-pressed={scalpingSubcategory === 'kotapych'} onClick={() => setScalpingSubcategory('kotapych')}
                  className={'w-full text-left px-3 py-2.5 rounded-xl font-bold flex items-center justify-between text-xs border transition-colors ' +
                    (scalpingSubcategory === 'kotapych' ? 'bg-slate-800 text-white border-cyan-500/30' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-900/60 hover:text-white')}>
                  <span><strong className="block text-xs">{tr("Котапич")}</strong><small className="block text-[10px] text-slate-400 mt-1">{tr("4 сетапи · 19 тематичних розділів")}</small></span>
                  <ChevronRight className={'w-3.5 h-3.5 ' + (scalpingSubcategory === 'kotapych' ? 'text-cyan-400' : 'text-slate-600')} />
                </button>
                <button type="button" aria-pressed={scalpingSubcategory === 'classic'} onClick={() => setScalpingSubcategory('classic')}
                  className={'w-full text-left px-3 py-2.5 rounded-xl font-bold flex items-center justify-between text-xs border transition-colors ' +
                    (scalpingSubcategory === 'classic' ? 'bg-slate-800 text-white border-cyan-500/30' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-900/60 hover:text-white')}>
                  <span><strong className="block text-xs">{tr("Правила")}</strong><small className="block text-[10px] text-slate-400 mt-1">{tr("6 тематичних розділів · графічні приклади")}</small></span>
                  <ChevronRight className={'w-3.5 h-3.5 ' + (scalpingSubcategory === 'classic' ? 'text-cyan-400' : 'text-slate-600')} />
                </button>
              </div>
            ) : mainCategory === 'indicators' ? (
              <button type="button" aria-current="page" onClick={() => setMainCategory('indicators')}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-800 text-white font-bold flex items-center justify-between text-xs border border-sky-500/20">
                <span><strong className="block text-xs">Open Interest (OI)</strong><small className="block text-[10px] text-slate-400 mt-1">{tr("Відкритий інтерес · 7 розділів")}</small></span>
                <ChevronRight className="w-3.5 h-3.5 text-sky-400" />
              </button>
            ) : GUIDE_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                  selectedId === item.id
                    ? 'bg-slate-800 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs">{localizeFormationGuideItem(language, item).name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{localizeFormationGuideItem(language, item).category}</div>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${selectedId === item.id ? 'text-cyan-400' : 'text-slate-600'}`} />
              </button>
            ))}
          </div>

          {/* Details */}
          <div className="md:col-span-2 p-4 sm:p-6 overflow-y-auto min-h-0 max-h-[min(70vh,700px)] md:max-h-full space-y-4 touch-scroll">
            {mainCategory === 'scalping' ? (
              scalpingSubcategory === 'kotapych' ? (
                <React.Suspense fallback={<div role="status" className="text-xs text-slate-400">{tr("Завантажуємо матеріали Котапича…")}</div>}>
                  <KotapychGuide />
                </React.Suspense>
              ) : (
                <React.Suspense fallback={<div role="status" className="text-xs text-slate-400">{tr("Завантажуємо правила…")}</div>}>
                  <ClassicRulesGuide />
                </React.Suspense>
              )
            ) : mainCategory === 'indicators' ? (
              <React.Suspense fallback={<div role="status" className="text-xs text-slate-400">{tr("Завантажуємо матеріали про Open Interest…")}</div>}>
                <OpenInterestGuide />
              </React.Suspense>
            ) : (<>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {activeItem.category}
                </span>
                <h3 className="text-lg font-extrabold text-white mt-0.5">{activeItem.name}</h3>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-lg font-bold uppercase ${
                  activeItem.bias === 'bullish'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : activeItem.bias === 'bearish'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {localizeFormationGuideBias(language, activeItem.bias)}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              {activeItem.description}
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-sky-400 flex items-center gap-1.5 mb-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {tr("Точка входу:")}
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.entryRule}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {tr("Стоп-лос:")}
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.stopLossRule}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {tr("Тейк-профіт:")}
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.targetRule}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-amber-400 flex items-center gap-1.5 mb-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {tr("Підтвердження обсягом:")}
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.volumeRule}</p>
              </div>
            </div>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
};
