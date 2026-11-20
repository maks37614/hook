'use strict';
const { createHash } = require('node:crypto');

const META_PORT_START = 17845;
const META_PORT_END = 17855;
const POLL_TIMEOUT_MS = 26_000;
const TICKER_PATTERN = /^[A-Z0-9]{2,30}$/;

function normalizeCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const symbol = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase() : '';
  const exchange = input.exchange;
  const marketType = input.marketType;
  const group = typeof input.binding === 'string' && /^\d{1,3}$/.test(input.binding.trim())
    ? Number(input.binding) : NaN;
  if (!TICKER_PATTERN.test(symbol) || !['binance','bybit'].includes(exchange)
    || !['futures','spot'].includes(marketType) || !Number.isInteger(group)
    || group < 1 || group > 500) return null;
  return {
    symbol, exchange, marketType, binding: String(group).padStart(3,'0'),
    tickerPattern: exchange.toUpperCase()+':'+symbol+(marketType==='futures'?'.p':''),
  };
}

async function jsonFetch(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {...options, signal:controller.signal, redirect:'error'});
    // Reading JSON is also bound by the same deadline. A local service may
    // send HTTP headers then stall the body indefinitely.
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * MetaScalp's UI inventory includes each panel's binding group and connection.
 * A mixed spot/futures group must switch its panels individually: sending
 * BINANCE:BTCUSDT.p to the whole group asks a spot book to open a futures pair.
 *
 * Never accept an external URL: every read/write below targets the already
 * discovered MetaScalp loopback port and a GUID from its own UI inventory.
 */
const DOCUMENT_GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_LINKED_PANELS = 16;
function linkedTickerDocuments(state, binding) {
  if (!state || !Array.isArray(state.windows) || !Array.isArray(state.standaloneCharts))
    return null; // Older API: no compatible inventory.
  const docs = [];
  for (const window of state.windows) {
    if (!Array.isArray(window?.tabs)) continue;
    for (const tab of window.tabs) {
      if (Array.isArray(tab?.documents)) docs.push(...tab.documents);
    }
  }
  docs.push(...state.standaloneCharts);
  const matched = docs.filter(doc => doc && Number.isInteger(doc.linkNumber)
    && doc.linkNumber === binding && ['orderBook','chart'].includes(doc.kind));
  if (matched.length > MAX_LINKED_PANELS) return { error: 'METASCALP_TOO_MANY_PANELS' };
  const found = [];
  const ids = new Set();
  for (const doc of matched) {
    // A blank chart can share this binding without having an exchange yet.
    // Do not let it block two active order books (e.g. Binance and Bybit).
    // An unbound order book is still an error: never invent a connection.
    if (doc.kind === 'chart' && (doc.connectionId === null || doc.connectionId === undefined))
      continue;
    if (!DOCUMENT_GUID.test(doc.externalId || '') || !Number.isSafeInteger(doc.connectionId)
      || doc.connectionId <= 0) return { error: 'METASCALP_UNBOUND_PANEL' };
    const id = doc.externalId.toLowerCase();
    if (ids.has(id)) continue;
    ids.add(id);
    found.push({ externalId: id, connectionId: doc.connectionId, kind: doc.kind });
  }
  return { documents: found, orderBookCount: found.filter(doc => doc.kind === 'orderBook').length };
}

/** Local writes are restricted to ticker-only actions. NEVER trading orders. */
class MetaScalpTickerSender {
  constructor(fetchImpl = globalThis.fetch) {
    this.fetch = fetchImpl;
    this.port = null;
    this.lastCommandKey = '';
    this.lastCommandAt = 0;
  }
  async findPort() {
    const ports = this.port === null ? [] : [this.port];
    for(let p = META_PORT_START; p <= META_PORT_END; p++) if (!ports.includes(p)) ports.push(p);
    for (const port of ports) {
      try {
        const response = await jsonFetch(this.fetch, 'http://127.0.0.1:'+port+'/ping',
          {method:'GET',headers:{Accept:'application/json'}}, 450);
        if (!response.ok) continue;
        if (response.body?.app === 'MetaScalp') { this.port = port; return port; }
      } catch { /* Port not listening, try next */ }
    }
    this.port = null;
    return null;
  }
  async send(raw) {
    const command = normalizeCommand(raw);
    if (!command) return {ok:false, reason:'INVALID_TICKER'};
    const key = command.tickerPattern+'|'+command.binding;
    const now = Date.now();
    if (key === this.lastCommandKey && now - this.lastCommandAt < 300)
      return {ok:true, duplicate:true};
    const port = await this.findPort();
    if (port === null) return {ok:false, reason:'METASCALP_OFFLINE'};
    const base = 'http://127.0.0.1:'+port;
    try {
      let linked=null;
      try {
        const inventory = await jsonFetch(this.fetch,base+'/api/ui/state',{
          method:'GET',headers:{Accept:'application/json'},
        },1200);
        if (inventory.ok) linked=linkedTickerDocuments(inventory.body,Number(command.binding));
      } catch { /* Older MetaScalp: preserve existing group-linking behavior. */ }
      if (linked?.error) return {ok:false,reason:linked.error};
      // Empty inventory might be a legacy binding representation; let the
      // original MetaScalp endpoint validate the requested named group.
      const docs=linked?.documents || [];
      // One order book: honor the exact Spot/Futures market selected on h00k.
      // Two or more books in ANY link group (001-500): keep each book's
      // existing market/connection, even when the connection IDs coincide.
      // Charts alone never turn a single-book group into mixed-market mode.
      if (linked?.orderBookCount >= 2) {
        // Each request includes only {ticker}, NEVER the website's exchange
        // or a replacement connectionId. MetaScalp inherits the current
        // Binance/Bybit and Spot/Futures connection of that exact panel.
        const results = await Promise.all(docs.map(async doc => {
          try {
            const response = await jsonFetch(this.fetch,
              base+'/api/ui/documents/'+doc.externalId+'/ticker',{
                method:'PUT',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ticker:command.symbol}),
              },1600);
            return response.ok && response.body?.status === 'ok';
          } catch { return false; }
        }));
        const succeeded=results.filter(Boolean).length;
        if (succeeded !== docs.length) return {
          ok:false,reason:'METASCALP_PARTIAL',succeeded,total:docs.length,
        };
        this.lastCommandKey=key;
        this.lastCommandAt=Date.now();
        return {ok:true,port,mode:'per-panel',panels:succeeded};
      }
      // Zero/one order book (or older API without UI inventory): honor
      // the website-selected market and its original .p futures suffix.
      const response = await jsonFetch(this.fetch,base+'/api/change-ticker',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tickerPattern:command.tickerPattern,binding:command.binding}),
      },1400);
      if (!response.ok || response.body?.status !== 'ok') return {ok:false, reason:'METASCALP_REJECTED'};
      this.lastCommandKey=key;
      this.lastCommandAt=Date.now();
      return {ok:true,port,mode:'named-group',legacy:linked===null};
    } catch {
      this.port=null;
      return {ok:false, reason:'METASCALP_UNREACHABLE'};
    }
  }
}

class DesktopTickerRelayClient {
  constructor({getCookie, onCommand, onStatus, fetchImpl=globalThis.fetch,
      baseUrl='https://h00k.top'} = {}) {
    if (typeof getCookie !== 'function' || typeof onCommand !== 'function')
      throw new Error('Desktop relay requires cookie provider and command handler');
    if (baseUrl !== 'https://h00k.top') throw new Error('Only the h00k production origin is supported');
    this.getCookie=getCookie;
    this.onCommand=onCommand;
    this.onStatus=typeof onStatus === 'function' ? onStatus : ()=>{};
    this.fetch=fetchImpl;
    this.baseUrl=baseUrl;
    this.running=false;
    this.seq=0;
    this.epoch=null;
    this.sessionFingerprint=null;
    this.currentAbort=null;
    this.pendingDelay=null;
    this.status='disabled';
  }
  setStatus(value) {
    if (this.status === value) return;
    this.status=value;
    this.onStatus(value);
  }
  start() {
    if (this.running) return;
    this.running=true;
    void this.run();
  }
  stop() {
    this.running=false;
    this.currentAbort?.abort();
    this.pendingDelay?.();
    this.pendingDelay=null;
    this.setStatus('disabled');
  }
  delay(ms) {
    if (!this.running) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pendingDelay=null; resolve(); }, ms);
      this.pendingDelay = () => { clearTimeout(timer); resolve(); };
    });
  }
  async run() {
    while (this.running) {
      try {
        // Never persist, expose to the website renderer or log the HttpOnly cookie.
        const cookie = await this.getCookie();
        if (!this.running) break;
        if (!cookie) {
          this.seq=0;
          this.epoch=null;
          this.sessionFingerprint=null;
          this.setStatus('sign-in');
          await this.delay(5000);
          continue;
        }
        // Different account / renewed session: its server-side sequence may
        // start at 1. Never carry the previous account's cursor forward.
        const fingerprint = createHash('sha256').update(cookie).digest('hex');
        if (fingerprint !== this.sessionFingerprint) {
          this.sessionFingerprint=fingerprint;
          this.seq=0;
          this.epoch=null;
        }
        const controller = new AbortController();
        this.currentAbort=controller;
        const timer=setTimeout(()=>controller.abort(),POLL_TIMEOUT_MS);
        let response, data=null;
        const cursor = '/api/desktop-link/poll?after='+this.seq+
          (this.epoch ? '&epoch='+encodeURIComponent(this.epoch) : '');
        try {
          response=await this.fetch(this.baseUrl+cursor, {
            method:'GET', headers:{Cookie:cookie,Accept:'application/json'},
            cache:'no-store',redirect:'error',signal:controller.signal,
          });
          // Keep AbortController active while reading the response body.
          if (response.status === 200) data=await response.json();
        } finally {clearTimeout(timer);this.currentAbort=null;}
        if (!this.running) break;
        // VPS restarts reset its in-memory sequence. Reset our cursor when its
        // unique session changes, otherwise a long-lived Desktop misses tickers.
        const epoch = response.headers?.get?.('X-h00k-Desktop-Epoch');
        if (epoch && epoch !== this.epoch) {
          this.epoch=epoch;
          this.seq=0;
        }
        if (response.status === 401 || response.status === 403) {
          this.setStatus('sign-in');
          await this.delay(5000);continue;
        }
        if (response.status === 204) {
          if (this.status !== 'metascalp-offline' && this.status !== 'metascalp-error')
            this.setStatus('connected');
          continue;
        }
        if (response.status !== 200) throw new Error('Relay response: '+response.status);
        this.setStatus('connected');
        const command=data?.command;
        if (!command || !Number.isSafeInteger(command.seq) || command.seq<=this.seq) continue;
        this.seq=command.seq;
        // Freshness is enforced against the VPS clock before delivery.
        // The Windows clock may differ from the VPS clock by >15 seconds.
        if (!Number.isFinite(command.createdAt) || command.createdAt <= 0) continue;
        // The user may have signed out while the old account's long poll
        // was pending. Do not execute an old user's command after the switch.
        const currentCookie = await this.getCookie();
        if (!this.running || !currentCookie ||
          createHash('sha256').update(currentCookie).digest('hex') !== this.sessionFingerprint) {
          this.seq=0;
          this.epoch=null;
          this.sessionFingerprint=null;
          continue;
        }
        const result=await this.onCommand(command);
        if (result?.reason === 'METASCALP_OFFLINE' || result?.reason === 'METASCALP_UNREACHABLE')
          this.setStatus('metascalp-offline');
        else if (result?.reason) this.setStatus('metascalp-error');
      } catch (error) {
        if (!this.running) break;
        this.setStatus('relay-unavailable');
        await this.delay(3500);
      }
    }
  }
}

module.exports = { normalizeCommand, linkedTickerDocuments, MetaScalpTickerSender, DesktopTickerRelayClient };
