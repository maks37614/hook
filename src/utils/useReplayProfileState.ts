import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from './apiFetch';
import { pruneReplayScreenshots } from './replayScreenshots';
import type { ExchangeId, MarketType, ReplayPendingOrder, ReplayPosition, ReplaySimulationSettings, ReplayTradeJournalItem, Timeframe } from '../types';
import { DEFAULT_SIMULATION_SETTINGS } from './replayService';

type Context = { symbol: string; exchange: ExchangeId; marketType: MarketType; timeframe: Timeframe; atTime?: number };
export type SavedReplayContext = Context;
export type ReplayProfileData = {
  settings: ReplaySimulationSettings; position: ReplayPosition | null;
  pendingOrders: ReplayPendingOrder[]; journal: ReplayTradeJournalItem[];
  context: Context; resetCount: number;
};
const initialSettings = () => ({ ...DEFAULT_SIMULATION_SETTINGS });

/** One small, revision-checked snapshot of simulator state per PostgreSQL identity.
 * No market-data requests; avoids a DB write for each replay candle.
 */
export function useReplayProfileState(context: Context, isPlaying: boolean) {
  const { user, loading: authLoading } = useAuth();
  const owner = user?.uid ?? null;
  const ownerKey = owner ?? 'guest';
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [lastSyncedRevision, setLastSyncedRevision] = useState(0);
  const [lastSyncedTradeIds, setLastSyncedTradeIds] = useState<string[]>([]);
  const [restoredContext, setRestoredContext] = useState<SavedReplayContext | null>(null);
  const [settings, setSettings] = useState<ReplaySimulationSettings>(initialSettings);
  const [position, setPosition] = useState<ReplayPosition | null>(null);
  const [pendingOrders, setPendingOrders] = useState<ReplayPendingOrder[]>([]);
  const [journalItems, setJournalItems] = useState<ReplayTradeJournalItem[]>([]);
  const [resetCount, setResetCount] = useState(0);
  const revision = useRef(0);
  const blocked = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHash = useRef('');
  const activeOwner = useRef<string | null>(null);
  activeOwner.current = owner;

  const current = useRef<ReplayProfileData>({
    settings, position, pendingOrders, journal: journalItems, context, resetCount,
  });
  // While restoring historical candles, preserve the server's original
  // cursor instead of overwriting it with an empty initial chart timestamp.
  const effectiveContext = !context.atTime && restoredContext
    && restoredContext.symbol === context.symbol
    && restoredContext.exchange === context.exchange
    && restoredContext.marketType === context.marketType
    && restoredContext.timeframe === context.timeframe
      ? restoredContext : context;
  current.current = {
    settings, position, pendingOrders, journal: journalItems,
    context: effectiveContext, resetCount,
  };

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoadedFor(null);
    setStoreError(null);
    setLastSyncedRevision(0);
    setLastSyncedTradeIds([]);
    blocked.current = false;
    revision.current = 0;
    savedHash.current = '';
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    writeQueue.current = Promise.resolve();
    setSettings(initialSettings());
    setPosition(null);
    setPendingOrders([]);
    setJournalItems([]);
    setResetCount(0);
    setRestoredContext(null);

    if (!owner) {
      setLoadedFor('guest');
      return () => { cancelled = true; };
    }
    void (async () => {
      try {
        const response = await apiFetch('/api/account/replay', { cache: 'no-store' });
        if (!response.ok) throw new Error('Replay profile: HTTP ' + response.status);
        const data = await response.json();
        if (cancelled || activeOwner.current !== owner) return;
        revision.current = data.revision || 0;
        const snapshot = data.state as ReplayProfileData | null;
        if (snapshot) {
          setSettings({ ...initialSettings(), ...snapshot.settings });
          setPosition(snapshot.position || null);
          setPendingOrders(snapshot.pendingOrders || []);
          setJournalItems(snapshot.journal || []);
          setResetCount(snapshot.resetCount || 0);
          setRestoredContext(snapshot.context || null);
          // Other devices can remove trades; release this browser's orphaned
          // PNG blobs when it next loads the owner's authenticated snapshot.
          void pruneReplayScreenshots(owner,
            (snapshot.journal || []).filter(item => item.screenshotUrl === 'idb:' + item.id)
              .map(item => item.id)).catch(() => {});
        } else {
          void pruneReplayScreenshots(owner, []).catch(() => {});
        }
        setLoadedFor(owner);
      } catch (error) {
        if (!cancelled) {
          blocked.current = true;
          setStoreError('Не вдалося завантажити стан Replay з профілю. Оновіть сторінку після відновлення з’єднання.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [owner, authLoading]);

  const saveLatest = useCallback(() => {
    if (!owner || loadedFor !== owner || activeOwner.current !== owner || blocked.current) return;
    const data = current.current;
    // Screenshots are transferred to owner-scoped IndexedDB before a trade
    // appears in PostgreSQL. Never persist large data URLs inside JSONB.
    if (data.journal.some(item => item.screenshotUrl?.startsWith('data:image/'))) return;
    const safe: ReplayProfileData = {
      ...data,
      position: data.position ? { ...data.position, entryScreenshot: undefined } : null,
      journal: data.journal.map(item => ({
        ...item, screenshotUrl: item.screenshotUrl?.startsWith('idb:') ? item.screenshotUrl : undefined,
      })),
    };
    const serialized = JSON.stringify(safe);
    if (serialized === savedHash.current) return;
    // Sequential promises prevent out-of-order saves from resurrecting deleted trades.
    writeQueue.current = writeQueue.current.then(async () => {
      if (loadedFor !== owner || activeOwner.current !== owner || blocked.current) return;
      const latest = current.current;
      if (latest.journal.some(item => item.screenshotUrl?.startsWith('data:image/'))) return;
      const snapshot: ReplayProfileData = {
        ...latest,
        position: latest.position ? { ...latest.position, entryScreenshot: undefined } : null,
        journal: latest.journal.map(item => ({
          ...item, screenshotUrl: item.screenshotUrl?.startsWith('idb:') ? item.screenshotUrl : undefined,
        })),
      };
      const body = JSON.stringify(snapshot);
      if (body === savedHash.current) return;
      const response = await apiFetch('/api/account/replay', {
        method: 'PUT',
        keepalive: typeof document !== 'undefined' && document.visibilityState === 'hidden',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision.current, state: snapshot }),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error('CONFLICT');
        throw new Error('HTTP ' + response.status);
      }
      const result = await response.json();
      revision.current = result.revision;
      savedHash.current = body;
      setLastSyncedRevision(result.revision);
      setLastSyncedTradeIds(snapshot.journal.map(row => row.id));
    }).catch((error: unknown) => {
      if (activeOwner.current !== owner) return;
      blocked.current = true;
      setStoreError(error instanceof Error && error.message === 'CONFLICT'
        ? 'Replay змінено в іншій вкладці. Перезавантажте сторінку, щоб не затерти новіші угоди.'
        : 'Не вдалося зберегти Replay у профілі. Перевірте з’єднання та перезавантажте сторінку.');
    });
  }, [owner, loadedFor]);

  // Save actions and user settings. Candle-by-candle changes to unrealized PnL
  // and replay time do NOT trigger network requests.
  useEffect(() => {
    if (!owner || authLoading || loadedFor !== owner || blocked.current) return;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(saveLatest, 750);
    return () => { if (pendingTimer.current) clearTimeout(pendingTimer.current); };
  }, [
    owner, authLoading, loadedFor, saveLatest,
    settings, position?.id, pendingOrders, journalItems, resetCount,
    context.symbol, context.exchange, context.marketType, context.timeframe,
  ]);

  // Avoid per-candle PostgreSQL writes during fast Replay. Persist an active
  // position/pending orders at most once per 90 seconds; always flush on pause.
  useEffect(() => {
    if (!isPlaying || !owner || loadedFor !== owner || (!position && !pendingOrders.length)) return;
    const tick = window.setInterval(saveLatest, 90_000);
    return () => window.clearInterval(tick);
  }, [isPlaying, owner, loadedFor, saveLatest, !!position, pendingOrders.length]);

  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && !isPlaying && loadedFor === owner) saveLatest();
    wasPlaying.current = isPlaying;
  }, [isPlaying, owner, loadedFor, saveLatest]);

  // A last bounded PUT when a user backgrounds the tab; keepalive allows the
  // browser to finish the request without opening extra sockets or timers.
  useEffect(() => {
    if (!owner || loadedFor !== owner) return;
    const flush = () => {
      if (document.visibilityState === 'hidden') {
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        saveLatest();
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [owner, loadedFor, saveLatest]);

  // Router navigation can unmount Replay before its 750ms autosave fires.
  // Flush on cleanup so a freshly deleted trade/reset balance is not silently
  // lost when switching site pages. Never flush a different/partially loaded
  // account; saveLatest checks both the owner and loadedFor.
  useEffect(() => () => {
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    if (owner && loadedFor === owner) saveLatest();
  }, [owner, loadedFor, saveLatest]);

  const resetSimulator = useCallback(() => {
    setSettings(prev => ({ ...prev, balance: DEFAULT_SIMULATION_SETTINGS.balance }));
    setPosition(null);
    setPendingOrders([]);
    setJournalItems([]);
    setResetCount(count => count + 1);
  }, []);

  return {
    owner, ownerKey, authLoading, loadedFor, isReady: !authLoading && loadedFor === ownerKey,
    storeError, restoredContext, lastSyncedRevision, lastSyncedTradeIds,
    settings, setSettings, position, setPosition,
    pendingOrders, setPendingOrders, journalItems, setJournalItems,
    resetCount, resetSimulator,
  };
}
