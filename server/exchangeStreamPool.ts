import WebSocket, { type RawData } from 'ws';
import { EventEmitter } from 'node:events';
import { publicStreamUrl, validBybitTopic, type ExchangeProvider } from '../src/utils/exchangeEndpoints';
import { exchangeGatewayStatus, pauseExchange } from './exchangeGateway';

interface Book { bids: Map<string, string>; asks: Map<string, string>; last: any }
interface Entry {
  key: string; baseKey: string; url: string; provider: ExchangeProvider; socket?: WebSocket; clients: Set<SharedExchangeSocket>;
  routes: Map<string, Set<SharedExchangeSocket>>; unassigned: Set<SharedExchangeSocket>; topicChars: number;
  topics: Map<string, number>; books: Map<string, Book>; tickers: Map<string, any>;
  timer?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>; commands?: ReturnType<typeof setTimeout>; sentTopics: Set<string>;
}
/** Each consumer owns listeners/subscriptions, while market connections are shared across accounts. */
export class SharedExchangeSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  readonly topics = new Set<string>();
  get connectionKey() { return this.entry.key; }
  constructor(readonly entry: Entry, private pool: ExchangeStreamPool, readonly combined = true) { super(); this.on('error', () => {}); }
  send(data: string | Buffer) { this.pool.subscribe(this, String(data)); }
  close(code = 1000, reason = '') { this.pool.release(this, code, reason); }
  terminate() { this.close(); }
}

export class ExchangeStreamPool {
  private entries = new Map<string, Entry>();
  private attempts: number[] = [];
  private nextAttempt = 0;
  constructor(private create: (url: string) => WebSocket = url => new WebSocket(url, { handshakeTimeout: 10_000 }), private now: () => number = Date.now) {}
  open(source: string, initialTopics: string[] = []): SharedExchangeSocket {
    const url = publicStreamUrl(source);
    if (!url) throw new Error('Непідтримуваний біржовий потік');
    const provider = url.hostname.includes('bybit') ? 'bybit' : 'binance';
    const isCombined = url.pathname.endsWith('/stream');
    if (initialTopics.length > 20 || initialTopics.some(topic => !validBybitTopic(topic))) throw new Error('Некоректні початкові теми');
    const streams = provider === 'binance' ? isCombined ? (url.searchParams.get('streams') || '').split('/') : [decodeURIComponent(url.pathname.split('/ws/')[1])] : [...new Set(initialTopics)];
    const baseKey = provider === 'bybit' ? url.href : `${url.origin}:${url.pathname.startsWith('/public/') ? 'public' : url.pathname.startsWith('/market/') ? 'market' : 'spot'}`;
    const policy = exchangeGatewayStatus().find(item => item.exchange === provider);
    if (policy?.disabled) throw new Error('Ринкове джерело призупинено власником');
    const hold = policy?.pausedUntil;
    if (hold) throw new Error('Підключення до біржі призупинено до ' + new Date(hold).toISOString());
    const family = [...this.entries.values()].filter(entry => entry.baseKey === baseKey);
    const fits = (entry: Entry) => {
      const added = streams.filter(topic => !entry.topics.has(topic)), reserve = provider === 'bybit' && !streams.length ? 30 : 0;
      return entry.topics.size + added.length + (entry.unassigned.size * 30) + reserve <= 400 &&
        entry.topicChars + added.reduce((sum, topic) => sum + topic.length + 3, 0) + entry.unassigned.size * 3000 + reserve * 100 < 18000;
    };
    let entry = streams.length ? family.find(entry => streams.every(topic => entry.topics.has(topic))) : undefined;
    entry ||= family.find(fits);
    if (!entry) {
      if (this.entries.size >= 160) throw new Error('Досягнуто безпечної місткості ринкових потоків');
      const upstream = new URL(url);
      if (provider === 'binance') { upstream.pathname = url.pathname.startsWith('/public/') ? '/public/stream' : url.pathname.startsWith('/market/') ? '/market/stream' : '/stream'; upstream.search = '?streams=' + streams.join('/'); }
      let index = 0; while (this.entries.has(baseKey + '#' + index)) index++;
      const key = baseKey + '#' + index;
      entry = { key, baseKey, url: upstream.href, provider, clients: new Set(), topics: new Map(), books: new Map(), tickers: new Map(), routes: new Map(), unassigned: new Set(), topicChars: 0, sentTopics: new Set(provider === 'binance' ? streams : []) };
      this.entries.set(key, entry);
      this.schedule(entry);
    }
    if (entry.idle) { clearTimeout(entry.idle); entry.idle = undefined; }
    const client = new SharedExchangeSocket(entry, this, isCombined); entry.clients.add(client);
    if (provider === 'bybit' && !streams.length) entry.unassigned.add(client);
    for (const topic of streams) this.addTopic(entry, client, topic);
    if (streams.length && entry.socket?.readyState === WebSocket.OPEN) this.command(entry);
    if (entry.socket?.readyState === WebSocket.OPEN) queueMicrotask(() => this.openClient(client));
    return client;
  }
  private addTopic(entry: Entry, client: SharedExchangeSocket, topic: string) {
    client.topics.add(topic);
    const count = entry.topics.get(topic) || 0; entry.topics.set(topic, count + 1);
    if (!count) entry.topicChars += topic.length + 3;
    const listeners = entry.routes.get(topic) || new Set<SharedExchangeSocket>(); listeners.add(client); entry.routes.set(topic, listeners);
  }
  private dropTopic(entry: Entry, client: SharedExchangeSocket, topic: string) {
    client.topics.delete(topic); entry.routes.get(topic)?.delete(client);
    const count = (entry.topics.get(topic) || 1) - 1;
    if (count) entry.topics.set(topic, count);
    else { entry.topics.delete(topic); entry.routes.delete(topic); entry.topicChars -= topic.length + 3; entry.books.delete(topic); entry.tickers.delete(topic); }
  }
  private openClient(client: SharedExchangeSocket) {
    if (client.readyState !== WebSocket.CONNECTING) return;
    client.readyState = WebSocket.OPEN;
    try { client.emit('open'); } catch (error) { client.emit('error', error); client.close(1013, 'Підписка недоступна'); }
  }
  private schedule(entry: Entry) {
    const now = this.now();
    this.attempts = this.attempts.filter(at => now - at < 300_000);
    const delay = Math.max(0, this.nextAttempt - now, this.attempts.length >= 100 ? this.attempts[0] + 300_001 - now : 0);
    this.nextAttempt = now + delay + 200;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (!entry.clients.size) return this.remove(entry);
      this.attempts = this.attempts.filter(at => this.now() - at < 300_000);
      if (this.attempts.length >= 100) return this.schedule(entry);
      const policy = exchangeGatewayStatus().find(item => item.exchange === entry.provider);
      if (policy?.pausedUntil || policy?.disabled) return this.finish(entry, 1013, 'Біржа тимчасово призупинена');
      this.attempts.push(this.now());
      try { this.connect(entry); } catch { this.finish(entry, 1013, 'Не вдалося підключитися до біржі'); }
    }, delay);
    entry.timer.unref?.();
  }
  private connect(entry: Entry) {
    const socket = this.create(entry.url); entry.socket = socket;
    socket.on('open', () => {
      if (entry.provider === 'bybit') {
        entry.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('{"op":"ping"}'); }, 20_000);
        entry.heartbeat.unref?.();
      }
      for (const client of entry.clients) this.openClient(client);
      this.command(entry);
    });
    socket.on('message', data => this.message(entry, data));
    socket.on('unexpected-response', (_request, response) => {
      if ([403, 418, 429, 451].includes(response.statusCode || 0)) pauseExchange(entry.provider, response.statusCode!, Number(response.headers['retry-after'] || 0) * 1000);
      response.resume(); socket.terminate();
      this.finish(entry, 1013, 'Біржа відхилила підключення');
    });
    socket.on('error', () => { this.finish(entry, 1013, 'З’єднання з біржею втрачено'); });
    socket.on('close', () => this.finish(entry, 1012, 'Перепідключення до біржі'));
  }
  private message(entry: Entry, raw: RawData) {
    let message: any;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (entry.provider === 'binance') {
      if (message.code !== undefined || message.e === 'serverShutdown' || message.data?.e === 'serverShutdown') return this.finish(entry, 1012, 'Біржа перепідключає ринковий потік');
      let plain: Buffer | undefined;
      if (message.stream) for (const client of entry.routes.get(message.stream) || []) if (client.readyState === WebSocket.OPEN)
        client.emit('message', client.combined ? raw : (plain ||= Buffer.from(JSON.stringify(message.data))));
      return;
    }
    if ([10006, 10009, 10429].includes(message.retCode) || /too many|frequency/i.test(message.ret_msg || message.retMsg || '')) {
      pauseExchange('bybit', message.retCode === 10009 ? 418 : 429);
      this.finish(entry, 1013, 'Біржа обмежила частоту підписок'); return;
    }
    if (message.topic?.startsWith('orderbook.')) {
      let book = entry.books.get(message.topic);
      if (!book || message.type === 'snapshot' || message.data?.u === 1) book = { bids: new Map(), asks: new Map(), last: message };
      for (const [rows, levels] of [[message.data?.b, book.bids], [message.data?.a, book.asks]] as const) {
        for (const [price, amount] of rows || []) Number(amount) === 0 ? levels.delete(String(price)) : levels.set(String(price), String(amount));
      }
      book.last = message; entry.books.set(message.topic, book);
    } else if (message.topic?.startsWith('tickers.')) {
      const previous = message.type === 'snapshot' ? {} : entry.tickers.get(message.topic)?.data;
      entry.tickers.set(message.topic, { ...message, type: 'snapshot', data: { ...previous, ...message.data } });
    }
    for (const client of message.topic ? entry.routes.get(message.topic) || [] : entry.clients) if (client.readyState === WebSocket.OPEN) client.emit('message', raw);
  }
  subscribe(client: SharedExchangeSocket, value: string) {
    if (client.readyState !== WebSocket.OPEN) throw new Error('Потік ще не підключений');
    const entry = client.entry;
    if (entry.provider !== 'bybit') throw new Error('Параметри Binance-потоку задаються при підключенні');
    const command = JSON.parse(value);
    if (command.op === 'ping') { queueMicrotask(() => client.emit('message', Buffer.from('{"op":"pong"}'))); return; }
    if (!['subscribe', 'unsubscribe'].includes(command.op) || !Array.isArray(command.args) || command.args.length > 20 || command.args.some((topic: unknown) => !validBybitTopic(topic))) throw new Error('Некоректна підписка');
    if (command.op === 'subscribe' && client.topics.size + command.args.filter((topic: string) => !client.topics.has(topic)).length > 30) throw new Error('Забагато підписок');
    const newTopics = (command.args as string[]).filter(topic => !entry.topics.has(topic));
    if (command.op === 'subscribe' && (entry.topics.size + newTopics.length > 400 || entry.topicChars + newTopics.reduce((n, topic) => n + topic.length + 3, 0) >= 18000)) throw new Error('Досягнуто ліміту тем біржі');
    entry.unassigned.delete(client);
    const added: string[] = [], removed: string[] = [];
    for (const topic of command.args as string[]) {
      if (command.op === 'subscribe' && !client.topics.has(topic)) {
        const count = entry.topics.get(topic) || 0; this.addTopic(entry, client, topic);
        if (!count) added.push(topic);
        else {
          const book = entry.books.get(topic);
          const snapshot = book ? { ...book.last, type: 'snapshot', data: { ...book.last.data, b: [...book.bids], a: [...book.asks] } } : entry.tickers.get(topic);
          if (snapshot) queueMicrotask(() => { if (client.readyState === WebSocket.OPEN && client.topics.has(topic)) client.emit('message', Buffer.from(JSON.stringify(snapshot))); });
        }
      } else if (command.op === 'unsubscribe' && client.topics.has(topic)) {
        this.dropTopic(entry, client, topic); if (!entry.topics.has(topic)) removed.push(topic);
      }
    }
    this.command(entry);
  }
  private command(entry: Entry) {
    if (entry.commands || entry.socket?.readyState !== WebSocket.OPEN) return;
    // Combine subscriptions from different clients; at most four commands per second.
    entry.commands = setTimeout(() => {
      entry.commands = undefined;
      if (entry.socket?.readyState !== WebSocket.OPEN) return;
      const removed = [...entry.sentTopics].filter(topic => !entry.topics.has(topic)).slice(0, 10);
      const added = [...entry.topics.keys()].filter(topic => !entry.sentTopics.has(topic)).slice(0, 10);
      const args = removed.length ? removed : added, op = removed.length ? 'unsubscribe' : 'subscribe';
      if (!args.length) return;
      for (const topic of args) op === 'subscribe' ? entry.sentTopics.add(topic) : entry.sentTopics.delete(topic);
      entry.socket.send(JSON.stringify(entry.provider === 'bybit' ? { op, args } : { method: op.toUpperCase(), params: args, id: this.now() })); this.command(entry);
    }, 250); entry.commands.unref?.();
  }
  release(client: SharedExchangeSocket, code = 1000, reason = '') {
    if (client.readyState === WebSocket.CLOSED) return;
    const entry = client.entry;
    for (const topic of [...client.topics]) this.dropTopic(entry, client, topic);
    entry.unassigned.delete(client); this.command(entry);
    client.readyState = WebSocket.CLOSED; entry.clients.delete(client);
    client.emit('close', code, Buffer.from(reason));
    if (!entry.clients.size && !entry.idle) {
      entry.idle = setTimeout(() => this.remove(entry), 30_000); entry.idle.unref?.();
    }
  }
  private finish(entry: Entry, code: number, reason: string) {
    if (this.entries.get(entry.key) !== entry) return;
    this.entries.delete(entry.key);
    for (const client of [...entry.clients]) { client.readyState = WebSocket.CLOSED; client.emit('close', code, Buffer.from(reason)); }
    entry.clients.clear(); this.remove(entry);
  }
  private remove(entry: Entry) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (entry.timer) clearTimeout(entry.timer); if (entry.idle) clearTimeout(entry.idle);
    if (entry.commands) clearTimeout(entry.commands); if (entry.heartbeat) clearInterval(entry.heartbeat);
    if (entry.socket && entry.socket.readyState !== WebSocket.CLOSED) entry.socket.terminate();
    entry.books.clear(); entry.tickers.clear();
    entry.routes.clear(); entry.unassigned.clear();
  }
  stats() { return { connections: this.entries.size, consumers: [...this.entries.values()].reduce((n, entry) => n + entry.clients.size, 0), topics: [...this.entries.values()].reduce((n, entry) => n + entry.topics.size, 0), connectionAttempts5m: this.attempts.filter(at => this.now() - at < 300_000).length }; }
  stop() { for (const entry of [...this.entries.values()]) this.finish(entry, 1001, 'Сервер перезапускається'); }
}
export const exchangeStreamPool = new ExchangeStreamPool();
export const openExchangeSocket = (url: string, initialTopics?: string[]) => exchangeStreamPool.open(url, initialTopics);
