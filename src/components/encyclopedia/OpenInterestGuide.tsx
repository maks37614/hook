import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpen, CheckCircle2, CircleHelp, Layers, LineChart, ShieldAlert } from 'lucide-react';

type Direction = 'up' | 'down';

export type OIPriceCase = {
  id: string;
  price: Direction;
  oi: Direction;
  title: string;
  interpretation: string[];
  practice: string;
};

export const OI_PRICE_CASES: OIPriceCase[] = [
  {
    id: 'price-up-oi-up',
    price: 'up',
    oi: 'up',
    title: 'Ціна зростає + OI зростає',
    interpretation: [
      'Кількість відкритих контрактів збільшується: у ринку з’являються нові позиції.',
      'Це може підтверджувати силу висхідного руху, якщо її підтримують обсяг і реакція ціни.',
      'У матеріалі такий рух названо «здоровим трендом».',
    ],
    practice: 'Можна розглядати утримання позиції або пошук продовження руху — тільки за наявності інших підтверджень.',
  },
  {
    id: 'price-up-oi-down',
    price: 'up',
    oi: 'down',
    title: 'Ціна зростає + OI падає',
    interpretation: [
      'Кількість відкритих контрактів скорочується: частина учасників закриває позиції.',
      'Одне з можливих пояснень — закриття шортів або short squeeze, а не формування нового стійкого тренду.',
    ],
    practice: 'Обережніше з новими лонгами: рух може втрачати імпульс, тому корисно перевіряти обсяг і найближчий опір.',
  },
  {
    id: 'price-down-oi-up',
    price: 'down',
    oi: 'up',
    title: 'Ціна падає + OI зростає',
    interpretation: [
      'Кількість відкритих контрактів збільшується на тлі зниження ціни.',
      'Це може означати появу нових шортових позицій і посилення тиску продавців.',
    ],
    practice: 'Падіння може мати продовження, якщо продавці активні, але напрямок нових позицій не доводиться самим OI.',
  },
  {
    id: 'price-down-oi-down',
    price: 'down',
    oi: 'down',
    title: 'Ціна падає + OI падає',
    interpretation: [
      'Кількість відкритих контрактів зменшується: учасники виходять із позицій.',
      'Один із можливих сценаріїв — закриття або ліквідація лонгів (капітуляція), інколи наприкінці імпульсу.',
    ],
    practice: 'Спостерігай за ознаками відскоку чи розвороту, але не вважай саме падіння OI готовим сигналом на лонг.',
  },
];

export type OIScenario = { id: string; title: string; conditions: string[]; meaning: string; action: string };

export const OI_MARKET_SCENARIOS: OIScenario[] = [
  {
    id: 'accumulation', title: '1. Накопичення перед імпульсом',
    conditions: ['Ціна перебуває в діапазоні.', 'OI поступово зростає.'],
    meaning: 'У діапазоні накопичуються відкриті позиції; після виходу можливий сильний рух.',
    action: 'Визнач межі діапазону й дочекайся реакції або підтвердженого пробою. OI не визначає напрямок майбутнього виходу.',
  },
  {
    id: 'trap', title: '2. Пастка для учасників (trap)',
    conditions: ['Ціна йде вгору.', 'OI різко зростає.', 'Після цього ціна різко падає.'],
    meaning: 'Можлива пастка для пізніх покупців: частину лонгів могли примусово закрити.',
    action: 'Перевір кластерні обсяги, ліквідації, повернення під рівень і поведінку funding rate.',
  },
  {
    id: 'flush', title: '3. Винос позицій та «очищення» ринку',
    conditions: ['Відбувається різкий ціновий імпульс.', 'Водночас OI падає.'],
    meaning: 'Відкриті позиції масово скорочуються; ринок може проходити фазу закриттів або ліквідацій.',
    action: 'Після такого руху спостерігай за новим балансом покупців і продавців. Подальший тренд не гарантований.',
  },
];

const comparisons = [
  {
    title: 'Обсяг (Volume)',
    body: 'Скільки контрактів проторгували за певний період. Це потік угод, а не кількість позицій, що залишаються відкритими.',
  },
  {
    title: 'Відкритий інтерес (OI)',
    body: 'Скільки контрактів залишаються відкритими в конкретному деривативному ринку. Зміни OI показують зміну відкритих зобов’язань.',
  },
  {
    title: 'Funding rate',
    body: 'Допомагає оцінювати перекіс та вартість утримання позицій у безстрокових ф’ючерсах (perpetual futures).',
  },
];

function DirectionIndicator({ direction }: { direction: Direction }) {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  return direction === 'up'
    ? <ArrowUp aria-label={tr("зростання")} className="w-3.5 h-3.5 text-emerald-400" />
    : <ArrowDown aria-label={tr("падіння")} className="w-3.5 h-3.5 text-rose-400" />;
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <section className="space-y-2.5" aria-label={title}>
    <h4 className="flex items-start gap-2 text-sm sm:text-base text-white font-extrabold">
      <span className="inline-flex items-center justify-center bg-indigo-500/15 border border-indigo-500/30 rounded-lg text-indigo-300 text-[11px] font-bold shrink-0 w-7 h-7">{number}</span>
      <span className="pt-1">{title}</span>
    </h4>
    {children}
  </section>;
}

export function OpenInterestGuide() {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  return <div className="space-y-5 text-xs text-slate-300" aria-label={tr("Енциклопедія індикатора Open Interest")}>
    <header className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-950 p-3.5 sm:p-4">
      <div className="flex gap-2 items-center text-indigo-300 text-[10px] uppercase tracking-wider font-bold">
        <BarChart3 className="w-4 h-4" /> {tr("Індикатори / Open Interest")}
      </div>
      <h3 className="text-lg sm:text-xl font-extrabold text-white mt-1">{tr("Відкритий інтерес (Open Interest, OI)")}</h3>
      <p className="text-xs sm:text-sm leading-relaxed text-slate-200 mt-2">
        {tr("Один із важливих інструментів аналізу деривативів — ф’ючерсів і безстрокових контрактів (perpetual futures).")}{' '}
        {tr("Він показує загальну кількість відкритих контрактів, які ще не були закриті або погашені.")}
      </p>
      <div className="mt-3 rounded-xl border border-indigo-500/20 bg-slate-950/60 px-3 py-2.5">
        <strong className="text-indigo-200">{tr("Ключова ідея:")}</strong>{" "}{tr("OI допомагає оцінити участь ринку в русі ціни, а не лише саму зміну ціни.")}
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          {tr("Точніше: OI вимірює відкриті контракти, а не безпосередній приплив грошей або те, хто сильніший — покупці чи продавці.")}
        </p>
      </div>
    </header>

    <Section number={1} title={tr("Основи: як читати OI разом із ціною")}>
      <p className="leading-relaxed text-slate-400">{tr("Дивися на індикатор не окремо, а в поєднанні з напрямком ціни. Чотири типові сценарії:")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {OI_PRICE_CASES.map(item => <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5">{tr("Ціна")}{' '}<DirectionIndicator direction={item.price} /></span>
            <span className="inline-flex items-center gap-1.5">OI <DirectionIndicator direction={item.oi} /></span>
          </div>
          <h5 className="font-extrabold text-white text-xs">{tr(item.title)}</h5>
          <ul className="space-y-1.5 list-disc pl-4 text-slate-300 leading-relaxed">
            {item.interpretation.map((point, index) => <li key={index}>{tr(point)}</li>)}
          </ul>
          <p className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-2.5 py-2 leading-relaxed">
            <span className="text-cyan-300 font-bold">{tr("Практично:")}{' '}</span>{tr(item.practice)}
          </p>
        </article>)}
      </div>
    </Section>

    <Section number={2} title={tr("Що OI показує насправді")}>
      <p className="leading-relaxed">{tr("Головне запитання:")}{' '}<strong className="text-white">{tr("збільшується чи зменшується кількість відкритих контрактів?")}</strong></p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <h5 className="font-bold text-emerald-300 mb-2 flex gap-1.5 items-center"><CheckCircle2 className="w-3.5 h-3.5" />{' '}{tr("OI допомагає оцінити")}</h5>
          <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
            <li>{tr("Як змінюється кількість відкритих контрактів.")}</li>
            <li>{tr("Чи супроводжується ціновий рух появою або закриттям позицій.")}</li>
            <li>{tr("Чи є підстави перевірити припущення про продовження або виснаження імпульсу.")}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
          <h5 className="font-bold text-rose-300 mb-2 flex gap-1.5 items-center"><ShieldAlert className="w-3.5 h-3.5" />{' '}{tr("OI сам по собі не показує")}</h5>
          <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
            <li>{tr("Хто саме домінує — лонги чи шорти.")}</li>
            <li>{tr("Де точно розташовані ліквідації.")}</li>
            <li>{tr("Хто з учасників сильніший.")}</li>
            <li>{tr("Скільки нових грошей фактично зайшло на біржу.")}</li>
          </ul>
        </div>
      </div>
      <p className="text-slate-400 leading-relaxed">{tr("Поєднуй OI з кластерами, торговим обсягом, ліквідаціями, funding rate, стаканом і рівнями.")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {comparisons.map(item => <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3" key={item.title}>
          <h6 className="font-bold text-sky-300 mb-1.5">{tr(item.title)}</h6><p className="text-[11px] text-slate-400 leading-relaxed">{tr(item.body)}</p>
        </div>)}
      </div>
    </Section>

    <Section number={3} title={tr("Як застосовують OI в криптотрейдингу")}>
      <div className="space-y-2.5">
        {OI_MARKET_SCENARIOS.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
          <h5 className="font-extrabold text-white text-sm">{tr(item.title)}</h5>
          <ul className="list-disc pl-4 space-y-1 text-slate-300">{item.conditions.map((v, i) => <li key={i}>{tr(v)}</li>)}</ul>
          <p className="text-slate-200 leading-relaxed"><strong className="text-indigo-300">{tr("Що це означає:")}{' '}</strong>{tr(item.meaning)}</p>
          <p className="text-slate-400 leading-relaxed"><strong className="text-sky-300">{tr("Що перевірити:")}{' '}</strong>{tr(item.action)}</p>
        </article>)}
      </div>
    </Section>

    <Section number={4} title={tr("Поширена помилка: OI як готовий сигнал на вхід")}>
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
        <div className="space-y-2">
          <strong className="text-amber-200">{tr("OI — це контекст, а не точка входу.")}</strong>
          <p className="leading-relaxed">{tr("Він допомагає поставити запитання: чи можна довіряти руху, чи це імпульс або винос, чи ринок перевантажений відкритими позиціями?")}</p>
          <p className="text-slate-400 leading-relaxed">{tr("Для рішення про угоду потрібні рівень, реакція ціни, ліквідність, обсяг та план ризику.")}</p>
        </div>
      </div>
    </Section>

    <Section number={5} title={tr("Практика для скальпінгу та внутрішньоденної торгівлі")}>
      <p className="leading-relaxed text-slate-400">{tr("Особливо корисно аналізувати OI поруч із рівнями, імпульсами й щільностями заявок.")}</p>
      <div className="space-y-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <h5 className="text-cyan-300 font-bold mb-1.5 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />{' '}{tr("Перед входом")}</h5>
          <p className="leading-relaxed">{tr("Знайди рівень → дочекайся реакції → перевір OI. Зростання OI разом із рухом може підтримувати ідею продовження; падіння OI на імпульсі може свідчити про винос і вимагати швидшої оцінки фіксації.")}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <h5 className="text-cyan-300 font-bold mb-1.5 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" />{' '}{tr("Під час імпульсу")}</h5>
          <p className="leading-relaxed">{tr("Свічка стрімко рухається: стеж за OI. Його зростання може вказувати на нарощування позицій; зниження — на їхнє закриття. Рішення про утримання або вихід підтверджуй реакцією ціни, а не однією цифрою.")}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <h5 className="text-cyan-300 font-bold mb-1.5 flex items-center gap-1.5"><LineChart className="w-3.5 h-3.5" />{' '}{tr("Біля максимумів і мінімумів")}</h5>
          <p className="leading-relaxed">{tr("Різке зростання OI може свідчити про накопичення позицій натовпом. Перевір, чи не формується пастка, розворот або наступний винос; не відкривай контртрендову угоду лише за високим OI.")}</p>
        </div>
      </div>
    </Section>

    <Section number={6} title={tr("Де дивитися Open Interest")}>
      <p className="leading-relaxed">{tr("У матеріалі згадані")}{' '}<strong className="text-white">TradingView</strong>{' '}{tr("(доступність OI залежить від інструмента),")}{' '}<strong className="text-white">Coinglass</strong>{' '}{tr("і")}{' '}<strong className="text-white">CryptoQuant</strong>.</p>
      <p className="text-slate-400 leading-relaxed">{tr("Порівнюй дані одного ринку й типу контракту: показники різних бірж і агрегаторів можуть відрізнятися за одиницями та охопленням.")}</p>
    </Section>

    <Section number={7} title={tr("Коротка формула — запам’ятай")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-start gap-2">
          <ArrowUp className="w-4 h-4 shrink-0 text-emerald-400" />
          <p className="leading-relaxed"><strong className="text-emerald-200">{tr("OI зростає")}</strong>{' '}{tr("→ відкритих контрактів стає більше → рух може продовжитися, але напрямок сам OI не визначає.")}</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 flex items-start gap-2">
          <ArrowDown className="w-4 h-4 shrink-0 text-rose-400" />
          <p className="leading-relaxed"><strong className="text-rose-200">{tr("OI падає")}</strong>{' '}{tr("→ відкритих контрактів стає менше → рух може виснажуватися, але розворот не гарантований.")}</p>
        </div>
      </div>
    </Section>

    <footer className="flex items-start gap-2 border-t border-slate-800 pt-3 text-[11px] text-slate-500 leading-relaxed">
      <CircleHelp className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{tr("Матеріал структуровано на основі наданого опису. Типові інтерпретації OI є гіпотезами, а не доведеними сигналами чи індивідуальною інвестиційною рекомендацією.")}</span>
    </footer>
  </div>;
}
