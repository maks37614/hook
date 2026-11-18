import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import { AlertTriangle, BookOpen, CheckCircle2, Layers, LineChart, Route, ShieldCheck } from 'lucide-react';
import {
  CLASSIC_GENERAL_RULES,
  CLASSIC_LEVEL_RULES,
  CLASSIC_RANGE_RULES,
  CLASSIC_CASCADE_RULES,
  CLASSIC_SINGLE_HIGH_RULES,
  CLASSIC_TRENDLINE_RULES,
  CLASSIC_GLOSSARY,
  type ClassicTopicId,
  type ClassicRuleGroup,
} from './classicRulesData';

/** Freshly drawn, responsive candle diagrams that explain the PDF scenarios.
 * They are teaching schematics, NOT reproductions of original screenshots.
 */
export type ClassicChartKind = 'range25' | 'range20' | 'range6' | 'level' | 'cascade' | 'wideCascade' | 'singleHigh' | 'trendline';

const EXAMPLE_SERIES: Record<ClassicChartKind, number[]> = {
  range25: [24,33,44,56,51,47,42,46,53,45,49,45,52,48,43,46,50,44,52,45,50,53,47,56,64,71,77,69,73,82,75,87,78,82],
  range20: [19,30,38,53,48,51,45,46,49,44,52,49,55,51,58,53,55,56,61,59,64,57,71,80,73,87,83,91,78,84,88,82,79,81],
  range6: [23,27,38,32,29,41,36,33,44,41,47,43,40,48,42,46,44,51,49,52,43,37,42,54,68,79,72,88,81,75,72,74,69,70],
  level: [14,20,29,42,50,54,49,52,57,53,61,58,62,53,59,64,60,58,65,61,67,65,69,63,68,71,65,76,79,84,77,89,85,94],
  cascade: [14,25,32,39,45,52,48,55,58,54,62,55,64,61,58,66,69,64,73,68,70,73,78,70,76,72,79,74,84,80,90,85,96,92],
  wideCascade: [16,24,35,51,46,54,44,52,39,56,46,59,42,57,50,53,47,55,62,52,63,58,72,65,73,69,75,62,78,84,80,89,83,97],
  singleHigh: [14,21,25,38,47,59,55,63,57,61,52,56,58,62,59,66,57,60,68,63,67,69,64,70,72,81,74,78,76,84,79,87,94,97],
  trendline: [17,24,34,46,62,75,69,72,63,69,67,57,60,64,56,63,57,62,55,58,64,56,59,61,66,72,69,76,83,90,86,91,84,89],
};

const CLASSIC_CHART_LABELS: Record<ClassicChartKind, string> = {
  range25: 'Проторговка 25 хв: горизонтальна база і вихід',
  range20: 'Проторговка 20 хв: похила локальна база і вихід',
  range6: 'Проторговка 6 хв: коротка база і реакція',
  level: 'Основний рівень, локальна проторговка та можливий вхід',
  cascade: 'Каскад із кількох рівнів і пробоєм у продовження',
  wideCascade: 'Широкий складний каскад, де краще чекати чіткої проторговки',
  singleHigh: 'Одиночний максимум і нова проторговка перед виходом',
  trendline: 'Похила трендова лінія у рівень та пробій у продовження',
};

function priceY(price: number) { return 179 - price * 1.52; }

export function ClassicPriceDiagram({ kind, compact = false }: { kind: ClassicChartKind; compact?: boolean }) {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const series = EXAMPLE_SERIES[kind];
  const step = 386 / (series.length - 1);
  const candles = series.map((value, index) => {
    const open = index === 0 ? value - 4 : series[index - 1];
    const high = Math.max(value, open) + (index % 4 === 1 ? 7 : 4);
    const low = Math.min(value, open) - (index % 5 === 0 ? 8 : 4);
    const x = 17 + index * step;
    return { index, x, value, open, high, low, up: value >= open };
  });
  const isRange = kind.startsWith('range');
  const isTrend = kind === 'trendline' || kind === 'range20';
  const isCascade = kind === 'cascade' || kind === 'wideCascade';
  const levels: Array<{ price: number; label?: string; color?: string }> = isRange
    ? [{ price: 43, label: 'Підтримка' }, { price: 62, label: 'Опір' }]
    : isCascade
      ? [{ price: 48, label: 'Рівень 1' }, { price: 67, label: 'Рівень 2' }, { price: 80, label: 'Рівень 3' }]
      : kind === 'singleHigh'
        ? [{ price: 64, label: 'Хай A' }, { price: 80, label: 'Хай Б' }]
        : [{ price: 55, label: 'Зона' }, { price: 73, label: 'Основний рівень' }];
  return <figure className={'rounded-xl border border-slate-700/70 bg-slate-950/80 overflow-hidden ' + (compact ? 'p-2' : 'p-3')}>
    <svg viewBox="0 0 420 195" className="block w-full h-auto" role="img" aria-label={tr(CLASSIC_CHART_LABELS[kind])}>
      <defs>
        <pattern id={'classic-grid-' + kind} width="28" height="24" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 24" fill="none" stroke="#293447" strokeWidth="0.6"/>
        </pattern>
      </defs>
      <rect width="420" height="195" fill={'url(#classic-grid-' + kind + ')'} />
      {levels.map(({ price, label, color }, index) => <g key={index}>
        <line x1="13" y1={priceY(price)} x2="404" y2={priceY(price)} stroke={color || '#58b8d2'} strokeOpacity={index % 2 ? 0.85 : 0.5} strokeWidth="1" strokeDasharray={index % 2 ? 'none' : '6 4'}/>
        {label && !compact && <text x="18" y={priceY(price) - 5} fill="#9bb5cb" fontSize="9">{tr(label)}</text>}
      </g>)}
      {isRange && <rect x="74" y={priceY(62)} width="220" height={priceY(43) - priceY(62)} rx="5" fill="#2baad7" fillOpacity="0.08" stroke="#58b8d2" strokeOpacity="0.45" strokeDasharray="4 4" />}
      {isCascade && <rect x="225" y={priceY(80)} width="95" height={priceY(48) - priceY(80)} rx="4" fill="#38bdf8" fillOpacity="0.06" stroke="#38bdf8" strokeOpacity="0.18"/>}
      {isTrend && <path d={kind === 'range20' ? 'M 105 68 L 257 111' : 'M 123 69 L 300 98'} fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />}
      {candles.map(candle => {
        const color = candle.up ? '#52d9cf' : '#f1b5c3';
        const upper = priceY(Math.max(candle.value,candle.open));
        const lower = priceY(Math.min(candle.value,candle.open));
        return <g key={candle.index}>
          <line x1={candle.x} y1={priceY(candle.high)} x2={candle.x} y2={priceY(candle.low)} stroke={color} strokeWidth="1.1"/>
          <rect x={candle.x - 3.2} y={upper} width="6.4" height={Math.max(2, lower - upper)} rx=".65" fill={color}/>
        </g>;
      })}
      {kind === 'level' && <g><circle cx="344" cy={priceY(79)} r="5.5" fill="#22d3ee" fillOpacity="0.18" stroke="#67e8f9"/><text x="319" y={priceY(79)-12} fontSize="10" fill="#67e8f9" >{tr('Вхід')}</text></g>}
      {kind === 'singleHigh' && <g><circle cx="310" cy={priceY(80)} r="6" fill="#22d3ee" fillOpacity="0.12" stroke="#67e8f9"/><text x="292" y={priceY(80)-13} fontSize="10" fill="#67e8f9" >{tr('Ретест')}</text></g>}
      {kind === 'wideCascade' && <g><text x="214" y="184" fill="#a7b6ce" fontSize="10" >{tr('Без бази — немає входу')}</text></g>}
    </svg>
    <figcaption className="text-[10px] leading-relaxed text-slate-500 mt-1.5">{tr(CLASSIC_CHART_LABELS[kind])}. {tr('Власна умовна схема, а не скриншот із PDF.')}</figcaption>
  </figure>;
}

const NAV: Array<{id: ClassicTopicId;label: string}> = [
  { id: 'overview', label: 'Загальні правила' },
  { id: 'levels', label: 'Рівні' },
  { id: 'ranges', label: 'Проторговки' },
  { id: 'cascades', label: 'Каскади' },
  { id: 'singleHigh', label: 'Одиночний хай' },
  { id: 'trendlines', label: 'Нахилка в рівень' },
];

function RuleList({ group }: { group: ClassicRuleGroup }) {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  return <div className="space-y-2.5">
    <h4 className="text-sm sm:text-base text-white font-extrabold">{tr(group.title)}</h4>
    <p className="text-xs text-slate-400">{tr(group.short)}</p>
    <ol className="space-y-2.5">
      {group.items.map((item, index) => <li key={index} className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300 leading-relaxed">
        <span className="h-6 w-6 shrink-0 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300 inline-flex items-center justify-center font-bold text-[11px]">{index+1}</span>
        <span>{tr(item)}</span>
      </li>)}
    </ol>
  </div>;
}

function SectionBanner({ icon, title, subtitle }: {icon: React.ReactNode;title: string;subtitle: string}) {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  return <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-slate-900 to-slate-900 p-3 flex gap-2.5">
    <span className="shrink-0 rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 w-8 h-8 flex items-center justify-center">{icon}</span>
    <div className="space-y-0.5">
      <h5 className="text-sm font-bold text-white">{tr(title)}</h5>
      <p className="text-xs text-slate-400 leading-relaxed">{tr(subtitle)}</p>
    </div>
  </div>;
}

export function ClassicRulesGuide() {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const [selected, setSelected] = useState<ClassicTopicId>('overview');

  return <div className="space-y-4" aria-label={tr('Скальпінг — Правила')}>
    <header className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 p-3 sm:p-4">
      <div className="flex gap-2 items-center text-cyan-300 text-[11px] font-bold uppercase tracking-wider">
        <Layers className="w-3.5 h-3.5" /> {tr("Скальпінг / Правила")}
      </div>
      <h3 className="text-lg sm:text-xl font-extrabold text-white mt-1">{tr("Правила торгівлі")}</h3>
      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-1">
        {tr("Структурований навчальний регламент за 10-сторінковим документом «Свод правил»: відбір сетапів, рівні, проторговки, каскади, одиночний хай і похилі лінії.")}
      </p>
    </header>

    <div role="tablist" aria-label={tr("Розділи класичних правил")} className="flex flex-wrap gap-1.5">
      {NAV.map(item => <button type="button" key={item.id} role="tab" aria-selected={selected===item.id} onClick={()=>setSelected(item.id)}
        className={'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ' + (selected===item.id
          ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
          : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>
        {tr(item.label)}
      </button>)}
    </div>

    {selected === 'overview' && <div className="space-y-4">
      <SectionBanner icon={<ShieldCheck className="w-4 h-4" />} title="Головний принцип: відбирай зрозумілі сетапи" subtitle="Не торгуй кожен імпульс і не перетворюй одну ідею на нескінченну серію спроб."/>
      <RuleList group={CLASSIC_GENERAL_RULES}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <ClassicPriceDiagram kind="level" compact/>
        <ClassicPriceDiagram kind="range25" compact/>
      </div>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5"/>
        <p className="text-xs leading-relaxed text-slate-300">{tr("Це особистий регламент із документа, а не універсальна система. «1 сетап — 1 спроба» та інші суворі правила наведено як авторські обмеження.")}</p>
      </div>
    </div>}

    {selected === 'levels' && <div className="space-y-4">
      <SectionBanner icon={<LineChart className="w-4 h-4" />} title="Локальна база → основний рівень → підтвердження" subtitle="На сторінках 3 і 5 PDF пояснено, коли працювати від локалки, а коли чекати рівень."/>
      <ClassicPriceDiagram kind="level"/>
      <RuleList group={CLASSIC_LEVEL_RULES}/>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="text-xs leading-relaxed text-slate-300"><strong className="text-amber-300">{tr("Уточнення чисел:")}</strong>{" "}{tr("значення «0,35» та «0,3» з PDF залишені дослівно за змістом, але їхні одиниці автор не вказав. Без уточнення їх не можна використовувати як готовий відсоток стопа.")}</p>
      </div>
    </div>}

    {selected === 'ranges' && <div className="space-y-4">
      <SectionBanner icon={<LineChart className="w-4 h-4" />} title="Власні схеми проторговок" subtitle="На сторінці 4 PDF наведено приклади тривалості 25, 20 і 6 хвилин та числа 10%, 7%, 6%."/>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {([
          { kind: 'range25' as const, time: '25 хв', percent: '10%' },
          { kind: 'range20' as const, time: '20 хв', percent: '7%' },
          { kind: 'range6' as const, time: '6 хв', percent: '6%' },
        ]).map(item=><div className="space-y-1.5" key={item.kind}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white font-bold">{tr(item.time)}</span>
            <span className="rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] px-2 py-0.5">{item.percent}{" "}{tr("у прикладі")}</span>
          </div>
          <ClassicPriceDiagram kind={item.kind} compact/>
        </div>)}
      </div>
      <RuleList group={CLASSIC_RANGE_RULES}/>
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-slate-300 leading-relaxed">
        <strong className="text-cyan-200">{tr("Ключове правило:")}</strong>{" "}{tr("без проторговки — одна спроба в рівень, тільки коли свічка відкрилася на ньому. Інакше це не відповідний сетап.")}
      </div>
    </div>}

    {selected === 'cascades' && <div className="space-y-4">
      <SectionBanner icon={<Route className="w-4 h-4" />} title="Не кожний каскад придатний для входу" subtitle="На сторінках 6–7 є приклади першого лоя, повторного пробою та широкої складної конструкції."/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <ClassicPriceDiagram kind="cascade"/>
        <ClassicPriceDiagram kind="wideCascade"/>
      </div>
      <RuleList group={CLASSIC_CASCADE_RULES}/>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-slate-300 leading-relaxed">
        <strong className="text-amber-200">{tr("Обмеження:")}</strong>{" "}{tr("у широких каскадах без чіткої бази автор радить очікувати нову проторговку замість довільного входу між хаями.")}
      </div>
    </div>}

    {selected === 'singleHigh' && <div className="space-y-4">
      <SectionBanner icon={<LineChart className="w-4 h-4" />} title="Одиночний хай: спочатку проторговка" subtitle="Сторінка 8: якщо хай проходять без часу на підготовку, автор пропускає сетап."/>
      <ClassicPriceDiagram kind="singleHigh"/>
      <RuleList group={CLASSIC_SINGLE_HIGH_RULES}/>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300 leading-relaxed">
        <strong className="text-white">5m / 1m / 15s:</strong>{" "}{tr("молодші таймфрейми в прикладах деталізують той самий рівень, але не замінюють читабельної базової формації.")}
      </div>
    </div>}

    {selected === 'trendlines' && <div className="space-y-4">
      <SectionBanner icon={<LineChart className="w-4 h-4" />} title="Похила в рівень: продовження, а не гонитва за рухом" subtitle="Сторінки 9–10: зрозуміла нахилка та формації, видимі на 5m, із контекстом основного рівня."/>
      <ClassicPriceDiagram kind="trendline"/>
      <RuleList group={CLASSIC_TRENDLINE_RULES}/>
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-slate-300 leading-relaxed">
        <strong className="text-sky-200">{tr("Припини натягувати нахилку:")}</strong>{" "}{tr("коли нових хаїв немає і ціна переходить у боковик. Познач верхню та нижню межі й чекай більшої структури.")}
      </div>
    </div>}

    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3 space-y-2.5">
      <div className="flex gap-2 items-center text-xs font-bold text-slate-200">
        <BookOpen className="w-4 h-4 text-slate-400" /> {tr("Словник позначень")}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {CLASSIC_GLOSSARY.map(item=><p key={item.term} className="text-[11px] leading-relaxed text-slate-400">
          <strong className="text-slate-200">{tr(item.term)}:</strong> {tr(item.meaning)}
        </p>)}
      </div>
    </div>
    <div className="flex items-start gap-2 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{tr("Навчальна адаптація наданого PDF. Усі графіки перемальовані як умовні схеми, а не копії біржових даних. Правила не є індивідуальною інвестиційною рекомендацією.")}</span>
    </div>
  </div>;
}
