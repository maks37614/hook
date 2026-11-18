import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus } from 'lucide-react';
import type { ScannedCoin, TerminalChartBlock, Timeframe } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import {
  appendFullscreenChart, fullscreenMarketKey, MAX_FULLSCREEN_CHARTS,
  reorderFullscreenCharts, shiftFullscreenChart, updateFullscreenChart,
  replaceFullscreenChart, fullscreenChartSlots, fullscreenMarketCollision, type FullscreenChartSlot,
  type FullscreenMarket, type FullscreenSelection,
} from '../../utils/fullscreenMultiChart';

// The existing Terminal picker and HookChart cards are loaded only when required.
const LazyAddChartModal = React.lazy(() => import('../terminal/AddChartModal').then(module => ({ default: module.AddChartModal })));
const LazyTerminalChartWidget = React.lazy(() => import('../terminal/TerminalChartWidget').then(module => ({ default: module.TerminalChartWidget })));

const labels = {
  uk: { add: 'Додати графік', show: 'Відкрити панель графіків', hide: 'Сховати панель графіків', limit: 'Максимум 4 графіки', loading: 'Завантаження графіка…', chart: 'Графік', move: 'Перемістити графік', up: 'Перемістити вище', down: 'Перемістити нижче', duplicate: 'Ця монета вже відкрита' },
  en: { add: 'Add chart', show: 'Open chart panel', hide: 'Hide chart panel', limit: 'Maximum 4 charts', loading: 'Loading chart…', chart: 'Chart', move: 'Move chart', up: 'Move chart up', down: 'Move chart down', duplicate: 'This market is already open' },
  pl: { add: 'Dodaj wykres', show: 'Otwórz panel wykresów', hide: 'Ukryj panel wykresów', limit: 'Maksymalnie 4 wykresy', loading: 'Wczytywanie wykresu…', chart: 'Wykres', move: 'Przenieś wykres', up: 'Przenieś wykres w górę', down: 'Przenieś wykres w dół', duplicate: 'Ten rynek jest już otwarty' },
  ru: { add: 'Добавить график', show: 'Открыть панель графиков', hide: 'Скрыть панель графиков', limit: 'Максимум 4 графика', loading: 'Загрузка графика…', chart: 'График', move: 'Переместить график', up: 'Переместить выше', down: 'Переместить ниже', duplicate: 'Этот рынок уже открыт' },
} as const;

interface FullscreenMultiChartProps {
  primaryMarket: FullscreenMarket;
  children: React.ReactNode;
  allCoins: ScannedCoin[];
  watchlist: string[];
  primaryTimeframe: string;
  /** A header favorite either fills the next free slot or replaces a selected secondary slot. */
  favoriteToAdd?: { id: number; coin: ScannedCoin; targetId?: string } | null;
  /** Change only the selected secondary panel; keep its ID and timeframe. */
  marketChangeRequest?: { id: number; targetId: string; exchange: FullscreenMarket['exchange']; marketType: FullscreenMarket['marketType'] } | null;
  onSlotsChange?: (slots: FullscreenChartSlot[]) => void;
  activeSlotId?: string;
  onActiveSlotChange?: (slotId: string) => void;
  /** Favorite name is being dragged out of the fullscreen drawer. */
  favoriteDragging?: boolean;
  favoriteDropTargetId?: string | null;
  onFavoriteDrop?: (targetId: string) => void;
  onFavoriteDragHover?: (targetId: string | null) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramAlerts?: (prefill?: any) => void;
}

export function FullscreenMultiChart({
  primaryMarket, children, allCoins, watchlist, primaryTimeframe, favoriteToAdd, marketChangeRequest,
  onSlotsChange, activeSlotId = 'primary', onActiveSlotChange,
  favoriteDragging = false, favoriteDropTargetId, onFavoriteDrop, onFavoriteDragHover,
  onSendMetaScalp, metaScalpBinding, onOpenTelegramAlerts,
}: FullscreenMultiChartProps) {
  const { language } = useLanguage();
  const label = labels[language] || labels.uk;
  const [blocks, setBlocks] = useState<TerminalChartBlock[]>([]);
  const [chartOrder, setChartOrder] = useState<string[]>(['primary']);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dockTouchY = useRef<number | null>(null);
  const draggingId = useRef<string | null>(null);
  const touchDraggingId = useRef<string | null>(null);
  const handledFavoriteId = useRef<number | null>(null);
  const handledMarketRequestId = useRef<number | null>(null);
  const primaryKey = fullscreenMarketKey(primaryMarket);
  const count = blocks.length + 1;

  // The favorite drawer is controlled by the page header, but its slot choices
  // must always mirror the real chart order, including drag-and-drop changes.
  useEffect(() => {
    onSlotsChange?.(fullscreenChartSlots(primaryMarket, blocks, chartOrder));
  }, [onSlotsChange, primaryKey, blocks, chartOrder]);

  // Avoid a second connection to the primary market when the main chart changes.
  useEffect(() => {
    setBlocks(previous => previous.some(block => fullscreenMarketKey(block) === primaryKey)
      ? previous.filter(block => fullscreenMarketKey(block) !== primaryKey) : previous);
  }, [primaryKey]);

  const add = useCallback((selected: FullscreenSelection, tf: Timeframe, formationId?: string) => {
    setBlocks(previous => appendFullscreenChart(previous, primaryMarket, selected, tf, formationId));
    setDockExpanded(true);
    setPickerOpen(false);
    setFeedback(null);
  }, [primaryKey]);

  // A favorite replaces only its selected chart without starting a duplicate
  // exchange subscription; adding a new chart remains exclusive to the + picker.
  useEffect(() => {
    if (!favoriteToAdd || handledFavoriteId.current === favoriteToAdd.id) return;
    handledFavoriteId.current = favoriteToAdd.id;
    const { coin, targetId } = favoriteToAdd;
    const key = fullscreenMarketKey(coin);
    if (targetId && targetId !== 'primary') {
      const target = blocks.find(block => block.id === targetId);
      if (!target) return;
      if (key === primaryKey || blocks.some(block => block.id !== targetId && fullscreenMarketKey(block) === key)) {
        setFeedback(label.duplicate);
        return;
      }
      setBlocks(previous => replaceFullscreenChart(previous, primaryMarket, targetId, coin));
      setFeedback(null);
      return;
    }
    if (key === primaryKey || blocks.some(block => fullscreenMarketKey(block) === key)) {
      setFeedback(label.duplicate);
      setDockExpanded(true);
      return;
    }
    if (count >= MAX_FULLSCREEN_CHARTS) {
      setFeedback(label.limit);
      setDockExpanded(true);
      return;
    }
    setBlocks(previous => appendFullscreenChart(previous, primaryMarket, coin, primaryTimeframe as Timeframe));
    setDockExpanded(true);
    setFeedback(null);
  }, [favoriteToAdd, primaryKey, blocks, count, primaryTimeframe, label.duplicate, label.limit]);

  // Only the chosen additional chart changes when toggling Binance/Bybit or
  // Spot/Futures in the page header. React retains the chart slot and timeframe.
  useEffect(() => {
    if (!marketChangeRequest || handledMarketRequestId.current === marketChangeRequest.id) return;
    handledMarketRequestId.current = marketChangeRequest.id;
    const { targetId, exchange, marketType } = marketChangeRequest;
    const current = blocks.find(block => block.id === targetId);
    if (!current) return;
    const nextMarket = { ...current, exchange, marketType };
    const collision = fullscreenMarketCollision(
      fullscreenChartSlots(primaryMarket, blocks, chartOrder), targetId, nextMarket,
    );
    if (collision) {
      onActiveSlotChange?.(collision.id);
      setFeedback(label.duplicate);
      return;
    }
    setBlocks(previous => updateFullscreenChart(previous, primaryMarket, targetId,
      { exchange, marketType, formationId: undefined }));
    setFeedback(null);
  }, [marketChangeRequest, primaryKey, blocks, chartOrder, onActiveSlotChange, label.duplicate]);

  const remove = useCallback((id: string) => {
    setBlocks(previous => previous.filter(block => block.id !== id));
    if (activeSlotId === id) onActiveSlotChange?.('primary');
    setFeedback(null);
  }, [activeSlotId, onActiveSlotChange]);
  const update = useCallback((id: string, patch: Partial<TerminalChartBlock>) => {
    setBlocks(previous => updateFullscreenChart(previous, primaryMarket, id, patch));
  }, [primaryKey]);

  // Reset the active selection when a secondary chart disappears.
  useEffect(() => {
    if (activeSlotId !== 'primary' && !blocks.some(block => block.id === activeSlotId)) {
      onActiveSlotChange?.('primary');
    }
  }, [activeSlotId, blocks, onActiveSlotChange]);

  // Keep the original HookChart mounted while its keyed panel changes position.
  const ids = ['primary', ...blocks.map(block => block.id)];
  const orderedIds = [...chartOrder.filter(id => ids.includes(id)), ...ids.filter(id => !chartOrder.includes(id))];
  const move = (source: string, target: string) => {
    setChartOrder(previous => {
      const active = [...previous.filter(id => ids.includes(id)), ...ids.filter(id => !previous.includes(id))];
      return reorderFullscreenCharts(active, source, target);
    });
  };
  const shift = (id: string, direction: -1 | 1) => {
    setChartOrder(previous => {
      const active = [...previous.filter(key => ids.includes(key)), ...ids.filter(key => !previous.includes(key))];
      return shiftFullscreenChart(active, id, direction);
    });
  };

  const onDockTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    dockTouchY.current = event.touches.length === 1 ? event.touches[0].clientY : null;
  };
  const onDockTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = dockTouchY.current;
    dockTouchY.current = null;
    if (start === null || event.changedTouches.length !== 1) return;
    const delta = event.changedTouches[0].clientY - start;
    if (delta < -28) setDockExpanded(true);
    else if (delta > 28) setDockExpanded(false);
  };

  return <div className="fullscreen-multi-chart">
    <div className={'fullscreen-multi-cells' + (blocks.length ? ' is-multiple' : '')}
      data-count={count} style={{ '--fullscreen-chart-count': count } as React.CSSProperties}>
      {orderedIds.map((id, index) => {
        const block = id === 'primary' ? undefined : blocks.find(entry => entry.id === id);
        if (id !== 'primary' && !block) return null;
        const symbol = block?.symbol || primaryMarket.symbol;
        return <section key={id} data-fullscreen-chart-id={id}
          className={'fullscreen-multi-cell ' + (block ? 'fullscreen-multi-secondary' : 'fullscreen-multi-primary') + (count > 1 ? ' is-reorderable' : '') + (count > 1 && onActiveSlotChange && activeSlotId === id ? ' is-active-slot' : '') + (favoriteDragging && favoriteDropTargetId === id ? ' is-favorite-drop-target' : '')}
          aria-label={label.chart + ' ' + (index + 1) + ' · ' + symbol}
          aria-current={onActiveSlotChange && activeSlotId === id ? 'true' : undefined}
          tabIndex={count > 1 && onActiveSlotChange ? 0 : undefined}
          onPointerDownCapture={() => { if (activeSlotId !== id) onActiveSlotChange?.(id); }}
          onFocusCapture={() => { if (activeSlotId !== id) onActiveSlotChange?.(id); }}
          onDragOver={event => {
            if (draggingId.current) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            } else if (favoriteDragging && onFavoriteDrop) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              if (favoriteDropTargetId !== id) onFavoriteDragHover?.(id);
            }
          }}
          onDragLeave={event => {
            if (!favoriteDragging || favoriteDropTargetId !== id) return;
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            onFavoriteDragHover?.(null);
          }}
          onDrop={event => {
            const source = draggingId.current;
            if (source) {
              event.preventDefault();
              draggingId.current = null;
              move(source, id);
            } else if (favoriteDragging && onFavoriteDrop) {
              event.preventDefault();
              onFavoriteDrop(id);
              onFavoriteDragHover?.(null);
            }
          }}>
          <div className="fullscreen-multi-cell-content">
            {count > 1 && <div className="fullscreen-multi-drag-anchor">
              <button type="button" className="fullscreen-multi-move"
                draggable
                aria-label={label.move + ' ' + symbol}
                title={label.move}
                onDragStart={event => {
                  draggingId.current = id;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', id);
                }}
                onDragEnd={() => { draggingId.current = null; }}
                onPointerDown={event => {
                  if (event.pointerType === 'mouse') return;
                  touchDraggingId.current = id;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={event => {
                  if (event.pointerType === 'mouse') return;
                  const source = touchDraggingId.current;
                  touchDraggingId.current = null;
                  const element = document.elementFromPoint(event.clientX, event.clientY);
                  const target = element?.closest('[data-fullscreen-chart-id]')?.getAttribute('data-fullscreen-chart-id');
                  if (source && target) move(source, target);
                }}
                onPointerCancel={() => { touchDraggingId.current = null; }}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    shift(id, -1);
                  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    shift(id, 1);
                  }
                }}>
                <GripVertical size={15} aria-hidden="true"/>
              </button>
              {!block && <span data-no-translate className="fullscreen-multi-drag-symbol" title={symbol}>{symbol}</span>}
            </div>}

            {block ? <Suspense fallback={<div className="fullscreen-multi-loading">{label.loading}</div>}>
              <LazyTerminalChartWidget compactFullscreenMode block={block}
                coin={allCoins.find(coin => fullscreenMarketKey(coin) === fullscreenMarketKey(block))}
                allCoins={allCoins} isSingleBlock={false} isMaximized={false}
                terminalActiveCharts={count} onToggleMaximize={() => {}}
                onRemove={() => remove(block.id)} onUpdateBlock={patch => update(block.id, patch)}
                onSendMetaScalp={onSendMetaScalp} metaScalpBinding={metaScalpBinding}
                onOpenTelegramAlerts={onOpenTelegramAlerts}/>
            </Suspense> : children}
          </div>
        </section>;
      })}
    </div>
    <div className={'fullscreen-multi-dock' + (dockExpanded ? ' is-open' : '')}
      onTouchStart={onDockTouchStart} onTouchEnd={onDockTouchEnd}
      onTouchCancel={() => { dockTouchY.current = null; }}>
      <button type="button" className="fullscreen-multi-handle"
        aria-label={dockExpanded ? label.hide : label.show}
        aria-expanded={dockExpanded} onClick={() => setDockExpanded(value => !value)}>
        <span className="fullscreen-multi-grip" aria-hidden="true" />
        {dockExpanded ? <ChevronDown size={12} aria-hidden="true"/> : <ChevronUp size={12} aria-hidden="true"/>}
      </button>
      {dockExpanded && <div className="fullscreen-multi-dock-actions">
        <button type="button" className="fullscreen-multi-add" onClick={() => setPickerOpen(true)}
          aria-label={count >= MAX_FULLSCREEN_CHARTS ? label.limit : label.add}
          disabled={count >= MAX_FULLSCREEN_CHARTS}
          title={count >= MAX_FULLSCREEN_CHARTS ? label.limit : label.add}>
          <Plus size={19} aria-hidden="true"/>
        </button>
      </div>}
    </div>
    {feedback && <span className="sr-only" role="status">{feedback}</span>}
    {pickerOpen && <Suspense fallback={null}>
      <LazyAddChartModal isOpen={pickerOpen} onClose={() => setPickerOpen(false)}
        context="fullscreen" maxCharts={MAX_FULLSCREEN_CHARTS}
        initialTimeframe={primaryTimeframe as Timeframe}
        coins={allCoins} watchlist={watchlist}
        atChartLimit={count >= MAX_FULLSCREEN_CHARTS} onAddChart={add}/>
    </Suspense>}
  </div>;
}
