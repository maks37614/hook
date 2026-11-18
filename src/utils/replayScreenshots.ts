/** Replay screenshots live outside profile JSON/localStorage, keyed to the
 * signed-in account and trade ID. No network calls or live market subscriptions.
 */
const DB_NAME = 'h00k-replay-images-v1';
const STORE = 'screenshots';
let opened: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (!opened) opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opened = undefined; };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Screenshot database blocked'));
  }).catch(error => { opened = undefined; throw error; });
  return opened;
}
const prefix = (userId: string) => 'owner:' + encodeURIComponent(userId) + ':';
const key = (owner: string, tradeId: string) => prefix(owner) + tradeId;
const runTransaction = async (perform: (store: IDBObjectStore) => void): Promise<void> => {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Screenshot transaction aborted'));
    try { perform(transaction.objectStore(STORE)); }
    catch (error) { transaction.abort(); reject(error); }
  });
};
const decodeImage = (dataUrl: string): Blob => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[2].length > 11_000_000) throw new Error('Invalid or oversized screenshot');
  const raw = atob(match[2]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
};
export async function storeReplayScreenshot(owner: string, tradeId: string, image: string): Promise<void> {
  const blob = decodeImage(image);
  await runTransaction(store => { store.put(blob, key(owner, tradeId)); });
}
export async function loadReplayScreenshot(owner: string, tradeId: string): Promise<Blob | null> {
  const database = await db();
  return await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(key(owner, tradeId));
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}
export async function deleteReplayScreenshot(owner: string, tradeId: string): Promise<void> {
  await runTransaction(store => { store.delete(key(owner, tradeId)); });
}
/** Delete only the selected trade PNGs in one atomic IndexedDB transaction. */
export async function deleteReplayScreenshots(owner: string, tradeIds: readonly string[]): Promise<void> {
  const unique = [...new Set(tradeIds)];
  if (!unique.length) return;
  await runTransaction(store => {
    for (const tradeId of unique) store.delete(key(owner, tradeId));
  });
}
export async function clearReplayScreenshots(owner: string): Promise<void> {
  const start = prefix(owner);
  await runTransaction(store => {
    const request = store.openCursor(IDBKeyRange.bound(start, start + '\uffff'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
  });
}
/** Reconcile local image bytes after cross-device profile changes: when another
 * device removed a journal trade, this device discards its orphan on next load.
 */
export async function pruneReplayScreenshots(owner: string, keptTradeIds: readonly string[]): Promise<void> {
  const validKeys = new Set(keptTradeIds.map(id => key(owner, id)));
  const start = prefix(owner);
  await runTransaction(store => {
    const request = store.openCursor(IDBKeyRange.bound(start, start + '\uffff'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!validKeys.has(String(cursor.key))) cursor.delete();
      cursor.continue();
    };
  });
}
export const replayImageKey = (tradeId: string) => 'idb:' + tradeId;
export const isReplayImageKey = (url: string | undefined, tradeId: string) => url === replayImageKey(tradeId);
