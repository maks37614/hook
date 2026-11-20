import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translateKey } from '../locales';
import type { TerminalChartBlock, TerminalSavedPreset, TerminalWorkspaceConfig, TerminalWorkspaceSettings } from '../types';
import { getStoredPreferences } from './userPreferences';
import { normalizeVisualProfile } from '../components/hookchart/visualProfiles';
import { normalizeTerminalChartRefreshMs } from './terminalChartRefresh';
import { DEFAULT_TERMINAL_TOUCH_GAP_PX, normalizeTerminalTouchGapPx } from './terminalTouchGap';
import { normalizeTerminalBlocks, normalizeTerminalPresets, terminalStorageKey, TERMINAL_PRESETS_STORAGE_KEY } from './terminalPresets';

const BLOCKS_KEY = 'crypto_screener_terminal_blocks';
const CONFIG_KEY = 'crypto_screener_terminal_config';
type WorkspaceSnapshot = { blocks: TerminalChartBlock[]; config: TerminalWorkspaceConfig; presets: TerminalSavedPreset[] };

/** Three-way merge by stable IDs. A deleted or changed chart/preset is an
 * intentional local edit; untouched items adopt cloud changes. New items from
 * another device are retained, so a stale save cannot erase its additions.
 */
function mergeEditedItems<T extends { id: string }>(
  base: T[], edited: T[], cloud: T[], limit: number,
): T[] {
  const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);
  if (!changed(base, edited)) return cloud;
  const previous = new Map(base.map(item => [item.id, item]));
  const local = new Map(edited.map(item => [item.id, item]));
  const output = new Map(cloud.map(item => [item.id, item]));
  for (const item of base) if (!local.has(item.id)) output.delete(item.id);
  for (const item of edited) {
    if (!previous.has(item.id) || changed(item, previous.get(item.id))) output.set(item.id, item);
  }
  const oldOrder = base.filter(item => local.has(item.id)).map(item => item.id);
  const editedOldOrder = edited.filter(item => previous.has(item.id)).map(item => item.id);
  const reordered = changed(oldOrder, editedOldOrder);
  if (!reordered) return Array.from(output.values()).slice(0, limit);
  const sorted: T[] = [];
  const seen = new Set<string>();
  for (const id of [...edited.map(item => item.id), ...output.keys()]) {
    const item = output.get(id);
    if (item && !seen.has(id)) { sorted.push(item); seen.add(id); }
  }
  return sorted.slice(0, limit);
}

/** Reapply only this device's unsaved edits on top of the newest server version.
 * Unchanged settings, charts and presets always come from the cloud. The server
 * compare-and-swap version still prevents overwriting a newer unseen snapshot.
 */
export function rebaseTerminalWorkspace(base: WorkspaceSnapshot, edited: WorkspaceSnapshot, cloud: WorkspaceSnapshot): WorkspaceSnapshot {
  const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);
  const config = { ...cloud.config } as Record<string, unknown>;
  const oldConfig = base.config as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(edited.config)) {
    if (changed(value, oldConfig[key])) config[key] = value;
  }
  return {
    blocks: mergeEditedItems(base.blocks, edited.blocks, cloud.blocks, 50),
    config: config as unknown as TerminalWorkspaceConfig,
    presets: mergeEditedItems(base.presets, edited.presets, cloud.presets, 30),
  };
}
const DEFAULT_CONFIG: TerminalWorkspaceConfig = {
  layoutPreset: 'custom', columns: 2, freeLayoutAutoColumns: true, autoFitScreen: true, showClock: true, blocks: [], showFormations: true, blockHeight: 'medium',
  terminalMarketAlerts: false,
  touchGapPx: DEFAULT_TERMINAL_TOUCH_GAP_PX,
};
/** Validate imported files before replacing any chart or saving to a profile. */
export function parseTerminalWorkspaceBackup(json: string): WorkspaceSnapshot {
  if (json.length > 2_000_000) throw new Error('JSON-копія перевищує 2 МБ.');
  let payload: unknown;
  try { payload = JSON.parse(json); }
  catch { throw new Error('Неправильний формат JSON.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Файл не містить робочої області Термінала.');
  const value = payload as Record<string, unknown>;
  if (!Array.isArray(value.blocks) || !Array.isArray(value.presets)
      || !value.config || typeof value.config !== 'object' || Array.isArray(value.config))
    throw new Error('У JSON відсутні графіки, налаштування або пресети.');
  if (value.blocks.length > 250 || value.presets.length > 30)
    throw new Error('Забагато графіків або пресетів у файлі.');
  const validChart = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const block = candidate as Record<string, unknown>;
    const marketId = (part: unknown): boolean =>
      typeof part === 'string' && part.length > 0 && part.length <= 48 && /^[\p{L}\p{M}\p{N}]+$/u.test(part);
    return typeof block.id === 'string' && block.id.trim().length > 0 && block.id.length <= 180
      && marketId(block.symbol) && marketId(block.baseAsset) && marketId(block.quoteAsset)
      && ['binance', 'bybit'].includes(String(block.exchange))
      && ['spot', 'futures'].includes(String(block.marketType))
      && ['30s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(String(block.timeframe))
      && (block.colSpan == null || [1, 2, 3, 4, 'full'].includes(block.colSpan as number | string))
      && (block.heightPx == null || (typeof block.heightPx === 'number'
        && Number.isFinite(block.heightPx) && block.heightPx >= 180 && block.heightPx <= 2400));
  };
  if (!value.blocks.every(validChart)
      || value.presets.some((preset: unknown) => !preset || typeof preset !== 'object'
        || !Array.isArray((preset as TerminalSavedPreset).blocks)
        || !(preset as TerminalSavedPreset).blocks.every(validChart)))
    throw new Error('Файл містить некоректні символи, параметри або ID графіків.');
  const blocks = normalizeTerminalBlocks(value.blocks);
  const presets = normalizeTerminalPresets(value.presets);
  // Never silently remove an invalid entry during backup restoration.
  if (blocks.length !== value.blocks.length || presets.length !== value.presets.length
      || value.presets.some((preset: unknown) => {
        if (!preset || typeof preset !== 'object' || !Array.isArray((preset as TerminalSavedPreset).blocks)) return true;
        // normalizeTerminalPresets caps each saved preset at 50 charts.
        // Reject oversize imports instead of reporting success after losing
        // the additional chart blocks from the user's backup.
        const presetBlocks = (preset as TerminalSavedPreset).blocks;
        return presetBlocks.length > 50 || normalizeTerminalBlocks(presetBlocks).length !== presetBlocks.length;
      })) throw new Error('Файл містить пошкоджені графіки або пресети.');
  const source = value.config as Record<string, unknown>;
  const config: TerminalWorkspaceConfig = { ...DEFAULT_CONFIG };
  const layouts = ['1x1', '1x2', '2x1', '2x2', '2x3', '3x3', '4x4', '5x5', '6x6', 'custom'];
  if (layouts.includes(String(source.layoutPreset)))
    config.layoutPreset = source.layoutPreset as TerminalWorkspaceConfig['layoutPreset'];
  if ([1, 2, 3, 4, 5, 6].includes(source.columns as number))
    config.columns = source.columns as TerminalWorkspaceConfig['columns'];
  if (typeof source.freeLayoutAutoColumns === 'boolean')
    config.freeLayoutAutoColumns = source.freeLayoutAutoColumns;
  config.touchGapPx = normalizeTerminalTouchGapPx(source.touchGapPx);
  if (typeof source.autoFitScreen === 'boolean') config.autoFitScreen = source.autoFitScreen;
  if (typeof source.showClock === 'boolean') config.showClock = source.showClock;
  if (typeof source.autoScaleCharts === 'boolean') config.autoScaleCharts = source.autoScaleCharts;
  if (typeof source.terminalEcoMode === 'boolean') config.terminalEcoMode = source.terminalEcoMode;
  if (typeof source.terminalMarketAlerts === 'boolean') config.terminalMarketAlerts = source.terminalMarketAlerts;
  if (typeof source.presetAutoUpdate === 'boolean') config.presetAutoUpdate = source.presetAutoUpdate;
  if (source.terminalRefreshMs != null)
    config.terminalRefreshMs = normalizeTerminalChartRefreshMs(source.terminalRefreshMs);
  if (typeof source.showFormations === 'boolean') config.showFormations = source.showFormations;
  if (['compact', 'medium', 'large'].includes(String(source.blockHeight)))
    config.blockHeight = source.blockHeight as TerminalWorkspaceConfig['blockHeight'];
  if (['30s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(String(source.globalTimeframe)))
    config.globalTimeframe = source.globalTimeframe as TerminalWorkspaceConfig['globalTimeframe'];
  if (['all', 'binance', 'bybit'].includes(String(source.coinPresetExchange)))
    config.coinPresetExchange = source.coinPresetExchange as TerminalWorkspaceConfig['coinPresetExchange'];
  if (['all', 'spot', 'futures'].includes(String(source.coinPresetMarketType)))
    config.coinPresetMarketType = source.coinPresetMarketType as TerminalWorkspaceConfig['coinPresetMarketType'];
  if (typeof source.coinPresetLimit === 'number' && Number.isInteger(source.coinPresetLimit)
      && source.coinPresetLimit >= 4 && source.coinPresetLimit <= 50)
    config.coinPresetLimit = source.coinPresetLimit;
  if (source.initialChartView != null)
    config.initialChartView = normalizeVisualProfile(source.initialChartView, 'terminalMedium');
  if (typeof source.initialChartFitAll === 'boolean')
    config.initialChartFitAll = source.initialChartFitAll;
  return { blocks, config, presets };
}

function readCache(key: string, uid?: string): unknown {
  try { return JSON.parse(localStorage.getItem(terminalStorageKey(key, uid)) || 'null'); } catch { return null; }
}
export function loadTerminalWorkspace(uid?: string, settings?: TerminalWorkspaceSettings) {
  // Signed-in accounts have exactly one authoritative workspace: PostgreSQL.
  // Browser storage is only a convenience for visitors without an account.
  const storedBlocks = uid ? null : readCache(BLOCKS_KEY);
  const storedConfig = uid ? null : readCache(CONFIG_KEY);
  const prefs = getStoredPreferences();
  const defaultBlock: TerminalChartBlock = { id: 'block-btc-default', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    exchange: prefs.defaultExchange === 'all' ? 'binance' : prefs.defaultExchange,
    marketType: prefs.defaultMarketType === 'all' ? 'futures' : prefs.defaultMarketType,
    timeframe: prefs.defaultTimeframe, colSpan: 1 };
  const sourceConfig = settings ? { ...settings.config, columns: settings.columns, blockHeight: settings.blockHeight }
    : storedConfig && typeof storedConfig === 'object' ? storedConfig : {};
  const config = { ...DEFAULT_CONFIG, ...sourceConfig } as TerminalWorkspaceConfig;
  if (![1, 2, 3, 4, 5, 6].includes(config.columns)) config.columns = 2;
  config.touchGapPx = normalizeTerminalTouchGapPx(config.touchGapPx);
  config.freeLayoutAutoColumns = config.freeLayoutAutoColumns !== false;
  if ((config.blockHeight as string) === 'tall') config.blockHeight = 'large';
  if (!['compact', 'medium', 'large'].includes(config.blockHeight)) config.blockHeight = 'medium';
  if (config.initialChartView != null) {
    config.initialChartView = normalizeVisualProfile(config.initialChartView, 'terminalMedium');
  }
  config.initialChartFitAll = config.initialChartFitAll === true;
  config.autoScaleCharts = config.autoScaleCharts === true;
  config.terminalEcoMode = config.terminalEcoMode === true;
  config.presetAutoUpdate = config.presetAutoUpdate !== false;
  config.terminalRefreshMs = normalizeTerminalChartRefreshMs(config.terminalRefreshMs);
  return { blocks: Array.isArray(settings?.blocks) ? normalizeTerminalBlocks(settings.blocks)
    : Array.isArray(storedBlocks) ? normalizeTerminalBlocks(storedBlocks) : [defaultBlock], config,
    presets: normalizeTerminalPresets(settings?.customPresets ?? (uid ? null : readCache(TERMINAL_PRESETS_STORAGE_KEY))) };
}

/** TerminalPage is keyed by account, so pending writes cannot cross an account change. */
export function useTerminalWorkspace() {
  const { user, profile, updateTerminalWorkspace, refreshProfile } = useAuth();
  const { language } = useLanguage();
  const uid = user?.uid;
  const [workspace, setWorkspace] = useState(() => loadTerminalWorkspace(uid, profile?.uid === uid ? profile?.terminalSettings : undefined));
  const [syncError, setSyncError] = useState(false);
  const serverVersion = useRef<string | null>(profile?.terminalSettings?.version ?? null);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const hydrated = useRef(Boolean(!uid || profile?.uid === uid));
  const authRef = useRef({ uid, profile, updateTerminalWorkspace, refreshProfile });
  authRef.current = { uid, profile, updateTerminalWorkspace, refreshProfile };
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const lastCommittedWorkspace = useRef(workspace);
  const syncedWorkspaceRef = useRef(workspace);
  const hydrationWorkspaceRef = useRef<typeof workspace | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const mounted = useRef(true);
  // Done on Terminal startup view commits the profile without the usual 1.2s
  // coalescing delay. Other workspace edits retain their low-churn schedule.
  const urgentWorkspaceSyncRef = useRef(false);
  const requestImmediateWorkspaceSync = useCallback(() => {
    urgentWorkspaceSyncRef.current = true;
  }, []);

  const persistToProfile = useCallback((value: typeof workspace, currentRevision: number) => {
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      const auth = authRef.current;
      if (!uid || auth.uid !== uid || auth.profile?.uid !== uid
        || !hydrated.current || currentRevision < revision.current) return;
      const { blocks: _blocks, ...config } = value.config;
      const nextVersion = await auth.updateTerminalWorkspace({
        columns: config.columns, blockHeight: config.blockHeight, config,
        blocks: value.blocks, customPresets: value.presets,
      }, serverVersion.current);
      serverVersion.current = nextVersion;
      syncedWorkspaceRef.current = value;
      savedRevision.current = currentRevision;
      if (mounted.current) setSyncError(false);
    }).catch(async (error: Error & { code?: string }) => {
      if (error.code === 'TERMINAL_WORKSPACE_CONFLICT' && uid) {
        try {
          // The other device has saved first. Read it directly from PostgreSQL
          // and rebase our *unsaved* changes instead of offering two workspaces.
          const newest = await authRef.current.refreshProfile();
          if (authRef.current.uid !== uid || newest.uid !== uid) return;
          const cloud = loadTerminalWorkspace(uid, newest.terminalSettings);
          const base = syncedWorkspaceRef.current;
          serverVersion.current = newest.terminalSettings?.version ?? null;
          syncedWorkspaceRef.current = cloud;
          const merged = rebaseTerminalWorkspace(base, workspaceRef.current, cloud);
          if (JSON.stringify(merged) === JSON.stringify(cloud)) {
            savedRevision.current = revision.current;
            hydrationWorkspaceRef.current = cloud;
          }
          setWorkspace(merged);
          if (mounted.current) setSyncError(false);
          return;
        } catch {
          // Preserve pending edits in memory and offer retry on network errors.
        }
      }
      if (mounted.current) setSyncError(true);
    });
  }, [uid]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (revision.current !== savedRevision.current)
        persistToProfile(workspaceRef.current, revision.current);
    };
  }, [persistToProfile]);

  useEffect(() => {
    if (!uid || profile?.uid !== uid) return;
    const cloudVersion = profile.terminalSettings?.version ?? null;
    if (hydrated.current && cloudVersion === serverVersion.current) return;
    const cloud = loadTerminalWorkspace(uid, profile.terminalSettings);
    const pendingEdits = revision.current !== savedRevision.current;
    const rebased = pendingEdits
      ? rebaseTerminalWorkspace(syncedWorkspaceRef.current, workspaceRef.current, cloud)
      : cloud;
    hydrated.current = true;
    serverVersion.current = cloudVersion;
    syncedWorkspaceRef.current = cloud;
    if (!pendingEdits || JSON.stringify(rebased) === JSON.stringify(cloud)) {
      savedRevision.current = revision.current;
      hydrationWorkspaceRef.current = rebased;
    }
    setWorkspace(rebased);
  }, [uid, profile]);

  // The server is authoritative even when another device changes its version.
  // Only edits made since the last loaded cloud snapshot are rebased and saved.

  const setField = useCallback(<K extends keyof typeof workspace>(field: K, update: SetStateAction<(typeof workspace)[K]>) => {
    setWorkspace(current => {
      const value = typeof update === 'function' ? (update as (previous: (typeof workspace)[K]) => (typeof workspace)[K])(current[field]) : update;
      if (value === current[field]) return current;
      // React may run state updaters repeatedly in StrictMode or abandon a
      // render. Only increment the write revision after a committed render.
      return { ...current, [field]: value };
    });
  }, []);
  const setBlocks: Dispatch<SetStateAction<TerminalChartBlock[]>> = useCallback(update => setField('blocks', update), [setField]);
  const setConfig: Dispatch<SetStateAction<TerminalWorkspaceConfig>> = useCallback(update => setField('config', update), [setField]);
  const setCustomPresets: Dispatch<SetStateAction<TerminalSavedPreset[]>> = useCallback(update => setField('presets', update), [setField]);

  useEffect(() => {
    if (lastCommittedWorkspace.current === workspace) return;
    lastCommittedWorkspace.current = workspace;
    const isPureHydration = hydrationWorkspaceRef.current === workspace;
    hydrationWorkspaceRef.current = null;
    if (!isPureHydration) revision.current += 1;
  }, [workspace]);

  useEffect(() => {
    if (revision.current === savedRevision.current) return;
    const immediate = urgentWorkspaceSyncRef.current;
    urgentWorkspaceSyncRef.current = false;
    if (!uid) {
      // Guest-only cache. A signed-in user never has a competing local version.
      try {
        localStorage.setItem(terminalStorageKey(BLOCKS_KEY), JSON.stringify(workspace.blocks));
        localStorage.setItem(terminalStorageKey(CONFIG_KEY), JSON.stringify(workspace.config));
        localStorage.setItem(terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY), JSON.stringify(workspace.presets));
      } catch { setSyncError(true); }
      return;
    }
    if (!hydrated.current) return;
    const currentRevision = revision.current;
    const timer = setTimeout(() => persistToProfile(workspace, currentRevision), immediate ? 0 : 1200);
    return () => clearTimeout(timer);
  }, [workspace, uid, profile?.uid, persistToProfile]);

  const retrySync = useCallback(() => {
    setWorkspace(current => ({ ...current }));
  }, []);

  const importWorkspaceBackup = useCallback((json: string): boolean => {
    const recovered = parseTerminalWorkspaceBackup(json);
    if (!window.confirm(translateKey(language, 'terminal.backup.importConfirm', {
      charts: recovered.blocks.length, presets: recovered.presets.length,
    })))
      return false;
    // One atomic workspace update, so charts and presets cannot be mixed
    // between the old and new workspace during a partial import.
    setWorkspace(recovered);
    return true;
  }, [language]);

  const downloadLocalBackup = useCallback(() => {
    const snapshot = workspaceRef.current;
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), ...snapshot }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'h00k-terminal-local-backup.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  return { blocks: workspace.blocks, config: workspace.config, customPresets: workspace.presets,
    setBlocks, setConfig, setCustomPresets, syncError, retrySync,
    downloadLocalBackup, importWorkspaceBackup, requestImmediateWorkspaceSync };
}
