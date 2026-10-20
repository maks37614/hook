import { accessService } from './accessService';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR, readJson, writeJson } from './storage';
import { getUserTelegram, loadHistory, saveHistory } from './alertService';
import { sendTelegramMessage } from './telegramService';
import type { NotificationEventPayload } from './notificationRouter';

interface DeliveryInput {
  id?: string; userId: string; alertId?: string; triggeredAt?: number; triggeredPrice?: number; coinId?: string; htmlMessage: string;
  expiresAt?: number; scopedKey?: string;
  gate?: Pick<NotificationEventPayload, 'source' | 'symbol' | 'exchange' | 'marketType' | 'eventType' | 'eventIdentity' | 'triggerMode'>;
}
export interface Delivery extends DeliveryInput {
  id: string; createdAt: number; expiresAt: number; nextAttemptAt: number; attempts: number;
  status: 'pending' | 'sent' | 'failed' | 'cancelled'; error?: string; sentAt?: number; part: number;
}

export class NotificationOutbox {
  private cached?: Delivery[];
  private running = false;
  private timer?: NodeJS.Timeout;
  private chatNext = new Map<string, number>();
  private botNext = new Map<string, number>();
  constructor(private file = path.join(DATA_DIR, 'notification_outbox.json')) {}
  private jobs() { return this.cached ||= readJson<Delivery[]>(this.file, []); }
  private persist() { writeJson(this.file, this.jobs()); }

  public enqueue(input: DeliveryInput): Delivery {
    if (!input.userId || input.userId === 'guest') throw new Error('A notification requires an authenticated owner');
    const existing = this.jobs().find(job => input.id ? job.id === input.id : input.scopedKey && job.scopedKey === input.scopedKey && job.status === 'pending');
    if (existing) return existing;
    const now = Date.now();
    // Retain recent delivery/cooldown evidence, without unbounded completed history.
    this.cached = this.jobs().filter(job => job.status === 'pending' || job.createdAt > now - 7 * 86400000);
    const job: Delivery = { ...input, id: input.id || randomUUID(), createdAt: now,
      expiresAt: input.expiresAt || now + 60 * 60 * 1000, nextAttemptAt: now, attempts: 0, status: 'pending', part: 0 };
    this.jobs().push(job);
    this.persist();
    return job;
  }

  public lastAccepted(scopedKey: string): number {
    return this.jobs().reduce((last, job) => job.scopedKey === scopedKey && ['pending', 'sent'].includes(job.status) ? Math.max(last, job.createdAt) : last, 0);
  }
  public stats(userId: string) {
    const jobs = this.jobs().filter(job => job.userId === userId);
    return { pending: jobs.filter(job => job.status === 'pending').length,
      failed: jobs.filter(job => job.status === 'failed').length,
      lastError: [...jobs].reverse().find(job => job.error && job.status !== 'sent')?.error };
  }
  private updateHistory(job: Delivery) {
    if (!job.alertId) return;
    const history = loadHistory();
    // One alert can be reactivated; update only this trigger's history.
    const record = history.find(item => item.userId === job.userId && item.alertId === job.alertId &&
      item.triggeredAt === job.triggeredAt);
    if (record) { record.telegramSent = job.status === 'sent'; record.telegramError = job.status === 'sent' ? undefined : job.error; saveHistory(history); }
  }

  public async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (const job of this.jobs()) {
        if (job.status !== 'pending') continue;
        const now = Date.now();
        if (!accessService.hasFullAccess(job.userId)) { job.status = 'cancelled'; job.error = 'Повний доступ завершився'; this.persist(); this.updateHistory(job); continue; }
        if (job.expiresAt <= now) { job.status = 'failed'; job.error = 'Час доставки минув'; this.persist(); this.updateHistory(job); continue; }
        if (job.nextAttemptAt > now) continue;
        let tg = getUserTelegram(job.userId);
        if (tg?.mode === 'disconnected') { job.status = 'cancelled'; job.error = 'Telegram відключено'; this.persist(); this.updateHistory(job); continue; }
        if (!tg?.botToken || !tg.chatId) { job.nextAttemptAt = now + 10000; this.persist(); continue; }
        if (job.coinId && job.gate) {
          const { findSurveillanceCoinById } = await import('./surveillanceService');
          const coin = findSurveillanceCoinById(job.coinId, job.userId)?.coin;
          const { notificationRouter } = await import('./notificationRouter');
          if (!coin || !notificationRouter.shouldNotify({ ...job.gate, userId: job.userId, coinId: job.coinId, coin, forceNotify: true }).allowed) {
            job.status = 'cancelled'; job.error = 'Стеження вимкнено або налаштування змінено'; this.persist(); continue;
          }
        }
        tg = getUserTelegram(job.userId);
        if (!tg?.botToken || !tg.chatId) { job.nextAttemptAt = Date.now(); this.persist(); continue; }
        const botKey = tg.botToken.split(':')[0];
        const chatKey = `${botKey}:${tg.chatId}`;
        const availableAt = Math.max(this.chatNext.get(chatKey) || 0, this.botNext.get(botKey) || 0);
        if (availableAt > now) { job.nextAttemptAt = availableAt; this.persist(); continue; }
        // Long analysis messages are split into plain text parts, preserving all content.
        const plain = job.htmlMessage.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        const parts: string[] = [];
        if (job.htmlMessage.length <= 4000) parts.push(job.htmlMessage);
        else for (let start = 0; start < plain.length;) {
          let end = Math.min(start + 3500, plain.length);
          const last = plain.charCodeAt(end - 1);
          if (end < plain.length && last >= 0xD800 && last <= 0xDBFF) end--;
          parts.push(plain.slice(start, end)); start = end;
        }
        job.attempts++;
        this.chatNext.set(chatKey, now + 1100); this.botNext.set(botKey, now + 40);
        const result = await sendTelegramMessage(parts[job.part], { botToken: tg.botToken, chatId: tg.chatId, plainText: job.htmlMessage.length > 4000 });
        if (result.success) {
          job.part++;
          if (job.part >= parts.length) { job.status = 'sent'; job.sentAt = Date.now(); job.error = undefined; }
          else job.nextAttemptAt = Date.now() + 1100;
        } else {
          job.error = result.error || 'Доставка не вдалася';
          if (result.permanent) job.status = 'failed';
          else {
            const wait = Math.max((result.retryAfterSeconds || 0) * 1000, Math.min(300000, 1000 * 2 ** Math.min(job.attempts, 8)));
            job.nextAttemptAt = Date.now() + wait;
            if (result.retryAfterSeconds) this.botNext.set(botKey, job.nextAttemptAt);
          }
        }
        this.persist(); this.updateHistory(job);
      }
    } finally { this.running = false; }
  }
  public start() { if (!this.timer) { void this.drain().catch(console.error); this.timer = setInterval(() => void this.drain().catch(console.error), 1000); } }
  public stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
}
export const notificationOutbox = new NotificationOutbox();
