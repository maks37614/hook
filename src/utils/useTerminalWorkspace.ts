import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';
import type { TerminalChartBlock, TerminalSavedPreset, TerminalWorkspaceConfig, TerminalWorkspaceSettings } from '../types';
import { getStoredPreferences } from './userPreferences';
import { normalizeTerminalBlocks, normalizeTerminalPresets, terminalStorageKey, TERMINAL_PRESETS_STORAGE_KEY } from './terminalPresets';

const BLOCKS_KEY = 'crypto_screener_terminal_blocks';
const CONFIG_KEY = 'crypto_screener_terminal_config';
const DEFAULT_CONFIG: TerminalWorkspaceConfig = {
  layoutPreset: 'custom', columns: 2, autoFitScreen: true, blocks: [], showFormations: true, blockHeight: 'medium',
};
function readCache(key: string, uid?: string): unknown {
  try { return JSON.parse(localStorage.getItem(terminalStorageKey(key, uid)) || 'null'); } catch { return null; }
}
export function loadTerminalWorkspace(uid?: string, settings?: TerminalWorkspaceSettings) {
  const storedBlocks = readCache(BLOCKS_KEY, uid);
  const storedConfig = readCache(CONFIG_KEY, uid);
  const prefs = getStoredPreferences();
  const defaultBlock: TerminalChartBlock = { id: 'block-btc-default', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    exchange: prefs.defaultExchange === 'all' ? 'binance' : prefs.defaultExchange,
    marketType: prefs.defaultMarketType === 'all' ? 'futures' : prefs.defaultMarketType,
    timeframe: prefs.defaultTimeframe, mode: 'tradingview', colSpan: 1 };
  const sourceConfig = settings ? { ...settings.config, columns: settings.columns, blockHeight: settings.blockHeight }
    : storedConfig && typeof storedConfig === 'object' ? storedConfig : {};
  const config = { ...DEFAULT_CONFIG, ...sourceConfig } as TerminalWorkspaceConfig;
  if (![1, 2, 3, 4, 5, 6].includes(config.columns)) config.columns = 2;
  if ((config.blockHeight as string) === 'tall') config.blockHeight = 'large';
  if (!['compact', 'medium', 'large'].includes(config.blockHeight)) config.blockHeight = 'medium';
  return { blocks: Array.isArray(settings?.blocks) ? normalizeTerminalBlocks(settings.blocks)
    : Array.isArray(storedBlocks) ? normalizeTerminalBlocks(storedBlocks) : [defaultBlock], config,
    presets: normalizeTerminalPresets(settings?.customPresets ?? readCache(TERMINAL_PRESETS_STORAGE_KEY, uid)) };
}

/** TerminalPage is keyed by account, so pending writes cannot cross an account change. */
export function useTerminalWorkspace() {
  const { user, profile, updateProfileData } = useAuth();
  const uid = user?.uid;
  const [workspace, setWorkspace] = useState(() => loadTerminalWorkspace(uid, profile?.uid === uid ? profile?.terminalSettings : undefined));
  const [syncError, setSyncError] = useState(false);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const hydrated = useRef(Boolean(!uid || profile?.uid === uid));
  const authRef = useRef({ uid, profile, updateProfileData });
  authRef.current = { uid, profile, updateProfileData };
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const saveQueue = useRef(Promise.resolve());
  const mounted = useRef(true);

  const persistToProfile = useCallback((value: typeof workspace, currentRevision: number) => {
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      const auth = authRef.current;
      if (!uid || auth.uid !== uid || auth.profile?.uid !== uid || currentRevision < revision.current) return;
      const { blocks: _blocks, ...config } = value.config;
      await auth.updateProfileData({ terminalSettings: { ...auth.profile.terminalSettings,
        columns: config.columns, blockHeight: config.blockHeight, config,
        blocks: value.blocks, customPresets: value.presets } });
      savedRevision.current = currentRevision;
      if (mounted.current) setSyncError(false);
    }).catch(() => { if (mounted.current) setSyncError(true); });
  }, [uid]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (revision.current !== savedRevision.current) persistToProfile(workspaceRef.current, revision.current);
    };
  }, [persistToProfile]);

  useEffect(() => {
    if (hydrated.current || !uid || profile?.uid !== uid) return;
    hydrated.current = true;
    // A late profile response must not overwrite a user's new selection.
    if (revision.current === 0) setWorkspace(loadTerminalWorkspace(uid, profile.terminalSettings));
  }, [uid, profile]);

  const setField = useCallback(<K extends keyof typeof workspace>(field: K, update: SetStateAction<(typeof workspace)[K]>) => {
    setWorkspace(current => {
      const value = typeof update === 'function' ? (update as (previous: (typeof workspace)[K]) => (typeof workspace)[K])(current[field]) : update;
      if (value === current[field]) return current;
      revision.current += 1;
      return { ...current, [field]: value };
    });
  }, []);
  const setBlocks: Dispatch<SetStateAction<TerminalChartBlock[]>> = useCallback(update => setField('blocks', update), [setField]);
  const setConfig: Dispatch<SetStateAction<TerminalWorkspaceConfig>> = useCallback(update => setField('config', update), [setField]);
  const setCustomPresets: Dispatch<SetStateAction<TerminalSavedPreset[]>> = useCallback(update => setField('presets', update), [setField]);

  useEffect(() => {
    if (revision.current === savedRevision.current) return;
    try {
      localStorage.setItem(terminalStorageKey(BLOCKS_KEY, uid), JSON.stringify(workspace.blocks));
      localStorage.setItem(terminalStorageKey(CONFIG_KEY, uid), JSON.stringify(workspace.config));
      localStorage.setItem(terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY, uid), JSON.stringify(workspace.presets));
    } catch { setSyncError(true); }
    if (!uid || !hydrated.current) return;
    const currentRevision = revision.current;
    const timer = setTimeout(() => persistToProfile(workspace, currentRevision), 1200);
    return () => clearTimeout(timer);
  }, [workspace, uid, profile?.uid, persistToProfile]);

  const retrySync = useCallback(() => {
    revision.current += 1;
    setWorkspace(current => ({ ...current }));
  }, []);

  return { blocks: workspace.blocks, config: workspace.config, customPresets: workspace.presets,
    setBlocks, setConfig, setCustomPresets, syncError, retrySync };
}
