import { currentAuthToken } from './authenticatedFetch';
import { exchangeProvider, publicMarketUrl, publicStreamUrl } from './exchangeEndpoints';

/** Same-origin public-data relay. Existing callers retain their native cancellation and JSON handling. */
export function installMarketTransport() {
  const authenticated = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (!exchangeProvider(url)) return authenticated(input, init);
    const publicUrl = publicMarketUrl(url);
    if (!publicUrl || (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'GET') return Promise.reject(new Error('Біржові дані доступні через захищений серверний API'));
    return authenticated('/api/market/source?url=' + encodeURIComponent(publicUrl.href), { signal: init?.signal || (input instanceof Request ? input.signal : undefined) });
  };
}

/** Auth travels in the first frame, never in URLs, proxy logs or query strings. */
export class MarketWebSocket extends (typeof window === 'undefined' ? EventTarget : window.EventTarget) {
  static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSING = 2; static readonly CLOSED = 3;
  readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3;
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private wire: WebSocket;
  readonly url: string;
  constructor(source: string | URL) {
    super();
    const url = publicStreamUrl(String(source));
    if (!url) throw new Error('Непідтримуваний ринковий потік');
    this.url = url.href;
    const relay = new URL('/api/market/stream', location.href); relay.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; relay.searchParams.set('source', url.href);
    this.wire = new window.WebSocket(relay.href);
    this.wire.onopen = async () => {
      try {
        const token = await currentAuthToken();
        if (this.readyState !== 0) return;
        if (!token) { this.close(4001, 'Потрібен вхід'); return; }
        this.wire.send(JSON.stringify({ type: 'auth', token }));
      } catch { this.close(4001, 'Не вдалося підтвердити сесію'); }
    };
    this.wire.onmessage = event => {
      if (this.readyState === 0) {
        try { if (JSON.parse(String(event.data)).type !== 'hook2.ready') return; } catch { return; }
        this.readyState = 1;
        const opened = new window.Event('open'); this.onopen?.(opened); this.dispatchEvent(opened); return;
      }
      if (this.readyState !== 1) return;
      const message = new window.MessageEvent('message', { data: event.data }); this.onmessage?.(message); this.dispatchEvent(message);
    };
    this.wire.onerror = () => { const error = new window.Event('error'); this.onerror?.(error); this.dispatchEvent(error); };
    this.wire.onclose = event => {
      this.readyState = 3;
      const closed = new window.CloseEvent('close', { code: event.code, reason: event.reason, wasClean: event.wasClean });
      this.onclose?.(closed); this.dispatchEvent(closed);
    };
  }
  send(data: Parameters<WebSocket['send']>[0]) {
    if (this.readyState !== 1) throw new DOMException('Socket not open', 'InvalidStateError');
    this.wire.send(data);
  }
  close(code = 1000, reason = '') { if (this.readyState >= 2) return; this.readyState = 2; this.wire.close(code, reason); }
  get bufferedAmount() { return this.wire.bufferedAmount; }
  get binaryType() { return this.wire.binaryType; }
  set binaryType(value: BinaryType) { this.wire.binaryType = value; }
}
