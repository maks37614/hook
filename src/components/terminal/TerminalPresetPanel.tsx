import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, Star, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import type { MarketCoin, TerminalChartBlock, TerminalSavedPreset, Timeframe } from '../../types';
import type { MarketCoinSnapshot, MarketSelection } from '../../utils/marketCoinLoader';
import { MARKET_PRESETS, coinMarketKey, selectMarketPresetCoins, type TerminalMarketPreset } from '../../utils/marketPresets';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';

interface Props {
  blocks: TerminalChartBlock[];
  watchlist: string[];
  presets: TerminalSavedPreset[];
  selection: MarketSelection;
  limit: number;
  timeframe: Timeframe;
  activePreset: TerminalMarketPreset | null;
  autoUpdate: boolean;
  snapshot: MarketCoinSnapshot;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onActivePresetChange: (preset: TerminalMarketPreset | null) => void;
  onApplyCoins: (coins: MarketCoin[]) => void;
  onSavePreset: (name: string, blocks: TerminalChartBlock[]) => void;
  onLoadPreset: (preset: TerminalSavedPreset) => void;
  onDeletePreset: (id: string) => void;
  syncError: boolean;
  onRetrySync: () => void;
  signedIn: boolean;
}

const ICONS = { active: Activity, top_gainers: TrendingUp, top_losers: TrendingDown, near_highs: ChevronUp, near_lows: ChevronDown };
const controlClass = 'rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500';

export function TerminalPresetPanel({ blocks, watchlist, presets, selection, limit, timeframe, activePreset, autoUpdate, snapshot, loading, error, onRefresh,
  onActivePresetChange, onApplyCoins, onSavePreset, onLoadPreset, onDeletePreset, syncError, onRetrySync, signedIn }: Props) {
  const { language } = useLanguage();
  const tr = (value: string) => translatePhrase(language, value);
  const { exchange, marketType } = selection;
  const [showPresets, setShowPresets] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState<'favorites' | 'workspace'>('favorites');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const applyRef = useRef(onApplyCoins);
  applyRef.current = onApplyCoins;

  const readyCoins = useMemo(() => Object.fromEntries(MARKET_PRESETS.map(preset =>
    [preset.id, selectMarketPresetCoins(snapshot.coins, preset.id, selection, limit)])) as Record<TerminalMarketPreset, MarketCoin[]>,
  [snapshot.coins, selection, limit]);

  useEffect(() => {
    if (activePreset && autoUpdate && !error && readyCoins[activePreset].length) {
      applyRef.current(readyCoins[activePreset]);
    }
  }, [activePreset, autoUpdate, readyCoins, error]);

  const chooseReadyPreset = (id: TerminalMarketPreset) => {
    if (error || !readyCoins[id].length) {
      setMessage(error ? tr(error) : tr('За цими фільтрами немає монет. Змініть біржу або ринок.'));
      return;
    }
    setMessage(null);
    onActivePresetChange(id);
    onApplyCoins(readyCoins[id]);
  };

  // Favorites store symbols; select one explicit exchange/market for each symbol.
  const favoriteBlocks = useMemo(() => [...new Set(watchlist)].map(symbol => {
    const preferredExchange = exchange === 'all' ? 'binance' : exchange;
    const preferredMarket = marketType === 'all' ? 'futures' : marketType;
    const matches = snapshot.coins.filter(coin => coin.symbol === symbol
      && (exchange === 'all' || coin.exchange === exchange) && (marketType === 'all' || coin.marketType === marketType));
    const coin = matches.find(coin => coin.exchange === preferredExchange && coin.marketType === preferredMarket) || matches[0];
    const existing = blocks.find(block => block.symbol === symbol && block.exchange === preferredExchange && block.marketType === preferredMarket);
    if (!coin && !existing) return [];
    const item = coin || existing!;
    return [{ id: `favorite-${coinMarketKey(item)}`, symbol: item.symbol, baseAsset: item.baseAsset, quoteAsset: item.quoteAsset,
      exchange: item.exchange, marketType: item.marketType, timeframe, mode: 'tradingview' as const, colSpan: 1 as const }];
  }).flat(), [watchlist, snapshot.coins, exchange, marketType, blocks, timeframe]);
  const candidates = source === 'favorites' ? favoriteBlocks : blocks;
  const selectedBlocks = candidates.filter(block => selectedKeys.includes(block.id));

  const openForm = useCallback((nextSource: 'favorites' | 'workspace') => {
    onActivePresetChange(null);
    setSource(nextSource);
    setSelectedKeys((nextSource === 'favorites' ? favoriteBlocks : blocks).slice(0, 36).map(block => block.id));
    setName('');
    setFormError(null);
    setShowForm(true);
    setShowPresets(true);
  }, [favoriteBlocks, blocks, onActivePresetChange]);

  const savePreset = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) { setFormError(tr('Введіть назву пресету.')); return; }
    if (presets.some(preset => preset.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      setFormError(tr('Пресет з такою назвою вже є. Виберіть іншу назву.')); return;
    }
    if (!selectedBlocks.length) { setFormError(tr('Виберіть хоча б одну монету.')); return; }
    if (selectedBlocks.length > 36) { setFormError(tr('У пресеті може бути до 36 графіків.')); return; }
    if (presets.length >= 30) { setFormError(tr('Можна зберегти до 30 пресетів. Видаліть зайвий пресет.')); return; }
    onSavePreset(cleanName, selectedBlocks);
    setShowForm(false);
    setMessage(tr(`Пресет «${cleanName}» збережено (${selectedBlocks.length} монет).`));
  };

  return <section aria-label={tr("Пресети монет термінала")} className="bg-slate-950/90 p-2 text-xs">
    <div className="flex items-start gap-1.5">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
        {MARKET_PRESETS.map(preset => {
          const Icon = ICONS[preset.id];
          return <button key={preset.id} type="button" title={tr(preset.description)} aria-pressed={activePreset === preset.id}
            disabled={loading && !snapshot.coins.length} onClick={() => chooseReadyPreset(preset.id)}
            className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${activePreset === preset.id
              ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/50 hover:text-white'}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{tr(preset.label)}</span>
          </button>;
        })}
        <button type="button" aria-expanded={showPresets} onClick={() => setShowPresets(value => !value)}
          className="flex min-w-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          <Star className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 truncate">{tr('Мої пресети')}{presets.length > 0 && ` (${presets.length})`}</span>
          {showPresets ? <ChevronUp className="ml-auto h-3 w-3 shrink-0" /> : <ChevronDown className="ml-auto h-3 w-3 shrink-0" />}
        </button>
      </div>
      <button type="button" aria-label={tr("Оновити монети пресетів")} title={tr("Оновити монети пресетів")} disabled={loading} onClick={onRefresh}
        className="shrink-0 rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-40">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      </button>
    </div>
    {(error || snapshot.warning) && <p role="status" className="mt-2 text-amber-300">{tr(error || snapshot.warning || '')}</p>}
    {message && <p role="status" className="mt-2 text-slate-300">{message}</p>}
    {showPresets && <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => openForm('favorites')} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white hover:bg-cyan-500">
          <Plus className="h-3.5 w-3.5" />{tr('Створити з обраних монет')}
        </button>
        <button type="button" onClick={() => openForm('workspace')} disabled={!blocks.length}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40">
          <Save className="h-3.5 w-3.5" />{tr('Зберегти монети термінала')}
        </button>
        {!signedIn && <span className="text-slate-500">{tr('Пресети зберігаються на цьому пристрої. Увійдіть для збереження у профілі.')}</span>}
      </div>
      {syncError && <p role="status" className="mt-2 text-amber-300">{tr('Не вдалося синхронізувати пресети.')} <button type="button" onClick={onRetrySync} className="underline hover:text-white">{tr('Повторити збереження')}</button></p>}
      {showForm && <form onSubmit={savePreset} className="mt-3 space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 text-slate-300">{tr('Назва')}
            <input aria-label={tr("Назва пресету")} value={name} onChange={event => setName(event.target.value)} maxLength={60}
              placeholder={tr("Наприклад, Мої альткоїни")} className={`${controlClass} w-full min-w-0 select-text`} />
          </label>
          <button type="button" aria-label={tr("Закрити створення пресету")} onClick={() => setShowForm(false)} className="p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-400">
          <span>{tr('Монети:')}</span>
          <button type="button" aria-pressed={source === 'favorites'} onClick={() => { setSource('favorites'); setSelectedKeys(favoriteBlocks.slice(0, 36).map(block => block.id)); }}
            className={`rounded-lg px-2 py-1 ${source === 'favorites' ? 'bg-amber-500/15 text-amber-300' : 'hover:bg-slate-800'}`}>{tr('Обрані монети')}</button>
          <button type="button" aria-pressed={source === 'workspace'} onClick={() => { setSource('workspace'); setSelectedKeys(blocks.slice(0, 36).map(block => block.id)); }}
            className={`rounded-lg px-2 py-1 ${source === 'workspace' ? 'bg-cyan-500/15 text-cyan-300' : 'hover:bg-slate-800'}`}>{tr('Поточні графіки')}</button>
          <button type="button" onClick={() => setSelectedKeys(candidates.slice(0, 36).map(block => block.id))} className="ml-auto hover:text-white">{tr('Вибрати всі')}</button>
          <button type="button" onClick={() => setSelectedKeys([])} className="hover:text-white">{tr('Зняти вибір')}</button>
        </div>
        {candidates.length ? <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto">
          {candidates.map(block => <label key={block.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-950/70 px-2 py-2 text-slate-300">
            <input type="checkbox" aria-label={tr(`Вибрати ${block.symbol} ${block.exchange} ${block.marketType}`)} checked={selectedKeys.includes(block.id)}
              onChange={event => { const checked = event.target.checked; setSelectedKeys(current => checked ? [...current, block.id] : current.filter(id => id !== block.id)); }} className="accent-cyan-500" />
            <span><strong>{block.symbol}</strong><span className="ml-1 text-[10px] text-slate-500">{block.exchange === 'binance' ? 'Binance' : 'Bybit'} · {block.marketType} · {block.timeframe}</span></span>
          </label>)}
        </div> : <p className="text-slate-400">{tr(source === 'favorites' ? 'Додайте монети до обраних у скрінері або виберіть поточні графіки. Для обраних монет мають бути доступні дані вибраної біржі та ринку.' : 'Додайте графіки до термінала.')}</p>}
        {formError && <p role="alert" className="text-rose-300">{formError}</p>}
        <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white hover:bg-cyan-500">
          <Save className="h-3.5 w-3.5" />{tr('Зберегти пресет')} ({selectedBlocks.length})
        </button>
      </form>}
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map(preset => <div key={preset.id} className="flex min-w-0 max-w-full items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
          <button type="button" title={preset.blocks.map(block => `${block.symbol} (${block.exchange} ${block.marketType})`).join(', ')}
            onClick={() => { onLoadPreset(preset); setMessage(tr(`Відкрито пресет «${preset.name}».`)); }} className="flex min-w-0 items-center gap-2 px-3 py-2 text-slate-200 hover:bg-slate-800">
            <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" /><span className="min-w-0 max-w-48 truncate">{preset.name}</span><span className="text-slate-500">{preset.blocks.length}</span>
          </button>
          <button type="button" aria-label={tr(`Видалити пресет ${preset.name}`)} title={tr("Видалити пресет")} onClick={() => { onDeletePreset(preset.id); setMessage(tr(`Пресет «${preset.name}» видалено.`)); }}
            className="shrink-0 border-l border-slate-700 p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>)}
        {!presets.length && !showForm && <p className="py-1 text-slate-500">{tr('Збережіть власний набір монет, щоб відкривати його одним натисканням.')}</p>}
      </div>
    </div>}
  </section>;
}
