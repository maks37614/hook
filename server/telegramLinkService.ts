import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { normalizeLanguage, telegramText, type SupportedLanguage } from '../src/locales';
import { getTelegramBotInfo, sendTelegramMessage } from './telegramService';
import { connectUserTelegram, disconnectTelegramChat, disconnectUserTelegram, getSharedTelegramBot, getUserTelegram } from './userTelegram';

interface PendingLink { userId: string; codeHash: string; botId: string; createdAt: number; expiresAt: number; language: SupportedLanguage; errorCode?: string }
interface LinkState { botId?: string; botUsername?: string; nextOffset?: number; pending: PendingLink[] }
const file = path.join(process.cwd(), 'server/data/telegram_links.json');
let state: LinkState | undefined;
let polling: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pollingError: string | undefined;
let retryAfterMs = 2000;
let botInfoCache: { tokenHash: string; expiresAt: number; username: string } | undefined;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function load(): LinkState {
  if (!state) {
    let raw: string | null;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (error) {
      // Permission and I/O errors must not be interpreted as an empty link
      // store: that could overwrite users' outstanding verification links.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      raw = null;
    }
    const stored: LinkState = raw === null ? { pending: [] } : JSON.parse(raw);
    if (!stored || !Array.isArray(stored.pending) ||
        (stored.nextOffset !== undefined && !Number.isSafeInteger(stored.nextOffset)))
      throw new Error('Invalid Telegram link state');
    state = stored;
  }
  return state;
}
/** Persist the complete replacement before letting other requests observe it. */
function persist(next: LinkState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  try {
    // A temp left by an older release can retain mode 0644. Tighten it
    // *before* writing single-use verification hashes and user IDs.
    fs.chmodSync(temp, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  fs.writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
  state = next;
}
function prune(botId: string): LinkState {
  const current = load();
  const pending = current.pending.filter(link => link.expiresAt > Date.now() && link.botId === botId);
  if (pending.length === current.pending.length && current.botId === botId) return current;
  const next: LinkState = { ...current, pending, botId,
    botUsername: current.botId === botId ? current.botUsername : undefined,
    nextOffset: current.botId === botId ? current.nextOffset : undefined };
  persist(next);
  return next;
}
export function getSharedTelegramStatus(userId: string) {
  const bot = getSharedTelegramBot(), target = getUserTelegram(userId), current = load();
  const pending = current.pending.find(link => link.userId === userId && link.botId === bot?.botId && link.expiresAt > Date.now());
  return {
    success: true, serverConfigured: Boolean(bot),
    isConfigured: Boolean(target?.botToken && target.chatId && target.confirmedAt),
    needsConfirmation: Boolean(target?.needsConfirmation),
    botUsername: bot && current.botId === bot.botId ? current.botUsername : undefined,
    username: target?.chatId ? target.username : undefined,
    linkPending: Boolean(pending && !pending.errorCode), linkExpiresAt: pending?.expiresAt,
    linkError: pending?.errorCode, pollingError,
  };
}
export async function beginSharedTelegramLink(userId: string, language?: string) {
  if (!userId || userId === 'guest') return { success: false, errorCode: 'sign_in' };
  const bot = getSharedTelegramBot();
  if (!bot) return { success: false, errorCode: 'bot_unavailable' };
  const early = prune(bot.botId);
  if (early.pending.length >= 5000 && !early.pending.some(link => link.userId === userId)) return { success: false, errorCode: 'try_later' };
  if (early.pending.some(link => link.userId === userId && Date.now() - link.createdAt < 3000)) return { success: false, errorCode: 'try_later' };
  const tokenHash = hash(bot.botToken);
  let username = botInfoCache?.tokenHash === tokenHash && botInfoCache.expiresAt > Date.now() ? botInfoCache.username : undefined;
  if (!username) {
    const info = await getTelegramBotInfo(bot.botToken);
    if (!info.ok || !info.username || !/^[A-Za-z0-9_]+$/.test(info.username)) return { success: false, errorCode: 'bot_unavailable' };
    username = info.username;
    botInfoCache = { tokenHash, username, expiresAt: Date.now() + 300000 };
  }
  if (getSharedTelegramBot()?.botToken !== bot.botToken) return { success: false, errorCode: 'try_later' };
  // getMe() may have been in flight while another account created a link.
  // Recheck limits against the *latest* durable state, not the old snapshot.
  const current = prune(bot.botId);
  if (current.pending.length >= 5000 && !current.pending.some(link => link.userId === userId)) return { success: false, errorCode: 'try_later' };
  if (current.pending.some(link => link.userId === userId && Date.now() - link.createdAt < 3000)) return { success: false, errorCode: 'try_later' };
  const code = `h00k_${randomBytes(24).toString('base64url')}`, expiresAt = Date.now() + 600000;
  persist({ ...current, botUsername: username,
    pending: [...current.pending.filter(link => link.userId !== userId),
      { userId, codeHash: hash(code), botId: bot.botId, createdAt: Date.now(), expiresAt,
        language: normalizeLanguage(language) }],
  });
  return { success: true, url: `https://t.me/${username}?start=${code}`, botUsername: username, expiresAt };
}
export function disconnectSharedTelegram(userId: string) {
  // Revoke still-valid /start codes first. If the second disk write fails,
  // stale codes cannot reconnect a user who was already disconnected.
  const current = load();
  const pending = current.pending.filter(link => link.userId !== userId);
  if (pending.length !== current.pending.length) persist({ ...current, pending });
  disconnectUserTelegram(userId);
}
async function processUpdate(update: any, bot: { botToken: string; botId: string }) {
  const message = update.message, chatId = message?.chat?.id;
  if (message?.chat?.type !== 'private' || message.from?.is_bot || !Number.isSafeInteger(chatId) || chatId <= 0 || chatId !== message.from?.id) return;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (/^\/stop(?:@[A-Za-z0-9_]+)?$/.test(text)) {
    const language = disconnectTelegramChat(bot.botId, String(chatId));
    if (language) await sendTelegramMessage(telegramText(language, 'disconnected'), { botToken: bot.botToken, chatId: String(chatId) });
    return;
  }
  const code = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+(h00k_[A-Za-z0-9_-]+)$/)?.[1];
  if (!code) return;
  const link = load().pending.find(item => item.botId === bot.botId && item.codeHash === hash(code) && !item.errorCode);
  if (!link || link.expiresAt <= Date.now() || !Number.isFinite(message.date) || message.date * 1000 < link.createdAt - 5000) return;
  try { connectUserTelegram(link.userId, bot.botId, String(chatId), link.language, message.from.username); }
  catch (error) {
    if (error instanceof Error && error.message === 'chat_already_linked') {
      const current = load();
      persist({ ...current, pending: current.pending.map(item =>
        item.codeHash === link.codeHash ? { ...item, errorCode: 'chat_already_linked' } : item) });
      return;
    }
    throw error;
  }
  const current = load();
  persist({ ...current, pending: current.pending.filter(item => item.userId !== link.userId) });
  await sendTelegramMessage(telegramText(link.language, 'linked'), { botToken: bot.botToken, chatId: String(chatId) });
}
/** One process consumes and persists the shared bot update offset for every user. */
export async function pollSharedTelegramUpdates(timeoutSeconds = 0): Promise<void> {
  if (polling) return polling;
  polling = (async () => {
    const bot = getSharedTelegramBot();
    if (!bot) return;
    const current = prune(bot.botId);
    const response = await fetch(`https://api.telegram.org/bot${bot.botToken}/getUpdates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: current.nextOffset, limit: 100, timeout: timeoutSeconds, allowed_updates: ['message'] }),
      signal: AbortSignal.timeout((timeoutSeconds + 10) * 1000),
    });
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.result)) {
      pollingError = data.error_code === 409 ? 'bot_conflict' : 'bot_unavailable';
      retryAfterMs = Math.max(10000, (Number(data.parameters?.retry_after) || 0) * 1000);
      return;
    }
    if (getSharedTelegramBot()?.botToken !== bot.botToken) return;
    pollingError = undefined;
    retryAfterMs = data.result.length === 100 ? 50 : 250;
    const updates = data.result.filter((item: any) => Number.isSafeInteger(item.update_id) && item.update_id >= 0).sort((a: any,b: any) => a.update_id-b.update_id);
    for (const update of updates) {
      // processUpdate() can persist consumed links. Reload the latest state
      // before updating the offset so no in-flight account changes are lost.
      const before = load();
      if (before.nextOffset !== undefined && update.update_id < before.nextOffset) continue;
      await processUpdate(update, bot);
      const latest = load();
      persist({ ...latest, nextOffset: update.update_id + 1 });
    }
  })().catch(() => {
    pollingError = 'bot_unavailable';
    retryAfterMs = 10000;
    console.warn('[Telegram] Shared bot polling temporarily unavailable');
  }).finally(() => { polling = undefined; });
  return polling;
}
export function startSharedTelegramBot() {
  if (timer || !getSharedTelegramBot()) return;
  const tick = async () => { await pollSharedTelegramUpdates(20); timer = setTimeout(tick, retryAfterMs); timer.unref(); };
  timer = setTimeout(tick, 0);
  timer.unref();
}
