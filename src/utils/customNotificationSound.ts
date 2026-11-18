/**
 * User-selected notification audio. Audio bytes stay in IndexedDB on this
 * browser/device; never upload them to the server or store them in a cloud profile.
 */
export const MAX_CUSTOM_SOUND_BYTES = 2 * 1024 * 1024;
export const MAX_CUSTOM_SOUND_SECONDS = 20;
const DB_NAME = 'h00k_custom_notification_audio_v1';
const STORE = 'sounds';
const EXTENSION = /\.(mp3|wav|ogg|m4a)$/i;
const MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'application/octet-stream', '',
]);

export interface CustomNotificationSound {
  name: string;
  blob: Blob;
  savedAt: number;
}

/** Pure validation, used before allocating a blob URL or writing to disk. */
export function validateCustomNotificationSound(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (!EXTENSION.test(file.name) || !MIME_TYPES.has(file.type.toLowerCase()))
    return 'Підтримуються лише файли MP3, WAV, OGG або M4A.';
  if (file.size <= 0 || file.size > MAX_CUSTOM_SOUND_BYTES)
    return 'Розмір файлу має бути від 1 байта до 2 МБ.';
  return null;
}

const STORAGE_TIMEOUT_MS = 8_000;

/** IndexedDB can be blocked indefinitely by another tab or Safari privacy mode. */
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('Збереження мелодії недоступне в цьому браузері.'));
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      reject(new Error('Не вдалося відкрити локальне сховище мелодій.'));
      return;
    }
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('Сховище мелодій не відповідає. Закрийте інші вкладки h00k.top і спробуйте ще раз.'));
    }, STORAGE_TIMEOUT_MS);
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(new Error(message));
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true;
      clearTimeout(timeout);
      resolve(request.result);
    };
    request.onerror = () => fail('Не вдалося відкрити локальне сховище мелодій.');
    request.onblocked = () => fail('Закрийте інші вкладки h00k.top і повторіть.');
  });
}

export const MAX_CUSTOM_SOUND_TRACKS = 24;

export interface SavedSoundTrack extends CustomNotificationSound {
  id: string;
}
export interface CustomSoundLibrary {
  version: 2;
  selectedId: string;
  tracks: SavedSoundTrack[];
}

const CUSTOM_SOUND_LABELS: Record<string, string> = {
  'jg-032316-sfx-robot-talk-1': 'Голос робота',
  '23ab89dc95700ba': 'Цифровий сигнал 1',
  '1c0ccd2e60335f6': 'Цифровий сигнал 2',
  'magical_sound_freetone.org': 'Магічне сповіщення',
  '59f4c8e1df6982a': 'Цифровий сигнал 3',
  'e28ae0d18cb8813': 'Цифровий сигнал 4',
  'whistle_of_a_bird_freetone.org': 'Пташиний свист',
  '4f16c5e4d065268': 'Цифровий сигнал 5',
};

/** Friendly labels for the eight supplied sounds; other files keep their names. */
export function customSoundDisplayName(filename: string): string {
  const name = filename.replace(/^(?:0[1-8]_)/, '').replace(/\.(?:mp3|wav|ogg|m4a)$/i, '');
  const cleanName = name.replace(/\(\d+\)$/, '').toLowerCase();
  return CUSTOM_SOUND_LABELS[cleanName] || name;
}

/** Reads v1 single-melody records without data loss and converts to a v2 library. */
export function normalizeCustomSoundLibrary(raw: unknown): CustomSoundLibrary {
  const empty: CustomSoundLibrary = { version: 2, selectedId: '', tracks: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.tracks)) {
    const valid = data.tracks.filter((track: unknown): track is SavedSoundTrack => {
      if (!track || typeof track !== 'object') return false;
      const t = track as Record<string, unknown>;
      return typeof t.id === 'string' && Boolean(t.id)
        && typeof t.name === 'string' && t.blob instanceof Blob;
    }).slice(0, MAX_CUSTOM_SOUND_TRACKS);
    const selectedId = typeof data.selectedId === 'string' && valid.some(x => x.id === data.selectedId)
      ? data.selectedId : (valid[0]?.id || '');
    return { version: 2, selectedId, tracks: valid };
  }
  if (typeof data.name === 'string' && data.blob instanceof Blob) {
    const legacy: SavedSoundTrack = {
      id: 'legacy', name: data.name.slice(0,100),
      blob: data.blob, savedAt: typeof data.savedAt === 'number' ? data.savedAt : Date.now(),
    };
    return { version: 2, selectedId: legacy.id, tracks: [legacy] };
  }
  return empty;
}

async function read(uid: string): Promise<CustomSoundLibrary> {
  if (!uid || uid === 'guest') return normalizeCustomSoundLibrary(null);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    let value: CustomSoundLibrary = normalizeCustomSoundLibrary(null);
    try {
      tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(uid);
      request.onsuccess = () => { value = normalizeCustomSoundLibrary(request.result); };
    } catch {
      db.close();
      reject(new Error('Не вдалося прочитати мелодії.'));
      return;
    }
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      db.close();
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      finish(new Error('Читання мелодій триває надто довго. Спробуйте перезавантажити вкладку.'));
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
    }, STORAGE_TIMEOUT_MS);
    tx.oncomplete = () => finish();
    tx.onerror = () => finish(new Error('Не вдалося прочитати мелодії.'));
    tx.onabort = () => finish(new Error('Читання мелодій перервано.'));
  });
}

async function write(uid: string, value?: CustomSoundLibrary): Promise<void> {
  if (!uid || uid === 'guest') throw new Error('Спочатку увійдіть у профіль.');
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, 'readwrite');
      if (value && value.tracks.length) tx.objectStore(STORE).put(value, uid);
      else tx.objectStore(STORE).delete(uid);
    } catch {
      db.close();
      reject(new Error('Не вдалося зберегти мелодії на пристрої.'));
      return;
    }
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      db.close();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      finish(new Error('Сховище не підтвердило збереження мелодій. Можливо, на пристрої бракує місця.'));
      try { tx.abort(); } catch { /* Already committed or inactive. */ }
    }, STORAGE_TIMEOUT_MS);
    tx.oncomplete = () => finish();
    tx.onerror = () => finish(new Error('Не вдалося зберегти мелодії на пристрої. Перевірте вільне місце.'));
    tx.onabort = () => finish(new Error('Збереження мелодій перервано.'));
  });
}

function checkAudioDuration(file: File): Promise<void> {
  if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function')
    return Promise.reject(new Error('Цей браузер не підтримує перевірку аудіофайлів.'));
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let settled = false;
    const cleanup = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      // Do not call audio.load() again during cleanup: some browsers re-enter
      // the decoder and stall the tab while replacing the media resource.
      audio.pause();
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => cleanup(new Error('Не вдалося прочитати аудіофайл.')), 12_000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0)
        cleanup(new Error('Браузер не зміг визначити тривалість аудіофайлу.'));
      else if (audio.duration > MAX_CUSTOM_SOUND_SECONDS)
        cleanup(new Error('Оберіть мелодію тривалістю не більше 20 секунд.'));
      else cleanup();
    };
    audio.onerror = () => cleanup(new Error('Файл пошкоджений або цей аудіоформат не підтримується браузером.'));
    try {
      audio.src = url;
      audio.load();
    } catch {
      cleanup(new Error('Не вдалося відкрити MP3 у браузері.'));
    }
  });
}

export async function getCustomNotificationSound(uid: string): Promise<CustomNotificationSound | null> {
  const library = await read(uid);
  return library.tracks.find(track => track.id === library.selectedId) || null;
}

export async function listCustomNotificationSounds(uid: string): Promise<{
  selectedId: string; tracks: Array<{ id: string; name: string; savedAt: number }>;
}> {
  const library = await read(uid);
  return {
    selectedId: library.selectedId,
    tracks: library.tracks.map(({ id, name, savedAt }) => ({ id, name, savedAt })),
  };
}

function trackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

/** Validates all files before any write: a failed import does not wipe old sounds. */
export async function saveCustomNotificationSounds(
  uid: string, files: readonly File[], onProgress?: (done: number, total: number) => void,
): Promise<SavedSoundTrack[]> {
  if (!uid || uid === 'guest') throw new Error('Спочатку увійдіть у профіль.');
  if (files.length === 0) return [];
  // Reject invalid/oversized files BEFORE opening IndexedDB or decoding any MP3.
  for (const file of files) {
    const issue = validateCustomNotificationSound(file);
    if (issue) throw new Error(`${file.name}: ${issue}`);
  }
  if (files.length > MAX_CUSTOM_SOUND_TRACKS)
    throw new Error(`Можна зберегти не більше ${MAX_CUSTOM_SOUND_TRACKS} мелодій на пристрої.`);
  const library = await read(uid);
  if (files.length + library.tracks.length > MAX_CUSTOM_SOUND_TRACKS)
    throw new Error(`Можна зберегти не більше ${MAX_CUSTOM_SOUND_TRACKS} мелодій на пристрої.`);
  for (let i = 0; i < files.length; i++) {
    try {
      await checkAudioDuration(files[i]);
    } catch (error) {
      throw new Error(`${files[i].name}: ${error instanceof Error ? error.message : 'Файл не підтримується.'}`);
    }
    onProgress?.(i + 1, files.length);
  }
  const now = Date.now();
  const added = files.map((file, index): SavedSoundTrack => ({
    id: trackId(), name: file.name.slice(0,100), blob: file, savedAt: now + index,
  }));
  await write(uid, { version: 2, selectedId: added[0].id, tracks: [...library.tracks, ...added] });
  return added;
}

export async function saveCustomNotificationSound(uid: string, file: File): Promise<CustomNotificationSound> {
  const [saved] = await saveCustomNotificationSounds(uid, [file]);
  return saved;
}

export async function selectCustomNotificationSound(uid: string, id: string): Promise<void> {
  const library = await read(uid);
  if (!library.tracks.some(track => track.id === id)) throw new Error('Мелодію не знайдено на цьому пристрої.');
  await write(uid, { ...library, selectedId: id });
}

/** Without id, retains legacy behavior: removes every local custom sound. */
export async function removeCustomNotificationSound(uid: string, id?: string): Promise<void> {
  if (!id) { await write(uid); return; }
  const library = await read(uid);
  const tracks = library.tracks.filter(track => track.id !== id);
  await write(uid, {
    version: 2,
    selectedId: library.selectedId === id ? (tracks[0]?.id || '') : library.selectedId,
    tracks,
  });
}
