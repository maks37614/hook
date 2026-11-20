import type { Express, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireUserAuth } from './userAuth';

/**
 * Very small, account-scoped control channel: no exchange feeds, snapshots,
 * trading actions, credentials or arbitrary local URLs are transported.
 * In-memory by design (single VPS process); latest symbol wins on reconnect.
 */
export interface DesktopTickerCommand {
  seq: number;
  symbol: string;
  exchange: 'binance' | 'bybit';
  marketType: 'spot' | 'futures';
  binding: string;
  createdAt: number;
}
type WaitingClient = { deliver: (command: DesktopTickerCommand) => void; cancel: () => void };
type DesktopSlot = {
  epoch: string;
  seq: number;
  latest: DesktopTickerCommand | null;
  lastPollAt: number;
  lastPushAt: number;
  waiters: Set<WaitingClient>;
};
const slots = new Map<string, DesktopSlot>();
const ONLINE_MS = 45_000;
const FRESH_MS = 15_000;
const WAIT_MS = 20_000;
const MAX_SLOTS = 512;

function cleanSlots(now: number) {
  for (const [uid, slot] of slots) {
    if (!slot.waiters.size && now - Math.max(slot.lastPollAt, slot.lastPushAt) > 120_000) slots.delete(uid);
  }
}
function findOrCreateSlot(uid: string): DesktopSlot | null {
  let slot = slots.get(uid);
  if (slot) return slot;
  if (slots.size >= MAX_SLOTS) cleanSlots(Date.now());
  if (slots.size >= MAX_SLOTS) return null;
  slot = { epoch: randomUUID(), seq: 0, latest: null, lastPollAt: 0, lastPushAt: 0, waiters: new Set() };
  slots.set(uid, slot);
  return slot;
}
export function parseDesktopTickerCommand(input: unknown): Omit<DesktopTickerCommand, 'seq' | 'createdAt'> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const symbol = typeof source.symbol === 'string' ? source.symbol.trim().toUpperCase() : '';
  const bindingNumber = typeof source.binding === 'string' && /^\d{1,3}$/.test(source.binding.trim())
    ? Number(source.binding.trim()) : NaN;
  if (!/^[A-Z0-9]{2,30}$/.test(symbol) || !Number.isInteger(bindingNumber)
    || bindingNumber < 1 || bindingNumber > 500
    || (source.exchange !== 'binance' && source.exchange !== 'bybit')
    || (source.marketType !== 'spot' && source.marketType !== 'futures')) return null;
  return {
    symbol, exchange: source.exchange, marketType: source.marketType,
    binding: String(bindingNumber).padStart(3, '0'),
  };
}

export function installDesktopLinkRelay(app: Express) {
  // Authentication always comes from the HttpOnly PostgreSQL session cookie.
  // POST also requires the site's normal same-origin + CSRF guard.
  app.get('/api/desktop-link/status', requireUserAuth, (_req, res) => {
    const slot = slots.get(res.locals.userId as string);
    res.set('Cache-Control', 'no-store');
    res.json({ online: !!slot && Date.now() - slot.lastPollAt <= ONLINE_MS });
  });

  app.get('/api/desktop-link/poll', requireUserAuth, (req, res: Response) => {
    const uid = res.locals.userId as string;
    const slot = findOrCreateSlot(uid);
    if (!slot) return void res.status(503).json({ error: 'BUSY' });
    const now = Date.now();
    res.set('X-h00k-Desktop-Epoch', slot.epoch);
    // Bound concurrent long polls per account to avoid hanging-request abuse.
    if (slot.waiters.size >= 2) return void res.status(429).json({ error: 'TOO_MANY_CLIENTS' });
    slot.lastPollAt = now;
    // The cursor belongs to this desktop client's current connection only.
    const afterRaw = typeof req.query.after === 'string' ? req.query.after : '';
    const after = /^\d{1,12}$/.test(afterRaw) ? Number(afterRaw) : 0;
    res.set({ 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    if (slot.latest && slot.latest.seq > after && now - slot.latest.createdAt <= FRESH_MS) {
      return void res.json({ command: slot.latest });
    }

    let closed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const waiter: WaitingClient = {
      deliver: command => {
        if (closed) return;
        cleanup();
        res.json({ command });
      },
      cancel: () => cleanup(),
    };
    function cleanup() {
      if (closed) return;
      closed = true;
      if (timeout) clearTimeout(timeout);
      slot!.waiters.delete(waiter);
    }
    timeout = setTimeout(() => {
      if (closed) return;
      cleanup();
      res.status(204).end();
    }, WAIT_MS);
    timeout.unref?.();
    slot.waiters.add(waiter);
    res.once('close', cleanup);
  });

  app.post('/api/desktop-link/push', requireUserAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const commandFields = parseDesktopTickerCommand(req.body);
    if (!commandFields) return void res.status(400).json({ error: 'INVALID_TICKER' });
    const slot = slots.get(res.locals.userId as string);
    const now = Date.now();
    if (!slot || now - slot.lastPollAt > ONLINE_MS)
      return void res.status(409).json({ error: 'DESKTOP_OFFLINE' });
    // Latest-click-wins, with a hard rate cap. No queue that can accumulate.
    if (now - slot.lastPushAt < 120)
      return void res.status(429).json({ error: 'TOO_FAST' });
    slot.lastPushAt = now;
    const command: DesktopTickerCommand = { ...commandFields, seq: ++slot.seq, createdAt: now };
    slot.latest = command;
    for (const waiter of [...slot.waiters]) waiter.deliver(command);
    res.status(202).json({ accepted: true, seq: command.seq });
  });
}
