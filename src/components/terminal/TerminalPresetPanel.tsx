import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase, type LocaleParams } from '../../locales';
import { MarketDataFreshnessIcon } from '../MarketDataFreshnessIcon';
import { Activity, BarChart3, ChevronDown, ChevronUp, Download, Plus, Save, ScanLine, Star, Trash2, TrendingDown, TrendingUp, Upload, X } from 'lucide-react';
import type { MarketCoin, ScannedCoin, TerminalChartBlock, TerminalSavedPreset, Timeframe } from '../../types';
import type { MarketCoinSnapshot, MarketSelection } from '../../utils/marketCoinLoader';
import { MARKET_PRESETS, coinMarketKey, selectFormationPresetCoins, selectMarketPresetCoins, type TerminalMarketPreset, type TerminalPresetCoin } from '../../utils/marketPresets';
import { blocksForSavedFavorites, MAX_TERMINAL_CHARTS, toggleTerminalPresetCoin } from '../../utils/terminalPresets';
import { AddChartModal } from './AddChartModal';

interface Props {
  blocks: TerminalChartBlock[];
  watchlist: string[];
  presets: TerminalSavedPreset[];
  /** The same all-markets data fed to the Terminal's + button. */
  pickerCoins: ScannedCoin[];
  pickerFormationCoins: ScannedCoin[];
  /** Matches the trader-visible Formations page (including early W/M). */
  formationCoins: readonly ScannedCoin[];
  onRequestFormationScan?: () => boolean;
  /** Retry the existing shared public quote refresh when a preset was clicked before quotes arrived. */
  onRequestMarketRefresh?: () => void;
  onRequestMinuteRefresh?: () => void;
  minuteReady?: boolean;
  minuteError?: string | null;
  formationScanStatus?: 'idle' | 'loading' | 'ready' | 'busy' | 'failed';
  selection: MarketSelection;
  timeframe: Timeframe;
  activePreset: TerminalMarketPreset | null;
  autoUpdate: boolean;
  /** Panel stays mounted while hidden so automatic refresh can continue. */
  menuOpen: boolean;
  snapshot: MarketCoinSnapshot;
  loading: boolean;
  error: string | null;
  onActivePresetChange: (preset: TerminalMarketPreset | null) => void;
  onPresetChosen?: () => void;
  onApplyCoins: (coins: TerminalPresetCoin[], preset: TerminalMarketPreset) => void;
  onSavePreset: (name: string, blocks: TerminalChartBlock[]) => void;
  onLoadPreset: (preset: TerminalSavedPreset) => void;
  onDeletePreset: (id: string) => void;
  syncError: boolean;
  onRetrySync: () => void;
  onDownloadLocalBackup: () => void;
  onImportWorkspaceBackup: (json: string) => boolean;
  signedIn: boolean;
}

const ICONS = { active: Activity, formations: ScanLine, av: BarChart3, av_1m: BarChart3, top_gainers: TrendingUp, top_losers: TrendingDown, near_highs: ChevronUp, near_lows: ChevronDown };
const controlClass = 'rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500';

export function TerminalPresetPanel({ blocks, watchlist, presets, pickerCoins, pickerFormationCoins, formationCoins, onRequestFormationScan, onRequestMarketRefresh, onRequestMinuteRefresh, minuteReady = false, minuteError = null, formationScanStatus = 'idle', selection, timeframe, activePreset, autoUpdate, menuOpen, snapshot, loading, error,
  onActivePresetChange, onPresetChosen, onApplyCoins, onSavePreset, onLoadPreset, onDeletePreset, syncError, onRetrySync, onDownloadLocalBackup, onImportWorkspaceBackup, signedIn }: Props) {
  const { language, t } = useLanguage();
  const [showPresets, setShowPresets] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState<'favorites' | 'workspace'>('favorites');
  const [selectedBlocks, setSelectedBlocks] = useState<TerminalChartBlock[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ key: string; params?: LocaleParams } | { text: string } | null>(null);
  const [pendingFormationPreset, setPendingFormationPreset] = useState(false);
  const [pendingMarketPreset, setPendingMarketPreset] = useState<TerminalMarketPreset | null>(null);
  const pendingQuoteSnapshot = useRef(snapshot);
  const applyRef = useRef(onApplyCoins);
  applyRef.current = onApplyCoins;

  const readyCoins = useMemo(() => {
    const result = Object.fromEntries(MARKET_PRESETS.map(preset =>
      [preset.id, [] as TerminalPresetCoin[]])) as Record<TerminalMarketPreset, TerminalPresetCoin[]>;
    // The hidden panel only needs the active auto-updating category, not five
    // full-market filter + sort passes every 30 seconds.
    const ids = menuOpen ? MARKET_PRESETS.map(preset => preset.id)
      : activePreset && autoUpdate ? [activePreset] : [];
    for (const id of ids) {
      result[id] = id === 'formations'
        ? selectFormationPresetCoins(formationCoins)
        : selectMarketPresetCoins(snapshot.coins, id, selection, Number.POSITIVE_INFINITY);
    }
    return result;
  }, [snapshot.coins, formationCoins, selection, menuOpen, activePreset, autoUpdate]);

  useEffect(() => {
    // Do not replace live charts using partial/stale exchange source snapshots.
    if (activePreset && autoUpdate && !pendingFormationPreset && readyCoins[activePreset].length
        && (activePreset === 'formations' || (!error && !snapshot.warning))) {
      applyRef.current(readyCoins[activePreset], activePreset);
    }
  }, [activePreset, autoUpdate, readyCoins, error, snapshot.warning]);

  // The active category is kept while a one-shot scan completes. This also
  // applies the result when periodic preset updates are disabled by the user.
  useEffect(() => {
    if (!pendingFormationPreset || activePreset !== 'formations') return;
    if (readyCoins.formations.length) {
      setPendingFormationPreset(false);
      setMessage(null);
      applyRef.current(readyCoins.formations, 'formations');
      onPresetChosen?.();
      return;
    }
    if (formationScanStatus === 'busy' || formationScanStatus === 'failed' || formationScanStatus === 'ready') {
      setPendingFormationPreset(false);
      setMessage({ text: formationScanStatus === 'busy'
        ? 'Сканер формацій зайнятий. Спробуйте знову пізніше.'
        : formationScanStatus === 'failed'
          ? 'Не вдалося завантажити формації. Спробуйте знову.'
          : 'У списку Формацій немає монет за поточними фільтрами.' });
    }
  }, [pendingFormationPreset, activePreset, readyCoins.formations, formationScanStatus, onPresetChosen]);

  const chooseReadyPreset = (id: TerminalMarketPreset) => {
    setPendingFormationPreset(false);
    setPendingMarketPreset(null);
    if (id === 'formations' && !readyCoins.formations.length && onRequestFormationScan?.()) {
      setMessage({ text: 'Завантаження монет зі сторінки Формацій…' });
      setPendingFormationPreset(true);
      onActivePresetChange(id);
      return;
    }
    if (id === 'av_1m' && !readyCoins[id].length) {
      if (minuteReady && !minuteError) {
        setMessage({ text: 'Немає перевірених монет з AV 1m від 200K USDT у доступній вибірці.' });
        return;
      }
      setPendingMarketPreset(id);
      pendingQuoteSnapshot.current = snapshot;
      setMessage({ text: 'Шукаємо обсяг за останню завершену хвилину…' });
      onRequestMinuteRefresh?.();
      return;
    }
    if (id !== 'formations' && !readyCoins[id].length) {
      // A transient empty snapshot is not evidence of an empty exchange. Keep
      // existing charts intact and apply this exact preset when quotes return.
      pendingQuoteSnapshot.current = snapshot;
      setPendingMarketPreset(id);
      setMessage({ text: translatePhrase(language, 'Оновлюємо ринкові котирування для пресету…') });
      onRequestMarketRefresh?.();
      return;
    }
    if (!readyCoins[id].length) {
      setMessage(id === 'formations'
        ? { text: translatePhrase(language, 'У списку Формацій немає монет за поточними фільтрами.') }
        : error ? { text: error } : { key: 'terminal.presets.emptySelection' });
      return;
    }
    setMessage(null);
    onActivePresetChange(id);
    onApplyCoins(readyCoins[id], id);
    onPresetChosen?.();
  };

  useEffect(() => {
    if (!pendingMarketPreset) return;
    const matched = readyCoins[pendingMarketPreset];
    if (matched.length) {
      setPendingMarketPreset(null);
      setMessage(null);
      onActivePresetChange(pendingMarketPreset);
      applyRef.current(matched, pendingMarketPreset);
      onPresetChosen?.();
      return;
    }
    // Wait for a *new* quote snapshot or an explicit error before deciding
    // that a selected exchange really has no usable ticker rows.
    if (pendingMarketPreset === 'av_1m') {
      if (minuteReady) {
        setPendingMarketPreset(null);
        setMessage({ text: minuteError || 'Немає перевірених монет з AV 1m від 200K USDT у доступній вибірці.' });
      }
      return;
    }
    if (error || snapshot !== pendingQuoteSnapshot.current) {
      setPendingMarketPreset(null);
      setMessage(error ? { text: error } : { text: translatePhrase(language, 'Для вибраної біржі та ринку зараз немає доступних котирувань. Перевірте фільтри або повторіть.') });
    }
  }, [pendingMarketPreset, readyCoins, error, snapshot, language, minuteReady, minuteError, onActivePresetChange, onPresetChosen]);

  // Favorite keys include an exact exchange/market/symbol identity.
  // Index once per quote refresh instead of scanning the full exchange universe
  // for every favorite (some users have hundreds of saved instruments).
  const favoritesQuotesBySymbol = useMemo(() => {
    const index = new Map<string, MarketCoin[]>();
    for (const coin of snapshot.coins) {
      const group = index.get(coin.symbol);
      if (group) group.push(coin);
      else index.set(coin.symbol, [coin]);
    }
    return index;
  }, [snapshot.coins]);
  const workspaceBlocksByMarket = useMemo(() =>
    new Map(blocks.map(block => [coinMarketKey(block), block] as const)), [blocks]);
  // A favorite is an exact exchange/market pair, even if its live quote is
  // absent from this partial snapshot. Never silently drop saved preset coins.
  const favoriteBlocks = useMemo(() => blocksForSavedFavorites(
    watchlist, favoritesQuotesBySymbol, workspaceBlocksByMarket, timeframe,
  ), [watchlist, favoritesQuotesBySymbol, workspaceBlocksByMarket, timeframe]);
  const candidates = source === 'favorites' ? favoriteBlocks : blocks;
  const selectedMarketKeys = selectedBlocks.map(coinMarketKey);
  const selectedMarketSet = new Set(selectedMarketKeys);

  const openForm = useCallback((nextSource: 'favorites' | 'workspace') => {
    // Opening a draft is not a workspace change. Do not disable a running
    // market preset just because the user wants to save their current view.
    setSource(nextSource);
    const seen = new Set<string>();
    setSelectedBlocks((nextSource === 'favorites' ? favoriteBlocks : blocks)
      .filter(block => {
        const key = coinMarketKey(block);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, MAX_TERMINAL_CHARTS));
    setPickerOpen(false);
    setName('');
    setFormError(null);
    setShowForm(true);
    setShowPresets(true);
  }, [favoriteBlocks, blocks]);

  const selectAllVisible = () => {
    setSelectedBlocks(current => {
      const known = new Set(current.map(coinMarketKey));
      const additions = candidates.filter(block => {
        const key = coinMarketKey(block);
        if (known.has(key)) return false;
        known.add(key);
        return true;
      }).slice(0, MAX_TERMINAL_CHARTS - current.length);
      return additions.length ? [...current, ...additions] : current;
    });
    setFormError(null);
  };

  const chooseMarketFromPicker: React.ComponentProps<typeof AddChartModal>['onAddChart'] = (coin, tf, formationId) => {
    // Exactly the same market picker as Terminal +, but no live chart is created.
    setSelectedBlocks(current => toggleTerminalPresetCoin(current, coin, tf, formationId));
    setFormError(null);
  };

  const handleBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('JSON-копія перевищує 2 МБ.');
      const restored = onImportWorkspaceBackup(await file.text());
      if (restored) {
        setShowForm(false);
        setMessage({ key: 'terminal.presets.backupRestored' });
      }
    } catch (error) {
      setMessage(error instanceof Error
        ? { text: error.message }
        : { key: 'terminal.presets.importFailed' });
    }
  };

  const savePreset = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) { setFormError('Введіть назву пресету.'); return; }
    if (presets.some(preset => preset.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      setFormError('Пресет з такою назвою вже є. Виберіть іншу назву.'); return;
    }
    if (!selectedBlocks.length) { setFormError('Виберіть хоча б одну монету.'); return; }
    if (selectedBlocks.length > 50) { setFormError('У пресеті може бути до 50 графіків.'); return; }
    if (presets.length >= 30) { setFormError('Можна зберегти до 30 пресетів. Видаліть зайвий пресет.'); return; }
    onSavePreset(cleanName, selectedBlocks);
    setPickerOpen(false);
    setShowForm(false);
    setMessage({ key: 'terminal.presets.saved', params: { name: cleanName, count: selectedBlocks.length } });
  };

  return <section aria-label={t('terminal.drawer.presetPanelAria')} className="bg-slate-950/90 p-2 text-xs">
    <div className="grid grid-cols-2 gap-1.5">
        {MARKET_PRESETS.map(preset => {
          const Icon = ICONS[preset.id];
          return <button key={preset.id} type="button" title={translatePhrase(language, preset.description)} aria-pressed={activePreset === preset.id}
            disabled={preset.id !== 'formations' && loading && !snapshot.coins.length} onClick={() => chooseReadyPreset(preset.id)}
            className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${activePreset === preset.id
              ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/50 hover:text-white'}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{preset.id === 'formations' ? t('patterns') : translatePhrase(language, preset.label)}</span>
          </button>;
        })}
        <button type="button" aria-expanded={showPresets} onClick={() => setShowPresets(value => !value)}
          className="flex min-w-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          <Star className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 truncate">{translatePhrase(language, 'Мої пресети')}{presets.length > 0 && ` (${presets.length})`}</span>
          {showPresets ? <ChevronUp className="ml-auto h-3 w-3 shrink-0" /> : <ChevronDown className="ml-auto h-3 w-3 shrink-0" />}
        </button>
    </div>
    {(snapshot.warning || (error && snapshot.coins.length > 0)) && (
      <div className="mt-1 flex justify-end">
        <MarketDataFreshnessIcon
          label={t('screener.main.staleData')}
          kind={error ? 'refresh-failed' : 'partial'} />
      </div>
    )}
    {error && snapshot.coins.length === 0 && (
      <p role="alert" className="mt-2 text-amber-300">{translatePhrase(language, error)}</p>
    )}
    {message && <p role="status" className="mt-2 text-slate-300">{'key' in message ? t(message.key, message.params) : translatePhrase(language, message.text)}</p>}
    {showPresets && <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => openForm('favorites')} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white hover:bg-cyan-500">
          <Plus className="h-3.5 w-3.5" />{t('terminal.drawer.presetsFromFavorites')}
        </button>
        <button type="button" onClick={() => openForm('workspace')} disabled={!blocks.length}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40">
          <Save className="h-3.5 w-3.5" />{t('terminal.drawer.presetsFromWorkspace')}
        </button>
        <button type="button" onClick={onDownloadLocalBackup}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800">
          <Download className="h-3.5 w-3.5" />{t('terminal.drawer.presetsExport')}
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800 focus-within:ring-2 focus-within:ring-cyan-500">
          <Upload className="h-3.5 w-3.5" />{t('terminal.drawer.presetsImport')}
          <input type="file" accept=".json,application/json" aria-label={t('terminal.drawer.presetsImportAria')}
            className="sr-only" onChange={event => { void handleBackupFile(event); }} />
        </label>
        {!signedIn && <span className="text-slate-500">{t('terminal.drawer.presetsGuest')}</span>}
      </div>
      {syncError && (
        <p role="status" className="mt-2 text-amber-300">
          {t('terminal.drawer.syncPresetFailed')}
          {' '}
          <button type="button" onClick={onRetrySync} className="underline hover:text-white">{t('terminal.drawer.syncRetry')}</button>
        </p>
      )}
      {showForm && <form onSubmit={savePreset} className="mt-3 space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 text-slate-300">{t('terminal.drawer.presetName')}
            <input aria-label={t('terminal.drawer.presetNameAria')} value={name} onChange={event => setName(event.target.value)} maxLength={60}
              placeholder={t('terminal.drawer.presetNameExample')} className={`${controlClass} w-full min-w-0 select-text`} />
          </label>
          <button type="button" aria-label={t('terminal.drawer.presetClose')} onClick={() => { setPickerOpen(false); setShowForm(false); }} className="p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-400">
          <span>{t('terminal.drawer.presetCoinsLabel')}</span>
          <button type="button" onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1.5 font-semibold text-cyan-200 hover:bg-cyan-500/25">
            <Plus className="h-3.5 w-3.5" />
            {({ uk: 'Додати монети зі списку +', en: 'Add coins from + list', pl: 'Dodaj monety z listy +', ru: 'Добавить монеты из списка +' } as const)[language]}
          </button>
          <span className="font-semibold text-cyan-300">{selectedBlocks.length}/{MAX_TERMINAL_CHARTS}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-slate-400">
          <button type="button" aria-pressed={source === 'favorites'} onClick={() => setSource('favorites')}
            className={`rounded-lg px-2 py-1 ${source === 'favorites' ? 'bg-amber-500/15 text-amber-300' : 'hover:bg-slate-800'}`}>{t('terminal.drawer.presetFavorites')}</button>
          <button type="button" aria-pressed={source === 'workspace'} onClick={() => setSource('workspace')}
            className={`rounded-lg px-2 py-1 ${source === 'workspace' ? 'bg-cyan-500/15 text-cyan-300' : 'hover:bg-slate-800'}`}>{t('terminal.drawer.presetCurrent')}</button>
          <button type="button" onClick={selectAllVisible} className="ml-auto hover:text-white">{t('terminal.drawer.presetSelectAll')}</button>
          <button type="button" onClick={() => { setSelectedBlocks([]); setFormError(null); }} className="hover:text-white">{t('terminal.drawer.presetClearSelection')}</button>
        </div>
        {candidates.length ? <div className="grid max-h-32 grid-cols-1 gap-1 overflow-y-auto">
          {candidates.map(block => <label key={block.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-950/70 px-2 py-2 text-slate-300">
            <input type="checkbox" aria-label={t("terminal.presets.selectCoin", { symbol: block.symbol, exchange: block.exchange, marketType: block.marketType })}
              checked={selectedMarketSet.has(coinMarketKey(block))}
              disabled={!selectedMarketSet.has(coinMarketKey(block)) && selectedBlocks.length >= MAX_TERMINAL_CHARTS}
              onChange={event => {
                const key = coinMarketKey(block);
                const checked = event.target.checked;
                setSelectedBlocks(current => checked
                  ? current.length < MAX_TERMINAL_CHARTS && !current.some(item => coinMarketKey(item) === key) ? [...current, block] : current
                  : current.filter(item => coinMarketKey(item) !== key));
                setFormError(null);
              }} className="accent-cyan-500" />
            <span><strong data-no-translate>{block.symbol}</strong><span className="ml-1 text-[10px] text-slate-500">{block.exchange === 'binance' ? 'Binance' : 'Bybit'} · {block.marketType} · {block.timeframe}</span></span>
          </label>)}
        </div> : <p className="text-slate-400">{t(source === 'favorites' ? 'terminal.drawer.presetNoFavorites' : 'terminal.drawer.presetNoCharts')}</p>}
        {selectedBlocks.length > 0 && <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-950/40 p-2"
          aria-label={({ uk: 'Обрані монети пресета', en: 'Selected preset coins', pl: 'Wybrane monety presetu', ru: 'Выбранные монеты пресета' } as const)[language]}>
          {selectedBlocks.map(block => <div key={coinMarketKey(block)} className="flex min-w-0 items-center justify-between gap-2 text-slate-300">
            <span className="min-w-0 truncate"><strong data-no-translate>{block.symbol}</strong> <span className="text-[10px] text-slate-500">{block.exchange} · {block.marketType} · {block.timeframe}</span></span>
            <button type="button" aria-label={`${t('terminal.drawer.presetClearSelection')}: ${block.symbol} ${block.exchange} ${block.marketType}`}
              onClick={() => setSelectedBlocks(current => current.filter(item => coinMarketKey(item) !== coinMarketKey(block)))}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><X className="h-3 w-3" /></button>
          </div>)}
        </div>}
        {formError && <p role="alert" className="text-rose-300">{translatePhrase(language, formError)}</p>}
        <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white hover:bg-cyan-500">
          <Save className="h-3.5 w-3.5" />{t('terminal.presets.saveCount', { count: selectedBlocks.length })}
        </button>
      </form>}
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map(preset => <div key={preset.id} className="flex min-w-0 max-w-full items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
          <button type="button" title={preset.blocks.map(block => `${block.symbol} (${block.exchange} ${block.marketType})`).join(', ')}
            onClick={() => { onLoadPreset(preset); setMessage({ key: 'terminal.presets.opened', params: { name: preset.name } }); onPresetChosen?.(); }} className="flex min-w-0 items-center gap-2 px-3 py-2 text-slate-200 hover:bg-slate-800">
            <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" /><span className="min-w-0 max-w-48 truncate">{preset.name}</span><span className="text-slate-500">{preset.blocks.length}</span>
          </button>
          <button type="button" aria-label={t("terminal.presets.deleteLabel", { name: preset.name })} title={t('terminal.drawer.presetDelete')} onClick={() => { onDeletePreset(preset.id); setMessage({ key: 'terminal.presets.deleted', params: { name: preset.name } }); }}
            className="shrink-0 border-l border-slate-700 p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>)}
        {!presets.length && !showForm && <p className="py-1 text-slate-500">{t('terminal.drawer.presetEmpty')}</p>}
      </div>
    </div>}
    <AddChartModal
      isOpen={pickerOpen && showForm && showPresets}
      onClose={() => setPickerOpen(false)}
      context="preset"
      mode="preset"
      coins={pickerCoins}
      formationCoins={pickerFormationCoins}
      terminalMarketCoins={snapshot.coins}
      watchlist={watchlist}
      initialTimeframe={timeframe}
      atChartLimit={selectedBlocks.length >= MAX_TERMINAL_CHARTS}
      presetSelectedKeys={selectedMarketKeys}
      onAddChart={chooseMarketFromPicker}
    />
  </section>;
}
