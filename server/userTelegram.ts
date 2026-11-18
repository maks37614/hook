import fs from 'node:fs';
import path from 'node:path';
import { writePrivateJsonAtomic } from './privateAtomicJson';
import { normalizeLanguage, type SupportedLanguage } from '../src/locales';

interface StoredTelegram {
  mode?: 'shared'; botId?: string; chatId?: string; username?: string;
  language?: SupportedLanguage; updatedAt?: string; confirmedAt?: string; needsConfirmation?: boolean;
}
export interface UserTelegramData extends StoredTelegram {
  /** Derived from the server environment; never persisted per user. */
  botToken?: string;
}
export function getSharedTelegramBot(): { botToken: string; botId: string } | undefined {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) return undefined;
  return { botToken, botId: botToken.split(':')[0] };
}
const configFile = path.join(process.cwd(), 'server/data/user_telegram.json');
let cache: Map<string, StoredTelegram> | undefined;
function persist(next: Map<string, StoredTelegram>) {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  writePrivateJsonAtomic(configFile, JSON.stringify(Object.fromEntries(next), null, 2));
  // Never expose a new Telegram connection or a migrated configuration in
  // memory before its disk checkpoint is durable.
  cache = next;
}
export function loadUserTelegram(): Map<string, StoredTelegram> {
  if (!cache) {
    let raw: string | null;
    try {
      raw = fs.readFileSync(configFile, 'utf8');
    } catch (error) {
      // Only an absent file is a fresh configuration. Permission / I/O
      // failures must not silently replace existing accounts with {}.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      raw = null;
    }
    const stored: unknown = raw === null ? {} : JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored))
      throw new Error('Invalid user Telegram configuration');
    const next = new Map<string, StoredTelegram>();
    let migrated = false;
    const allowed = new Set(['mode', 'botId', 'chatId', 'username', 'language', 'updatedAt', 'confirmedAt', 'needsConfirmation']);
    for (const [userId, value] of Object.entries(stored)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid user Telegram configuration');
      const item = value as Record<string, unknown>;
      if (item.chatId !== undefined && typeof item.chatId !== 'string') throw new Error('Invalid user Telegram destination');
      if (item.mode === 'shared') {
        next.set(userId, {
          mode: 'shared', botId: typeof item.botId === 'string' ? item.botId : undefined,
          chatId: typeof item.chatId === 'string' ? item.chatId : undefined,
          username: typeof item.username === 'string' ? item.username : undefined,
          language: normalizeLanguage(typeof item.language === 'string' ? item.language : undefined),
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
          confirmedAt: typeof item.confirmedAt === 'string' ? item.confirmedAt : undefined,
          needsConfirmation: Boolean(item.needsConfirmation),
        });
        if (Object.keys(item).some(key => !allowed.has(key))) migrated = true;
      } else {
        // Remove old personal bot secrets and never inherit their chat addresses.
        next.set(userId, {
          language: normalizeLanguage(typeof item.language === 'string' ? item.language : undefined),
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
          needsConfirmation: Boolean(item.botToken || item.chatId || item.needsConfirmation),
        });
        if (Object.keys(item).some(key => key !== 'language' && key !== 'updatedAt')) migrated = true;
      }
    }
    if (migrated) {
      // Legacy personal bot tokens are removed only by a successful atomic
      // migration. If rename fails, re-read the original on the next request.
      persist(next);
    } else {
      // Existing shared-bot files from an older release may have been saved
      // with a permissive umask. Secure them even if no user edits a setting.
      if (raw !== null) fs.chmodSync(configFile, 0o600);
      cache = next;
    }
  }
  return cache!;
}
export function getUserTelegram(userId?: string): UserTelegramData | undefined {
  if (!userId || userId === 'guest') return undefined;
  const stored = loadUserTelegram().get(userId);
  if (!stored) return undefined;
  const bot = getSharedTelegramBot();
  const active = Boolean(bot && stored.mode === 'shared' && stored.botId === bot.botId && stored.chatId && stored.confirmedAt);
  return {
    ...stored, botToken: active ? bot!.botToken : undefined,
    chatId: active ? stored.chatId : undefined, confirmedAt: active ? stored.confirmedAt : undefined,
    needsConfirmation: Boolean(stored.needsConfirmation || (stored.chatId && !active)),
  };
}
/** Alert sync can change language only; legacy tokens and chat IDs are ignored. */
export function saveUserTelegram(userId: string, changes: Partial<UserTelegramData>): void {
  if (!userId || userId === 'guest') throw new Error('Увійдіть у свій акаунт, щоб підключити Telegram');
  const existing = loadUserTelegram().get(userId) || {};
  const language = changes.language === undefined ? existing.language : normalizeLanguage(changes.language);
  if (language === existing.language) return;
  const next = new Map(loadUserTelegram());
  next.set(userId, { ...existing, language, updatedAt: new Date().toISOString() });
  persist(next);
}
/** Only a verified one-time /start from Telegram calls this function. */
export function connectUserTelegram(userId: string, botId: string, chatId: string, language: SupportedLanguage = 'uk', username?: string): void {
  const bot = getSharedTelegramBot();
  if (!userId || userId === 'guest' || !bot || bot.botId !== botId || !/^[1-9]\d{0,19}$/.test(chatId) || chatId === botId) throw new Error('invalid_destination');
  for (const [owner, item] of loadUserTelegram()) {
    if (owner !== userId && item.mode === 'shared' && item.botId === botId && item.chatId === chatId && item.confirmedAt) throw new Error('chat_already_linked');
  }
  const next = new Map(loadUserTelegram()), now = new Date().toISOString();
  next.set(userId, { mode: 'shared', botId, chatId, language: normalizeLanguage(language),
    username: username?.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32), confirmedAt: now, updatedAt: now });
  persist(next);
}
export function disconnectUserTelegram(userId: string): void {
  if (!userId || userId === 'guest') throw new Error('invalid_user');
  const next = new Map(loadUserTelegram());
  next.set(userId, { mode: 'shared', language: next.get(userId)?.language, updatedAt: new Date().toISOString() });
  persist(next);
}
export function disconnectTelegramChat(botId: string, chatId: string): SupportedLanguage | undefined {
  for (const [userId, item] of loadUserTelegram()) {
    if (item.mode === 'shared' && item.botId === botId && item.chatId === chatId && item.confirmedAt) {
      disconnectUserTelegram(userId);
      return normalizeLanguage(item.language);
    }
  }
}
