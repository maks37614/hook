import React, { useState } from 'react';
import { AlertTriangle, ChevronRight, Layers, ShieldCheck } from 'lucide-react';
import { KOTAPYCH_SETUPS, KOTAPYCH_TOPICS, type KotapychSetup } from './kotapychGuideData';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';

type Screen = 'overview' | 'setup1' | 'setup2' | 'setup3' | 'setup4' | 'topics';

const NAV: Array<{ id: Screen; label: string }> = [
  { id: 'overview', label: 'Огляд' },
  { id: 'setup1', label: 'Сетап №1' },
  { id: 'setup2', label: 'Сетап №2' },
  { id: 'setup3', label: 'Сетап №3' },
  { id: 'setup4', label: 'Сетап №4' },
  { id: 'topics', label: 'Поглиблений аналіз' },
];

function Diagram({ setup }: { setup: KotapychSetup['id'] }) {
  const { language } = useLanguage();
  const tr = (text: string) => translatePhrase(language, text);
  const paths: Record<KotapychSetup['id'], string> = {
    setup1: '8,141 31,116 54,70 76,51 97,70 115,63 134,77 151,66 166,105 181,68 204,73 227,59 249,62 270,41 295,42 328,20 352,11',
    setup2: '8,136 38,105 65,79 93,77 113,65 130,70 151,38 173,45 196,48 217,32 232,19 244,44 262,61 279,86 309,99 340,135 352,144',
    setup3: '8,145 45,145 73,131 100,83 120,20 139,34 157,57 181,64 203,44 220,52 235,38 249,64 276,94 308,119 352,145',
    setup4: '8,51 43,45 74,56 100,48 121,83 143,131 164,136 184,128 200,132 220,122 240,126 262,100 281,88 303,73 326,44 351,25',
  };
  return (
    <figure className="rounded-2xl border border-slate-700/70 bg-slate-950/70 px-3 pt-3 pb-2">
      <svg className="w-full h-auto" viewBox="0 0 360 160" role="img" aria-label={tr('Умовна схема розвитку ціни для цього сетапу')}>
        <defs><pattern id={'kgrid-'+setup} width="25" height="24" patternUnits="userSpaceOnUse">
          <path d="M 25 0 L 0 0 0 24" stroke="#263346" strokeWidth="0.6" fill="none" />
        </pattern></defs>
        <rect width="360" height="160" fill={'url(#kgrid-'+setup+')'} />
        <path d="M 0 60 L 360 60" stroke="#6b7f9f" strokeWidth="1" strokeDasharray="5 5" opacity=".65" />
        <path d="M 0 113 L 360 113" stroke="#6b7f9f" strokeWidth="1" strokeDasharray="5 5" opacity=".65" />
        <polyline points={paths[setup]} fill="none" stroke={setup === 'setup2' || setup === 'setup3' ? '#fb7185' : '#34d399'} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <figcaption className="text-[10px] text-slate-500 mt-1" >{tr('Умовна схема логіки, не реальний графік з документа')}</figcaption>
    </figure>
  );
}

function Lines({ label, lines, color = 'text-sky-300' }: { label: string; lines: string[]; color?: string }) {
  const { language } = useLanguage();
  const tr = (text: string) => translatePhrase(language, text);
  return <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
    <h5 className={'text-xs font-bold mb-2 ' + color}>{tr(label)}</h5>
    <ul className="space-y-2">
      {lines.map((line, index) => <li className="flex gap-2 text-xs leading-relaxed text-slate-300" key={index}>
        <span className="text-slate-600 shrink-0" aria-hidden="true">•</span><span>{tr(line)}</span>
      </li>)}
    </ul>
  </section>;
}

function SetupDetails({ setup }: { setup: KotapychSetup }) {
  const { language } = useLanguage();
  const tr = (text: string) => translatePhrase(language, text);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className={'rounded-lg px-2 py-1 text-[11px] font-extrabold border ' +
        (setup.direction === 'LONG' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300')}>{tr(setup.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ')}</span>
      <span className="text-[11px] text-slate-500">{setup.focus.map(tr).join(' · ')}</span>
    </div>
    <h4 className="text-base sm:text-lg font-extrabold text-white">{tr('Сетап №')}{setup.number}. {tr(setup.title)}</h4>
    <p className="text-xs sm:text-sm leading-relaxed text-slate-200">{tr(setup.summary)}</p>
    <Diagram setup={setup.id} />
    <Lines label="1. Ринковий контекст" lines={setup.context} />
    <Lines label="2. Як розпізнати" lines={setup.recognition} color="text-cyan-300" />
    <Lines label="3. Точки входу" lines={setup.entry} color="text-emerald-300" />
    <Lines label="4. Набір і супровід позиції" lines={setup.management} color="text-amber-300" />
    <Lines label="5. Стоп і контроль ризику" lines={setup.stop} color="text-rose-300" />
    <Lines label="6. Цілі та фіксація" lines={setup.targets} color="text-emerald-300" />
    <Lines label="7. Коли сценарій скасовано" lines={setup.cancellation} color="text-rose-300" />
  </div>;
}

export function KotapychGuide() {
  const { language } = useLanguage();
  const tr = (text: string) => translatePhrase(language, text);
  const [screen, setScreen] = useState<Screen>('overview');
  const [topicId, setTopicId] = useState(KOTAPYCH_TOPICS[0].id);
  const setup = KOTAPYCH_SETUPS.find(item => item.id === screen);
  const topic = KOTAPYCH_TOPICS.find(item => item.id === topicId) || KOTAPYCH_TOPICS[0];

  return <div className="space-y-4" aria-label={tr('Підкатегорія Котапич')}>
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 p-3 sm:p-4">
      <div className="flex items-center gap-2 text-cyan-300 text-[11px] font-bold uppercase tracking-wider"><Layers className="w-3.5 h-3.5" /> {tr('Скальпінг / Котапич')}</div>
      <h3 className="text-lg sm:text-xl font-extrabold text-white mt-1">{tr('Торгова методика «Котапич»')}</h3>
      <p className="mt-1 text-xs text-slate-300 leading-relaxed">{tr('Чотири сетапи та поглиблений систематизований аналіз контексту, ліквідності, обсягів, ризику й прикладів із двох документів.')}</p>
    </div>
    <div role="tablist" aria-label={tr('Розділи методики Котапич')} className="flex flex-wrap gap-1.5">
      {NAV.map(item => <button key={item.id} type="button" role="tab" aria-selected={screen===item.id}
        onClick={() => setScreen(item.id)}
        className={'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ' + (screen===item.id
          ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40'
          : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200')}>
        {tr(item.label)}
      </button>)}
    </div>

    {screen==='overview' && <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-300">{tr("Основна ідея: шукати підтверджену реакцію ринку на межі проторговки, оцінювати швидкість руху, обсяги та поведінку покупців і продавців. Прокол ліквідності — лише частина контексту.")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {KOTAPYCH_SETUPS.map(item => <button type="button" key={item.id} onClick={()=>setScreen(item.id)} className="text-left rounded-xl border border-slate-700/70 bg-slate-950/60 hover:border-cyan-500/50 p-3 transition-colors">
          <span className={'text-[10px] font-extrabold ' + (item.direction==='LONG'?'text-emerald-300':'text-rose-300')}>{tr(item.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ')} · {tr('Сетап №')}{item.number}</span>
          <h4 className="font-bold text-sm text-white mt-1">{tr(item.title)}</h4>
          <p className="text-xs text-slate-400 mt-1 line-clamp-3 leading-relaxed">{tr(item.summary)}</p>
          <span className="mt-2 flex items-center text-cyan-300 text-[11px]">{tr('Відкрити аналіз')} <ChevronRight className="w-3.5 h-3.5" /></span>
        </button>)}
      </div>
      <Lines label="Спільні принципи" color="text-cyan-300" lines={[
        'Старший таймфрейм і попередній рух важливіші за красивий локальний патерн.',
        'Прокол рівня сам по собі не підтверджує угоду: потрібні повернення, утримання й динаміка.',
        'Автор описує набір частинами, застерігає від усереднення збитків і радить спершу зібрати статистику.',
        'Чотири сетапи — це авторська інтерпретація ринку, а не гарантія прибутку.',
      ]} />
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-slate-300">{tr("Відсотки прибутковості та співвідношення R:R у файлах — особисті приклади автора, не підтверджені бектестом. Ризик кожної угоди розраховується окремо.")}</p>
      </div>
    </div>}

    {setup && <SetupDetails setup={setup} />}

    {screen==='topics' && <div className="space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">{tr("Ключові ідеї з обох документів (79 і 8 сторінок), згруповані за темами: від структури ринку й варіантів сетапів до виконання угод, фандингу та ризику. Авторські оцінки ймовірностей не є перевіреною статистикою.")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-800/70 p-2 touch-scroll">{KOTAPYCH_TOPICS.map(item=>
        <button type="button" key={item.id} onClick={()=>setTopicId(item.id)}
          className={'rounded-md border px-2.5 py-1.5 text-[11px] leading-snug text-left min-h-10 ' + (topicId===item.id?'border-indigo-400/50 text-indigo-200 bg-indigo-500/20':'border-slate-700 text-slate-400 hover:text-white')}>
          {tr(item.title)}
        </button>)}</div>
      <h4 className="text-base text-white font-extrabold">{tr(topic.title)}</h4>
      <p className="text-xs text-slate-400">{tr(topic.summary)}</p>
      <Lines label="Основні висновки з нотаток" lines={topic.points} />
    </div>}

    <div className="flex items-center gap-2 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
      <ShieldCheck className="w-3.5 h-3.5 text-slate-500" /> {tr('Навчальна енциклопедія. Не є індивідуальною інвестиційною рекомендацією.')}
    </div>
  </div>;
}
