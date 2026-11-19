import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translateKey, translatePhrase } from '../locales';
import type { TerminalChartBlock, TerminalSavedPreset, TerminalWorkspaceConfig, TerminalWorkspaceSettings } from '../types';
import { getStoredPreferences } from './userPreferences';
import { normalizeVisualProfile } from '../components/hookchart/visualProfiles';
import { normalizeTerminalChartRefreshMs } from './terminalChartRefresh';
import { normalizeTerminalBlocks, normalizeTerminalPresets, terminalStorageKey, TERMINAL_PRESETS_STORAGE_KEY } from './terminalPresets';

const BLOCKS_KEY = 'crypto_screener_terminal_blocks';
const CONFIG_KEY = 'crypto_screener_terminal_config';
const CONFLICT_KEY = 'crypto_screener_terminal_conflict_backup';
type WorkspaceSnapshot = { blocks: TerminalChartBlock[]; config: TerminalWorkspaceConfig; presets: TerminalSavedPreset[] };
function readConflictBackup(uid?: string): WorkspaceSnapshot | null {
  if (!uid) return null;
  const raw = readCache(CONFLICT_KEY, uid);
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<WorkspaceSnapshot>;
  if (!Array.isArray(value.blocks) || !value.config || typeof value.config !== 'object'
      || !Array.isArray(value.presets)) return null;
  return { blocks: normalizeTerminalBlocks(value.blocks), config: value.config,
    presets: normalizeTerminalPresets(value.presets) };
}
function saveConflictBackup(uid: string, value: WorkspaceSnapshot): boolean {
  try {
    localStorage.setItem(terminalStorageKey(CONFLICT_KEY, uid),
      JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}
const DEFAULT_CONFIG: TerminalWorkspaceConfig = {
  layoutPreset: 'custom', columns: 2, freeLayoutAutoColumns: true, autoFitScreen: true, showClock: true, blocks: [], showFormations: true, blockHeight: 'medium',
  terminalMarketAlerts: false,
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
  const storedBlocks = readCache(BLOCKS_KEY, uid);
  const storedConfig = readCache(CONFIG_KEY, uid);
  const recovery = readConflictBackup(uid);
  const prefs = getStoredPreferences();
  const defaultBlock: TerminalChartBlock = { id: 'block-btc-default', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    exchange: prefs.defaultExchange === 'all' ? 'binance' : prefs.defaultExchange,
    marketType: prefs.defaultMarketType === 'all' ? 'futures' : prefs.defaultMarketType,
    timeframe: prefs.defaultTimeframe, colSpan: 1 };
  const sourceConfig = recovery ? recovery.config
    : settings ? { ...settings.config, columns: settings.columns, blockHeight: settings.blockHeight }
    : storedConfig && typeof storedConfig === 'object' ? storedConfig : {};
  const config = { ...DEFAULT_CONFIG, ...sourceConfig } as TerminalWorkspaceConfig;
  if (![1, 2, 3, 4, 5, 6].includes(config.columns)) config.columns = 2;
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
  return { blocks: recovery?.blocks ?? (Array.isArray(settings?.blocks) ? normalizeTerminalBlocks(settings.blocks)
    : Array.isArray(storedBlocks) ? normalizeTerminalBlocks(storedBlocks) : [defaultBlock]), config,
    presets: normalizeTerminalPresets(recovery?.presets ?? settings?.customPresets ?? readCache(TERMINAL_PRESETS_STORAGE_KEY, uid)) };
}

/** TerminalPage is keyed by account, so pending writes cannot cross an account change. */
export function useTerminalWorkspace() {
  const { user, profile, updateTerminalWorkspace } = useAuth();
  const { language } = useLanguage();
  const uid = user?.uid;
  const [workspace, setWorkspace] = useState(() => loadTerminalWorkspace(uid, profile?.uid === uid ? profile?.terminalSettings : undefined));
  const [syncError, setSyncError] = useState(() => Boolean(readConflictBackup(uid)));
  const [syncConflict, setSyncConflict] = useState(() => Boolean(readConflictBackup(uid)));
  const [backupFailed, setBackupFailed] = useState(false);
  const syncConflictRef = useRef(syncConflict);
  const serverVersion = useRef<string | null>(profile?.terminalSettings?.version ?? null);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const hydrated = useRef(Boolean(!uid || profile?.uid === uid));
  const authRef = useRef({ uid, profile, updateTerminalWorkspace });
  authRef.current = { uid, profile, updateTerminalWorkspace };
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const lastCommittedWorkspace = useRef(workspace);
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
        || currentRevision < revision.current || syncConflictRef.current) return;
      const { blocks: _blocks, ...config } = value.config;
      const nextVersion = await auth.updateTerminalWorkspace({
        columns: config.columns, blockHeight: config.blockHeight, config,
        blocks: value.blocks, customPresets: value.presets,
      }, serverVersion.current);
      serverVersion.current = nextVersion;
      savedRevision.current = currentRevision;
      if (mounted.current) { setSyncError(false); setSyncConflict(false); }
    }).catch((error: Error & { code?: string }) => {
      if (error.code === 'TERMINAL_WORKSPACE_CONFLICT') {
        syncConflictRef.current = true;
        const saved = uid ? saveConflictBackup(uid, workspaceRef.current) : false;
        if (mounted.current && !saved) setBackupFailed(true);
      }
      if (!mounted.current) return;
      setSyncError(true);
      if (error.code === 'TERMINAL_WORKSPACE_CONFLICT') setSyncConflict(true);
    });
  }, [uid]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!syncConflictRef.current && revision.current !== savedRevision.current)
        persistToProfile(workspaceRef.current, revision.current);
    };
  }, [persistToProfile]);

  useEffect(() => {
    if (hydrated.current || !uid || profile?.uid !== uid) return;
    hydrated.current = true;
    // If the user edited cached charts while their account was loading, they
    // never saw the server version they would be replacing. Treat it as a
    // conflict rather than silently authorizing an overwrite of cloud charts.
    if ((revision.current > 0 || lastCommittedWorkspace.current !== workspaceRef.current)
        && profile.terminalSettings && !syncConflictRef.current) {
      syncConflictRef.current = true;
      const saved = saveConflictBackup(uid, workspaceRef.current);
      setBackupFailed(!saved);
      setSyncError(true);
      setSyncConflict(true);
      return;
    }
    if (syncConflictRef.current) return;
    serverVersion.current = profile.terminalSettings?.version ?? null;
    // With no local changes, the account workspace is authoritative.
    if (revision.current === 0) {
      // Remember the exact cloud snapshot. If a user edit is batched with the
      // hydration update, the resulting workspace differs and must still save.
      const hydratedWorkspace = loadTerminalWorkspace(uid, profile.terminalSettings);
      hydrationWorkspaceRef.current = hydratedWorkspace;
      setWorkspace(hydratedWorkspace);
    }
  }, [uid, profile]);

  // CAS is deliberately pinned to the version this tab actually loaded
  // (or received from its own successful save). A newer profile update from
  // another device must NOT silently grant this tab permission to overwrite it.

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
    try {
      localStorage.setItem(terminalStorageKey(BLOCKS_KEY, uid), JSON.stringify(workspace.blocks));
      localStorage.setItem(terminalStorageKey(CONFIG_KEY, uid), JSON.stringify(workspace.config));
      localStorage.setItem(terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY, uid), JSON.stringify(workspace.presets));
    } catch { setSyncError(true); }
    if (uid && syncConflictRef.current) {
      const stored = saveConflictBackup(uid, workspace);
      setBackupFailed(!stored);
    }
    if (!uid || !hydrated.current || syncConflict) return;
    const currentRevision = revision.current;
    const timer = setTimeout(() => persistToProfile(workspace, currentRevision), immediate ? 0 : 1200);
    return () => clearTimeout(timer);
  }, [workspace, uid, profile?.uid, persistToProfile, syncConflict]);

  const retrySync = useCallback(() => {
    if (syncConflict) return; // A conflicting version needs explicit reconciliation.
    // Cloning schedules a committed workspace change; the commit effect
    // advances revision once, even with React StrictMode replays.
    setWorkspace(current => ({ ...current }));
  }, [syncConflict]);

  const restoreCloudWorkspace = useCallback(() => {
    if (!uid || !syncConflictRef.current) return;
    if (!window.confirm(translatePhrase(language, 'Локальні зміни не буде завантажено в хмару. Спочатку експортуйте JSON-копію. Повернути хмарну версію?'))) return;
    try {
      localStorage.removeItem(terminalStorageKey(CONFLICT_KEY, uid));
      window.location.reload(); // Loads the latest server profile after conflict recovery.
    } catch { setSyncError(true); }
  }, [uid, language]);

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
    setBlocks, setConfig, setCustomPresets, syncError, syncConflict, retrySync,
    downloadLocalBackup, importWorkspaceBackup, restoreCloudWorkspace, backupFailed,
    requestImmediateWorkspaceSync };
}
