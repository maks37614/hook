import React, { memo, useCallback } from 'react';
import type { DetectedFormation, ScannedCoin, TerminalChartBlock } from '../../types';
import type { VisualChartProfile } from '../hookchart/visualProfiles';
import type { ArchiveChartCapture } from '../../utils/archiveChartSnapshot';
import { TerminalChartWidget } from './TerminalChartWidget';

export interface TerminalGridItemProps {
  block: TerminalChartBlock;
  coin?: ScannedCoin;
  getAllCoins: () => ScannedCoin[];
  subscribeAllCoins: (listener: () => void) => () => void;
  index: number;
  isMaximized: boolean;
  isSuspended: boolean;
  terminalAutoScale: boolean;
  terminalEcoMode: boolean;
  terminalRefreshMs: number;
  terminalActiveCharts: number;
  terminalInitialView?: VisualChartProfile;
  terminalFitAllRequest?: number;
  heightStyle: string;
  metaScalpBinding: string;
  onToggleMaximize: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateBlock: (id: string, changes: Partial<TerminalChartBlock>) => void;
  onOpenCoinSelector: (id: string) => void;
  onOpenFullscreenModal?: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onSaveToArchive?: (block: TerminalChartBlock, coin: ScannedCoin, formation: DetectedFormation | null, capture: ArchiveChartCapture) => void;
  isSavingArchive?: boolean;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  onOpenTelegramAlerts?: (prefill?: any) => void;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (index: number) => void;
}

/** Child actions are created only when this one chart's id or index changes.
 * Parent UI updates never recreate its callbacks or cause remounts.
 */
export const TerminalGridItem = memo(function TerminalGridItem({
  block, coin, getAllCoins, subscribeAllCoins, index, isMaximized, isSuspended,
  terminalAutoScale, terminalEcoMode, terminalRefreshMs, terminalActiveCharts,
  terminalInitialView, terminalFitAllRequest, heightStyle, metaScalpBinding,
  onToggleMaximize, onRemove, onUpdateBlock, onOpenCoinSelector,
  onOpenFullscreenModal, onSendMetaScalp, onOpenTelegramAlerts, onSaveToArchive, isSavingArchive,
  onDragStart, onDragOver, onDrop,
}: TerminalGridItemProps) {
  const toggle = useCallback(() => onToggleMaximize(block.id), [onToggleMaximize, block.id]);
  const remove = useCallback(() => onRemove(block.id), [onRemove, block.id]);
  const update = useCallback((changes: Partial<TerminalChartBlock>) =>
    onUpdateBlock(block.id, changes), [onUpdateBlock, block.id]);
  const openCoinSelector = useCallback(() => onOpenCoinSelector(block.id), [onOpenCoinSelector, block.id]);
  const dragStart = useCallback(() => onDragStart(index), [onDragStart, index]);
  const drop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    onDrop(index);
  }, [onDrop, index]);
  return (
    <TerminalChartWidget
      block={block}
      coin={coin}
      getAllCoins={getAllCoins}
      subscribeAllCoins={subscribeAllCoins}
      isSingleBlock={false}
      isMaximized={isMaximized}
      isSuspended={isSuspended}
      terminalAutoScale={terminalAutoScale}
      terminalEcoMode={terminalEcoMode}
      terminalRefreshMs={terminalRefreshMs}
      terminalActiveCharts={terminalActiveCharts}
      terminalInitialView={terminalInitialView}
      terminalFitAllRequest={terminalFitAllRequest}
      heightStyle={heightStyle}
      metaScalpBinding={metaScalpBinding}
      onToggleMaximize={toggle}
      onRemove={remove}
      onUpdateBlock={update}
      onOpenCoinSelector={openCoinSelector}
      onOpenFullscreenModal={onOpenFullscreenModal}
      onSaveToArchive={onSaveToArchive}
      isSavingArchive={isSavingArchive}
      onSendMetaScalp={onSendMetaScalp}
      onOpenTelegramAlerts={onOpenTelegramAlerts}
      onDragStart={dragStart}
      onDragOver={onDragOver}
      onDrop={drop}
    />
  );
});
