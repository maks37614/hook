import { gzip as gzipCallback, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Express, Request, Response } from 'express';
import type { ExchangeId, MarketCoin, MarketType } from '../src/types';
import { fetchMarketCoins } from './marketService';
import { getMarketSourceStatuses } from './marketTickerFeed';

const gzip = promisify(gzipCallback);

export type QuoteSelection = {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  minVolumeUsd: number;
  maxVolumeUsd: number;
};

type SourceStatus = ReturnType<typeof getMarketSourceStatuses>[number];
export type PublicQuotesPayload = {
  success: boolean;
  count: number;
  data: MarketCoin[];
  timestamp: number | null;
  sources: SourceStatus[];
  partial: boolean;
  error?: string;
};

type Snapshot = {
  at: number;
  httpStatus: number;
  raw: Buffer;
  compressed: Buffer | null;
  etagRaw: string;
  etagCompressed: string | null;
};

export class PublicQuoteCapacityError extends Error {
  constructor() { super('Public quote service is busy; retry shortly'); this.name = 'PublicQuoteCapacityError'; }
}

export type QuoteDependencies = {
  fetchCoins: (selection: QuoteSelection) => Promise<MarketCoin[]>;
  sourceStatuses: (selection: Pick<QuoteSelection, 'exchange' | 'marketType'>) => SourceStatus[];
};

const DEFAULT_DEPENDENCIES: QuoteDependencies = {
  fetchCoins: fetchMarketCoins,
  sourceStatuses: getMarketSourceStatuses,
};

/**
 * Large public quote responses are identical across many active browsers.
 * Coalesce requests, JSON serialization and gzip once every two seconds
 * per selection. This changes neither the JSON schema nor user-specific state.
 */
export class PublicQuoteResponseCache {
  private readonly completed = new Map<string, Snapshot>();
  private readonly pending = new Map<string, Promise<Snapshot>>();
  private builders = 0;
  private cacheHits = 0;
  private concurrentShared = 0;
  private overloaded = 0;
  private deliveredResponses = 0;
  private gzipResponses = 0;
  private queuedPayloadBytes = 0;
  private equivalentUncompressedBytes = 0;

  constructor(
    private readonly dependencies: QuoteDependencies = DEFAULT_DEPENDENCIES,
    private readonly now = Date.now,
    private readonly ttlMs = process.env.H00K_QUOTE_CACHE === '0' ? 0 : 2_000,
    private readonly maxKeys = 8,
  ) {}

  stats() {
    return { cachedSelections: this.completed.size, inFlight: this.pending.size,
      generated: this.builders, cacheHits: this.cacheHits,
      concurrentShared: this.concurrentShared,
      overloaded: this.overloaded,
      deliveredResponses: this.deliveredResponses,
      gzipResponses: this.gzipResponses,
      queuedPayloadBytes: this.queuedPayloadBytes,
      equivalentUncompressedBytes: this.equivalentUncompressedBytes,
      avoidedPayloadBytes: Math.max(0, this.equivalentUncompressedBytes - this.queuedPayloadBytes) };
  }

  /** Aggregate payload estimates; actual TCP bytes also include transport overhead. */
  noteDelivery(rawBytes: number, sentBytes: number, compressed: boolean) {
    this.deliveredResponses++;
    if (compressed) this.gzipResponses++;
    this.queuedPayloadBytes += sentBytes;
    this.equivalentUncompressedBytes += rawBytes;
  }

  async get(selection: QuoteSelection): Promise<Snapshot> {
    const key = JSON.stringify([selection.exchange, selection.marketType,
      selection.minVolumeUsd, selection.maxVolumeUsd]);
    const cached = this.completed.get(key);
    const now = this.now();
    if (cached && now >= cached.at && now - cached.at < this.ttlMs) {
      this.cacheHits++;
      return cached;
    }
    const inFlight = this.pending.get(key);
    if (inFlight) {
      this.concurrentShared++;
      return inFlight;
    }

    // Coalesce unlimited readers of the same selection, but do not permit
    // unbounded *different* query variants to trigger concurrent expensive
    // market-location enrichment / JSON / gzip work.
    if (this.pending.size >= this.maxKeys) {
      this.overloaded++;
      throw new PublicQuoteCapacityError();
    }

    const pending = (async () => {
      const data = await this.dependencies.fetchCoins(selection);
      const sources = this.dependencies.sourceStatuses(selection);
      const available = sources.filter(source => source.status !== 'unavailable');
      const success = available.length > 0;
      const payload: PublicQuotesPayload = {
        success,
        count: data.length,
        data,
        timestamp: success ? Math.min(...available.map(source => source.updatedAt!)) : null,
        sources,
        partial: sources.some(source => source.status !== 'live'),
        ...(!success ? { error: sources.map(source =>
          `${source.exchange} ${source.marketType}: ${source.error || 'дані недоступні'}`).join('; ') } : {}),
      };

      const raw = Buffer.from(JSON.stringify(payload));
      // Speed priority: gzip level 1 usually provides a large reduction for
      // repetitive coin JSON without making compression itself a CPU hotspot.
      // Compression is done once per cached snapshot, never once per browser.
      let compressed: Buffer | null = null;
      if (raw.length > 4096 && process.env.H00K_QUOTE_GZIP !== '0') {
        try {
          const encoded = await gzip(raw, { level: constants.Z_BEST_SPEED });
          if (encoded.length < raw.length) compressed = encoded;
        } catch {
          // Return exactly the original uncompressed payload on gzip errors.
        }
      }
      this.builders++;
      const snapshot: Snapshot = {
        at: this.now(), httpStatus: success ? 200 : 503, raw, compressed,
        etagRaw: '"' + createHash('sha256').update(raw).digest('hex') + '"',
        etagCompressed: compressed
          ? '"' + createHash('sha256').update(compressed).digest('hex') + '"' : null,
      };
      this.completed.delete(key);
      this.completed.set(key, snapshot);
      while (this.completed.size > this.maxKeys)
        this.completed.delete(this.completed.keys().next().value!);
      return snapshot;
    })();

    this.pending.set(key, pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }
}

function acceptsGzip(acceptEncoding: string | undefined) {
  if (!acceptEncoding) return false;
  const tokens = acceptEncoding.toLowerCase().split(',').map(part => {
    const [encoding, ...attributes] = part.trim().split(';').map(s => s.trim());
    const q = attributes.find(param => param.startsWith('q='));
    const quality = q === undefined ? 1 : Number(q.slice(2));
    return { encoding, quality };
  });
  const specific = tokens.find(t => t.encoding === 'gzip');
  if (specific) return Number.isFinite(specific.quality) && specific.quality > 0;
  const wildcard = tokens.find(t => t.encoding === '*');
  return Boolean(wildcard && Number.isFinite(wildcard.quality) && wildcard.quality > 0);
}

export function installMarketQuoteRoutes(
  app: Express,
  cache = new PublicQuoteResponseCache(),
) {
  app.get(['/api/market/quotes', '/api/screener/coins'], async (req: Request, res: Response) => {
    try {
      const exchange = (req.query.exchange as 'all' | ExchangeId) || 'all';
      const marketType = (req.query.marketType as 'all' | MarketType) || 'all';
      const minVolumeUsd = req.query.minVolume !== undefined
        ? parseFloat(req.query.minVolume as string) : 50_000;
      const maxVolumeUsd = req.query.maxVolume !== undefined
        ? parseFloat(req.query.maxVolume as string) : Number.MAX_VALUE;

      if (!['all', 'binance', 'bybit'].includes(exchange) ||
          !['all', 'spot', 'futures'].includes(marketType) ||
          !Number.isFinite(minVolumeUsd) || !Number.isFinite(maxVolumeUsd) ||
          minVolumeUsd < 0 || maxVolumeUsd < minVolumeUsd) {
        res.status(400).json({ success: false,
          error: 'Некоректні параметри біржі, ринку або обсягу' });
        return;
      }

      const snapshot = await cache.get({ exchange, marketType, minVolumeUsd, maxVolumeUsd });
      res.setHeader('Cache-Control', 'no-store');
      res.vary('Accept-Encoding');
      res.type('application/json');
      const body = snapshot.compressed && acceptsGzip(req.get('accept-encoding'))
        ? snapshot.compressed : snapshot.raw;
      if (body === snapshot.compressed) res.setHeader('Content-Encoding', 'gzip');
      // Avoid Express hashing 1.6+ MiB separately for every browser response.
      res.setHeader('ETag', body === snapshot.compressed
        ? snapshot.etagCompressed! : snapshot.etagRaw);
      cache.noteDelivery(snapshot.raw.length, body.length, body === snapshot.compressed);
      res.status(snapshot.httpStatus).send(body);
    } catch (err: any) {
      if (err instanceof PublicQuoteCapacityError) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Retry-After', '2');
        res.status(503).json({ success: false, error: 'Market quotes are busy; retry shortly' });
        return;
      }
      console.error('Error fetching screener coins:', err);
      res.status(500).json({ success: false,
        error: err?.message || 'Failed to fetch coins' });
    }
  });
}

export const publicQuoteResponseCache = new PublicQuoteResponseCache();
