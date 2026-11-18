import React, { useMemo } from 'react';
import type { ScannedCoin, ScreenerFilterState, FullEarlyScanSnapshot } from '../types';
import type { EarlyFormationCandidate } from '../utils/earlyFormations';
import { getVisibleEarlyFormations, type EarlyStageFilter } from '../utils/earlyFormationList';
import { EarlyFormationCard } from './EarlyFormationCard';
import { useLanguage } from '../context/LanguageContext';
import { interpolate, translatePhrase } from '../locales';
import { MarketDataFreshnessIcon } from './MarketDataFreshnessIcon';

interface Props {
  coins: ScannedCoin[];
  filters: ScreenerFilterState;
  stage?: EarlyStageFilter;
  loading: boolean;
  scanProgress?: FullEarlyScanSnapshot | null;
  onRetryScan?: () => void;
  onStopScan?: () => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenPriceAlert?: (coin: ScannedCoin) => void;
  onOpen: (coin: ScannedCoin, candidate: EarlyFormationCandidate) => void;
}

export function EarlyFormationsResults({
  coins, filters, stage = 'all', loading, scanProgress, onRetryScan, onStopScan, watchlist, onToggleWatchlist, onOpen,
  onSendMetaScalp, metaScalpBinding, onOpenPriceAlert,
}: Props) {
  const { language } = useLanguage();
  const tr = (phrase: string) => translatePhrase(language, phrase);
  const entries = useMemo(() => getVisibleEarlyFormations(coins, filters, stage), [coins, filters, stage]);
  const coinCount = new Set(entries.map(row =>
    [row.coin.exchange, row.coin.marketType, row.coin.symbol].join(':'))).size;
  const processed = scanProgress?.processed ?? 0;
  const total = scanProgress?.total ?? 0;
  const percentage = total > 0 ? Math.min(100, Math.floor(processed / total * 100)) : 0;
  const canStop = scanProgress?.status === 'loading' || scanProgress?.status === 'running';
  const isStopping = scanProgress?.status === 'stopping';
  const canRestart = !!scanProgress && ['completed', 'partial', 'stopped', 'failed'].includes(scanProgress.status);
  const issues = (scanProgress?.failed ?? 0) + (scanProgress?.missingSources.length ?? 0);

  return (
    <section className="space-y-3" aria-label={tr("Раннє виявлення W/M формацій")}>
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 space-y-1">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <strong className="text-xs text-amber-200">
            {interpolate(tr('Ранні W/M-сценарії: {{coins}} монет · {{count}} можливих формацій'), { coins: coinCount, count: entries.length })}
          </strong>
          <span className="text-[10px] text-slate-400">{tr('Потенційна → Формується · підтвердження перевіряє звичайний сканер')}</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-5">
          {tr('Лише попередні ознаки на закритих свічках. Другий екстремум і пробій ще не підтверджені. Рівні орієнтовні, не є торговими ордерами чи Telegram-сигналами. R:R враховує приблизно 0,1% витрат на кожен бік угоди; реальні комісії та прослизання можуть бути іншими. Якщо структура порушується, кандидат зникає з активного списку. Пошук охоплює доступні USDT-пари на вибраних біржах, ринках і таймфреймі. Недоступні джерела та свічки відображаються як неповне сканування.')}
        </p>
      </div>

      {scanProgress && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 space-y-2 text-xs"
          role="status" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-cyan-200">
              {tr(scanProgress.status === 'loading' ? 'Отримання списку USDT-пар…'
                : scanProgress.status === 'running' ? 'Повний пошук W/M триває'
                : scanProgress.status === 'completed' ? 'Повний пошук завершено'
                : scanProgress.status === 'partial' ? 'Частковий результат: не всі пари перевірено'
                : scanProgress.status === 'stopping' ? 'Зупиняємо пошук…'
                : scanProgress.status === 'stopped' ? 'Пошук зупинено'
                : 'Повний пошук не вдалося виконати')}
            </strong>
            <div className="flex items-center gap-1.5">
              {onStopScan && (canStop || isStopping) && (
                <button type="button" onClick={onStopScan} disabled={isStopping}
                  className="rounded-md border border-rose-700/80 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30 disabled:opacity-60 disabled:cursor-wait">
                  {tr(isStopping ? 'Зупиняється…' : 'Зупинити пошук')}
                </button>
              )}
              {onRetryScan && canRestart && (
                <button type="button" onClick={onRetryScan}
                  className="rounded-md border border-cyan-700 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-900/30">
                  {tr('Пересканувати')}
                </button>
              )}
            </div>
          </div>
          <div className="text-slate-300 font-mono">
            {total
              ? interpolate(tr('{{processed}} / {{total}} пар · {{percentage}}% · перевірено {{checked}} · без історії {{skipped}} · помилок {{failed}}'), { processed, total, percentage, checked: scanProgress.checked, skipped: scanProgress.skipped, failed: scanProgress.failed })
              : tr('Очікування списку торгових пар від бірж')}
          </div>
          {total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden"
              role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={percentage} aria-label={tr("Хід повного пошуку W/M")}>
              <div className="h-full bg-cyan-500 transition-[width] duration-300"
                style={{ width: `${percentage}%` }} />
            </div>
          )}
          {(scanProgress.message || issues > 0) && (
            <div className="flex justify-end">
              <MarketDataFreshnessIcon
                label={tr('Частина ринкових даних недоступна; результат не можна вважати повним.')}
                kind="partial" />
            </div>
          )}
        </div>
      )}

      {scanProgress?.status === 'failed' && !entries.length ? (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-5 text-xs text-rose-200">
          {tr('Повне сканування не завершено. Нуль знайдених W/M не означає, що їх немає.')}
        </div>
      ) : loading && !entries.length ? (
        <div className="rounded-xl border border-slate-800 p-8 text-sm text-slate-400 text-center">
          {tr('Шукаємо ранні W/M-формації…')}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-sm text-slate-400 text-center space-y-2">
          <p>{scanProgress?.status === 'partial' || scanProgress?.status === 'stopped'
            ? tr('У перевіреній частині ринку можливих W/M-формацій не знайдено.')
            : tr('За поточними фільтрами можливих W/M-формацій не знайдено.')}</p>
          <p className="text-xs">
            {tr('Спробуйте вибрати «Усі W/M» і стадію «Усі», або зменшити мінімальний обсяг торгів. Сканер перевіряє доступні USDT-пари і лише закриті свічки.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[2200px]:grid-cols-7 min-[2800px]:grid-cols-8 gap-3 sm:gap-4">
          {entries.map(({ coin, candidate }) => (
            <EarlyFormationCard
              key={[coin.exchange, coin.marketType, candidate.id, coin.timeframe].join(':')}
              coin={coin}
              candidate={candidate}
              isWatchlisted={watchlist.includes(coin.symbol)}
              onToggleWatchlist={onToggleWatchlist}
              onOpen={onOpen}
              onSendMetaScalp={onSendMetaScalp}
              metaScalpBinding={metaScalpBinding}
              onOpenPriceAlert={onOpenPriceAlert}
            />
          ))}
        </div>
      )}
    </section>
  );
}
