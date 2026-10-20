import React from 'react';
import {
  X,
  Sliders,
  Maximize2,
  Grid,
  Columns,
  Clock,
  Sparkles,
  Layers,
  RotateCcw,
  Check,
  Monitor,
  LayoutGrid,
} from 'lucide-react';
import { Timeframe, TerminalWorkspaceConfig } from '../../types';
import type { MarketSelection } from '../../utils/marketCoinLoader';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';

interface TerminalSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: TerminalWorkspaceConfig;
  coinSelection: MarketSelection;
  coinLimit: number;
  onUpdateConfig: (updated: Partial<TerminalWorkspaceConfig>) => void;
  onApplyGlobalTimeframe: (tf: Timeframe) => void;
  onApplyPreset: (presetKey: 'focus_btc' | 'top_3' | 'top_4_patterns' | 'grid_4') => void;
  onResetWorkspace: () => void;
  totalBlocks: number;
}

export const TerminalSettingsDrawer: React.FC<TerminalSettingsDrawerProps> = ({
  isOpen,
  onClose,
  config,
  coinSelection,
  coinLimit,
  onUpdateConfig,
  onApplyGlobalTimeframe,
  onApplyPreset,
  onResetWorkspace,
  totalBlocks,
}) => {
  const { language } = useLanguage();
  const tr = (value: string) => translatePhrase(language, value);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {tr('Налаштування термінала')}
              </h3>
              <p className="text-xs text-slate-400">
                {tr(`Конфігурація робочого простору трейдера (${totalBlocks} графіків)`)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Sections */}
        <div className="p-5 space-y-6 flex-1 text-xs">
          <section className="space-y-3" aria-label={tr("Налаштування монет пресетів")}>
            <h4 className="font-bold text-slate-300">{tr("Монети пресетів")}</h4>
            <label className="flex items-center justify-between gap-3 text-slate-400">{tr("Біржа")}
              <select aria-label={tr("Біржа пресету")} value={coinSelection.exchange}
                onChange={event => onUpdateConfig({ coinPresetExchange: event.target.value as MarketSelection['exchange'] })}
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="all">{tr("Усі біржі")}</option><option value="binance">Binance</option><option value="bybit">Bybit</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-slate-400">{tr("Ринок")}
              <select aria-label={tr("Ринок пресету")} value={coinSelection.marketType}
                onChange={event => onUpdateConfig({ coinPresetMarketType: event.target.value as MarketSelection['marketType'] })}
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="all">Spot + Futures</option><option value="futures">Futures</option><option value="spot">Spot</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-slate-400">{tr("Кількість графіків")}
              <select aria-label={tr("Кількість графіків у пресеті")} value={coinLimit}
                onChange={event => onUpdateConfig({ coinPresetLimit: Number(event.target.value) })}
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                {[4, 6, 9, 12, 16, 25, 36].map(count => <option key={count} value={count}>{tr(`до ${count}`)}</option>)}
              </select>
            </label>
          </section>
          {/* Layout Presets */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
              <span>{tr("Шаблони розташування сітки")}</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1x1', label: '1х', sub: '1 графік' },
                { id: '1x2', label: '1x2', sub: 'Горизонтально' },
                { id: '2x1', label: '2x1', sub: 'Вертикально' },
                { id: '2x2', label: '2x2', sub: '4 сітка' },
                { id: '2x3', label: '2x3', sub: '6 сітка' },
                { id: '3x3', label: '3x3', sub: '9 сітка' },
                { id: '4x4', label: '4x4', sub: '16 сітка' },
                { id: '5x5', label: '5x5', sub: '25 сітка' },
                { id: '6x6', label: '6x6', sub: '36 сітка' },
                { id: 'custom', label: 'Вільний', sub: 'Гнучкий' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    let cols = config.columns;
                    if (item.id === '1x1' || item.id === '2x1') cols = 1;
                    else if (item.id === '1x2' || item.id === '2x2') cols = 2;
                    else if (item.id === '2x3' || item.id === '3x3') cols = 3;
                    else if (item.id === '4x4') cols = 4;
                    else if (item.id === '5x5') cols = 5;
                    else if (item.id === '6x6') cols = 6;
                    onUpdateConfig({ layoutPreset: item.id as any, columns: cols as any });
                  }}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    config.layoutPreset === item.id
                      ? 'bg-cyan-950/60 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-mono font-bold text-xs text-cyan-300">{item.label}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5 leading-tight truncate">{tr(item.sub)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Number of columns */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Columns className="w-3.5 h-3.5 text-cyan-400" />
              <span>{tr("Кількість колонок на екрані")}</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {([1, 2, 3, 4, 5, 6] as (1 | 2 | 3 | 4 | 5 | 6)[]).map((col) => (
                <button
                  key={col}
                  onClick={() => onUpdateConfig({ columns: col })}
                  type="button"
                  aria-label={tr(`${col} колонок на екрані`)}
                  aria-pressed={config.columns === col}
                  className={`py-2 px-1 rounded-xl border font-mono font-bold text-center transition-all ${
                    config.columns === col
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          {/* Screen Adaptation: Auto-fit to viewport */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-white block">{tr("Під розмір монітора (Auto-Fit)")}</span>
                  <span className="text-[11px] text-slate-400 block">
                    {tr("Графіки займають рівно 100% висоти вікна без зайвого скролу")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onUpdateConfig({ autoFitScreen: !config.autoFitScreen })}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  config.autoFitScreen ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    config.autoFitScreen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Block Height (when not in auto-fit) */}
          {!config.autoFitScreen && (
            <div className="space-y-2.5">
              <label className="text-slate-300 font-bold flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>{tr("Масштаб / Висота блоків графіка")}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'compact', label: 'Компактний', px: '280px' },
                  { id: 'medium', label: 'Стандартний', px: '380px' },
                  { id: 'large', label: 'Великий', px: '500px' },
                ].map((h) => (
                  <button
                    key={h.id}
                    onClick={() => onUpdateConfig({ blockHeight: h.id as any })}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      config.blockHeight === h.id
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>{tr(h.label)}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{h.px}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Global Timeframe Switcher */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{tr("Глобальний таймфрейм (для всіх графіків одразу)")}</span>
            </label>
            <div className="grid grid-cols-6 gap-1 font-mono">
              {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onApplyGlobalTimeframe(tf)}
                  className="py-1.5 rounded-lg bg-slate-950/70 hover:bg-cyan-600 hover:text-white border border-slate-800 text-slate-300 text-center font-bold transition-colors"
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Preset Workspaces */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{tr("Швидкі набори монет для трейдингу")}</span>
            </label>
            <div className="space-y-2">
              <button
                onClick={() => onApplyPreset('focus_btc')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">{tr("BTC Focus (1 графік)")}</div>
                  <div className="text-[11px] text-slate-400">{tr("Повний екран, максимальна концентрація")}</div>
                </div>
                <span className="font-mono text-xs text-amber-400 font-bold">BTCUSDT</span>
              </button>

              <button
                onClick={() => onApplyPreset('top_3')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">{tr("Топ-3 Ліквідність")}</div>
                  <div className="text-[11px] text-slate-400">BTC + ETH + SOL</div>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">{tr("3 графіки")}</span>
              </button>

              <button
                onClick={() => onApplyPreset('grid_4')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">{tr("2x2 Квадрат (Топ-4)")}</div>
                  <div className="text-[11px] text-slate-400">BTC + ETH + SOL + SUI</div>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">{tr("4 графіки")}</span>
              </button>

              <button
                onClick={() => onApplyPreset('top_4_patterns')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{tr("Топ-4 монети з формаціями")}</span>
                    <span className="text-[9px] px-1 rounded bg-purple-900/60 text-purple-300">AI</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{tr("Монети з найвищим скорингом патернів")}</div>
                </div>
                <span className="font-mono text-xs text-purple-400 font-bold">{tr("Патерни")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3">
          <button
            onClick={onResetWorkspace}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 text-rose-300 border border-rose-900/60 text-xs font-semibold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{tr("Очистити робоче місце")}</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
          >
            {tr("Готово")}
          </button>
        </div>
      </div>
    </div>
  );
};
