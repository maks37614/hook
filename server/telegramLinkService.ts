import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DATA_DIR, readJson, writeJson } from './storage';
import { getEffectiveTelegramConfig, getTelegramBotInfo } from './telegramService';
import { loadUserTelegram, saveUserTelegram, disconnectUserTelegram } from './alertService';
import { normalizeLanguage, type SupportedLanguage } from '../src/locales';

interface Link { userId: string; expiresAt: number; language: SupportedLanguage; }
interface LinkState { offset: number; botId?: string; links: Record<string, Link>; }
const file = path.join(DATA_DIR, 'telegram_links.json');
let cached: LinkState | undefined;
const state = () => cached ||= readJson<LinkState>(file, { offset: 0, links: {} });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopped = false;
let lastError: string | undefined;
let lastPollAt: number | undefined;

export async function createTelegramLink(userId: string, language?: string) {
  if (!userId || userId === 'guest') throw new Error('Увійдіть у свій обліковий запис');
  const info = await getTelegramBotInfo();
  if (!info.ok || !info.username) throw new Error('Адміністратор має налаштувати Telegram-бота на сервері');
  const current = state();
  for (const [key, link] of Object.entries(current.links)) if (link.userId === userId || link.expiresAt <= Date.now()) delete current.links[key];
  const token = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + 10 * 60 * 1000;
  current.links[hash(token)] = { userId, expiresAt, language: normalizeLanguage(language) };
  writeJson(file, current);
  return { url: `https://t.me/${info.username}?start=${token}`, expiresAt };
}

export function unlinkTelegram(userId: string) {
  const current = state();
  for (const [key, link] of Object.entries(current.links)) if (link.userId === userId) delete current.links[key];
  writeJson(file, current);
  disconnectUserTelegram(userId);
}

export function processTelegramUpdate(update: any): boolean {
  const message = update.message;
  if (message?.chat?.type !== 'private' || message.from?.is_bot ||
      String(message.from?.id) !== String(message.chat.id)) return false;
  const token = typeof message.text === 'string' ? message.text.match(/^\/start(?:@\w+)? ([A-Za-z0-9_-]{32})$/)?.[1] : undefined;
  if (!token) return false;
  const current = state();
  const key = hash(token);
  const link = current.links[key];
  if (!link || link.expiresAt <= Date.now()) return false;
  const chatId = String(message.chat.id);
  // A private Telegram account may belong to only one site account.
  for (const [uid, data] of loadUserTelegram()) if (uid !== link.userId && data.mode === 'shared' && data.chatId === chatId) return false;
  saveUserTelegram(link.userId, { mode: 'shared', chatId, language: link.language }, true);
  delete current.links[key];
  writeJson(file, current);
  return true;
}

export async function pollTelegramUpdatesOnce() {
  if (running) return;
  const { botToken } = getEffectiveTelegramConfig();
  if (!botToken) return;
  running = true;
  try {
    const current = state();
    const botId = botToken.split(':')[0];
    if (current.botId !== botId) { current.botId = botId; current.offset = 0; }
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: current.offset, timeout: 20, allowed_updates: ['message'] }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.result)) throw new Error(`Telegram polling failed (${data.error_code || response.status}); check getWebhookInfo and ensure only one poller`);
    for (const update of data.result) {
      if (!Number.isSafeInteger(update.update_id)) continue;
      processTelegramUpdate(update);
      current.offset = Math.max(current.offset, update.update_id + 1);
      writeJson(file, current);
    }
    lastPollAt = Date.now(); lastError = undefined;
  } catch (error: any) { lastError = error.message; }
  finally { running = false; }
}

export function getTelegramPollingStatus() { return { enabled: !!getEffectiveTelegramConfig().botToken, lastPollAt, lastError }; }
export function startTelegramPolling() {
  if (timer) return;
  stopped = false;
  const run = async () => {
    await pollTelegramUpdatesOnce();
    if (!stopped) timer = setTimeout(run, lastError ? 5000 : 1000);
  };
  timer = setTimeout(run, 0);
}
export function stopTelegramPolling() { stopped = true; if (timer) clearTimeout(timer); timer = undefined; }
