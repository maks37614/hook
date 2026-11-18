import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

export function liquidationUtcMonth(now: number): string {
  const date = new Date(now);
  // Malformed upstream timestamps must never crash the Liq ingest process.
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : '';
}


export type ArchivedLiquidation = {
  exchange: 'binance' | 'bybit';
  symbol: string;
  id: string;
  t: number;
  side: 'LONG' | 'SHORT';
  p: number;
  q: number;
  usd: number;
};
type HeatmapBin = {
  time: number; price: number; side: 'LONG' | 'SHORT'; usd: number; count: number;
};

/**
 * Optional durable observed-event store. Deduplicate by exchange/symbol/event
 * ID in PostgreSQL; Binance cumulative fills can ONLY increase a record.
 * No upstream subscriptions are created by this module.
 *
 * Default OFF for a low-RAM VPS. Operators must first test database IO and
 * retention with LIQ_ARCHIVE_ENABLED=1. This is NOT a future liquidation
 * prediction and not complete exchange history.
 */
export class LiquidationArchive {
  readonly enabled: boolean;
  private pool: Pool | null = null;
  private initialized: Promise<void> | null = null;
  private queue = new Map<string, ArchivedLiquidation>();
  private writing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryAfter = 0;
  private cleanupAfter = 0;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private monthlyWork: Promise<boolean> | null = null;
  private monthChecked: string | null = null;
  private lastMonthlyResetAt: number | null = null;
  private monthlyResets = 0;
  private counters = { stored: 0, failures: 0, rejected: 0, duplicateQueued: 0,
    batches: 0, lastWriteAt: 0, droppedOnOverflow: 0 };
  constructor(
    enabled = process.env.LIQ_ARCHIVE_ENABLED === '1',
    private readonly maxPending = 8000,
    private readonly poolFactory: () => Pool = () => new Pool({
      connectionString: process.env.DATABASE_URL || undefined,
      max: 1,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10_000,
      statement_timeout: 8000,
      application_name: 'h00k-liq-archive',
    }),
    private readonly now: () => number = Date.now,
  ) { this.enabled = enabled; }

  stats() {
    return { enabled: this.enabled, queued: this.queue.size, ...this.counters,
      retentionDays: 8, monthlyResetEnabled: this.enabled,
      monthChecked: this.monthChecked, monthlyResets: this.monthlyResets,
      lastMonthlyResetAt: this.lastMonthlyResetAt };
  }

  record(row: ArchivedLiquidation) {
    if (!this.enabled) return;
    // A late packet from the previous month must never resurrect events that
    // the first-of-month database purge has already erased.
    if (!row || !Number.isSafeInteger(row.t) ||
      liquidationUtcMonth(row.t) < liquidationUtcMonth(this.now()) ||
      !['binance','bybit'].includes(row.exchange) ||
      !/^[\p{L}\p{M}\p{N}]{3,80}$/u.test(row.symbol) ||
      typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 180 ||
      row.t < this.now() - 8 * 86400_000 ||
      row.t > this.now() + 2000 || (row.side !== 'LONG' && row.side !== 'SHORT') ||
      [row.p,row.q,row.usd].some(n => !Number.isFinite(n) || n <= 0)) {
      this.counters.rejected++;
      return;
    }
    const key = row.exchange + ':' + row.symbol + ':' + row.id;
    const old = this.queue.get(key);
    if (old && old.usd >= row.usd) {
      this.counters.duplicateQueued++;
      return;
    }
    if (!old && this.queue.size >= this.maxPending) {
      // Never pretend dropped events were archived. Observable in /ops stats.
      this.counters.droppedOnOverflow++;
      return;
    }
    this.queue.set(key, row);
    this.schedule();
  }

  private schedule(delayMs = 2000) {
    if (!this.enabled || this.timer || !this.queue.size) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
    this.timer.unref?.();
  }

  private database(): Pool {
    if (!this.pool) this.pool = this.poolFactory();
    return this.pool;
  }

  private async ready() {
    if (!this.initialized) this.initialized = (async () => {
      const schema = readFileSync(new URL('./migrations/003_liquidation_events.sql', import.meta.url),'utf8');
      const maintenance = readFileSync(
        new URL('./migrations/004_liquidation_monthly_reset.sql', import.meta.url),'utf8');
      await this.database().query(schema);
      await this.database().query(maintenance);
      // New installations start in their current month; the NEXT calendar
      // month triggers their first reset. Existing markers survive redeploys.
      await this.database().query(`
        INSERT INTO h00k_liquidation_archive_maintenance
          (task_name,last_completed_month)
        VALUES ('monthly',$1) ON CONFLICT (task_name) DO NOTHING
      `, [liquidationUtcMonth(this.now())]);
    })().catch(error => {
      this.initialized = null;
      throw error;
    });
    await this.initialized;
  }

  /**
   * Clear ONLY h00k_liquidation_events once per UTC calendar month.
   * PostgreSQL row lock + transaction make this idempotent across replicas
   * and restarts; TRUNCATE frees the archive's table/index storage immediately.
   * The unrelated user, alerts, trading and profile tables are never touched.
   * The existing 8-day age cleanup is retained as a secondary disk guard.
   */
  async runMonthlyCleanup(): Promise<boolean> {
    if (!this.enabled) return false;
    const month = liquidationUtcMonth(this.now());
    if (this.monthChecked === month) return false;
    if (this.monthlyWork) return this.monthlyWork;
    const work = (async () => {
      await this.ready();
      const client = await this.database().connect();
      let started = false;
      try {
        await client.query('BEGIN');
        started = true;
        const marker = await client.query(
          "SELECT last_completed_month FROM h00k_liquidation_archive_maintenance WHERE task_name='monthly' FOR UPDATE",
        );
        const previous = String(marker.rows[0]?.last_completed_month || '').trim();
        if (!previous) throw new Error('Monthly Liq archive maintenance marker missing');
        let reset = false;
        if (previous < month) {
          // Transaction protects concurrent archive writers: no half-purged
          // history or duplicated reset following process restart.
          await client.query('TRUNCATE TABLE h00k_liquidation_events');
          await client.query(`
            UPDATE h00k_liquidation_archive_maintenance
              SET last_completed_month=$1, last_run_at=NOW(), reset_count=reset_count+1
              WHERE task_name='monthly'
          `, [month]);
          reset = true;
        }
        await client.query('COMMIT');
        started = false;
        this.monthChecked = month;
        if (reset) {
          this.monthlyResets++;
          this.lastMonthlyResetAt = this.now();
          // Prevent queued previous-month packets from reappearing.
          for (const [key, row] of this.queue) {
            if (liquidationUtcMonth(row.t) < month) this.queue.delete(key);
          }
        }
        return reset;
      } catch (error) {
        if (started) await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    })();
    this.monthlyWork = work;
    try { return await work; }
    finally { if (this.monthlyWork === work) this.monthlyWork = null; }
  }

  /** One lightweight monthly-boundary check every 6h while archive is enabled.
   * Catch up on startup even if the VPS was off on the first of the month.
   * Disabled archives create NO timer, DB connection or periodic activity.
   */
  startMonthlyMaintenance(): void {
    if (!this.enabled || this.maintenanceTimer) return;
    const check = () => {
      void this.runMonthlyCleanup().catch(error => {
        console.warn('[LiquidationArchive] Monthly cleanup postponed:',
          error instanceof Error ? error.message : String(error));
      });
    };
    check();
    this.maintenanceTimer = setInterval(check, 6 * 60 * 60_000);
    this.maintenanceTimer.unref?.();
  }

  stopMonthlyMaintenance(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = null;
  }

  async flush(): Promise<void> {
    if (!this.enabled || !this.queue.size) return;
    if (this.writing) return this.writing;
    if (Date.now() < this.retryAfter) {
      this.schedule(Math.max(2000, this.retryAfter - Date.now()));
      return;
    }
    const items = [...this.queue].slice(0, 120);
    // Remove captured values before async work. If a later cumulative fill
    // arrives during INSERT it remains queued with the greater notional.
    for (const [key] of items) this.queue.delete(key);
    const work = (async () => {
      try {
        await this.runMonthlyCleanup();
        // Events captured immediately before UTC midnight can remain in the
        // pending batch. Discard them instead of reintroducing purged history.
        const activeItems = items.filter(([,row]) =>
          liquidationUtcMonth(row.t) >= liquidationUtcMonth(this.now()));
        if (!activeItems.length) return;
        const values: unknown[] = [];
        const placeholders = activeItems.map(([_, row], i) => {
          const base = i * 8;
          values.push(row.exchange,row.symbol,row.id,row.t,row.side,row.p,row.q,row.usd);
          return '(' + Array.from({length:8},(_,j)=>'$'+(base+j+1)).join(',') + ')';
        });
        await this.database().query(`
          INSERT INTO h00k_liquidation_events
            (exchange, symbol, event_id, event_time, side, price, quantity, observed_notional)
          SELECT v.exchange::text, v.symbol::text, v.event_id::text,
            to_timestamp(v.t::double precision / 1000.0),
            v.side::text, v.price::double precision, v.quantity::double precision,
            v.usd::double precision
          FROM (VALUES ${placeholders.join(',')})
            AS v(exchange, symbol, event_id, t, side, price, quantity, usd)
          ON CONFLICT (exchange,symbol,event_id) DO UPDATE
            SET price = EXCLUDED.price, quantity = EXCLUDED.quantity,
                observed_notional = EXCLUDED.observed_notional,
                updated_at = NOW()
            WHERE EXCLUDED.observed_notional > h00k_liquidation_events.observed_notional
        `, values);
        this.counters.batches++;
        this.counters.stored += activeItems.length;
        this.counters.lastWriteAt = Date.now();
        this.retryAfter = 0;
        if (Date.now() > this.cleanupAfter) {
          this.cleanupAfter = Date.now() + 15 * 60_000;
          // Delete in bounded chunks to avoid locking the 512 MB postgres.
          await this.database().query(`
            WITH expired AS (
              SELECT ctid FROM h00k_liquidation_events
              WHERE event_time < NOW() - INTERVAL '8 days' LIMIT 5000
            )
            DELETE FROM h00k_liquidation_events e USING expired
            WHERE e.ctid = expired.ctid
          `).catch(() => {});
        }
      } catch (error) {
        this.counters.failures++;
        this.retryAfter = Date.now() + 30_000;
        for (const [key,row] of items) {
          const newer=this.queue.get(key);
          if (!newer || newer.usd < row.usd) {
            if (this.queue.size < this.maxPending || this.queue.has(key))
              this.queue.set(key,row);
            else this.counters.droppedOnOverflow++;
          }
        }
        if (this.counters.failures < 3 || this.counters.failures % 20 === 0) {
          console.warn('[LiquidationArchive] PostgreSQL write unavailable:',
            error instanceof Error ? error.message : String(error));
        }
      }
    })();
    this.writing = work;
    try { await work; }
    finally {
      this.writing = null;
      if (this.queue.size) this.schedule(this.retryAfter ? 30_000 : 1000);
    }
  }

  async heatmap(exchange: 'binance' | 'bybit', symbol: string, hours: 24 | 168) {
    if (!this.enabled) return null;
    if (!['binance','bybit'].includes(exchange) ||
        !/^[\p{L}\p{M}\p{N}]{3,80}$/u.test(symbol)) return null;
    await this.runMonthlyCleanup();
    const seconds = hours === 24 ? 300 : 900;
    // 0.5% logarithmic price bucket, tied to absolute market price.
    // Display must use HookChart's *own price/time coordinate transforms*.
    const step = 1.005;
    const result = await this.database().query(`
      SELECT FLOOR(EXTRACT(EPOCH FROM event_time)/$3::double precision)*$3::double precision AS t,
        FLOOR(LN(price)/LN($4::double precision)) AS bin,
        side,
        SUM(observed_notional) AS amount,
        COUNT(*) AS orders
      FROM h00k_liquidation_events
      WHERE exchange = $1 AND symbol = $2
        AND event_time >= NOW() - ($5::integer * INTERVAL '1 hour')
      GROUP BY t,bin,side ORDER BY t DESC,bin,side LIMIT 6001
    `, [exchange,symbol,seconds,step,hours]);
    const truncated = result.rows.length > 6000;
    // Prefer the freshest intervals if the 7d dataset exceeds the response
    // limit, then order ascending for the chart's binary-search viewport cull.
    const bins: HeatmapBin[] = result.rows.slice(0,6000).reverse().map(row => ({
      time: Number(row.t) * 1000,
      price: step ** (Number(row.bin) + 0.5),
      side: row.side,
      usd: Number(row.amount),
      count: Number(row.orders),
    })).filter(row => Number.isFinite(row.price) && Number.isFinite(row.usd));
    return {
      source: 'observed_liquidations', exchange, symbol, hours,
      bins, truncated, complete: false,
      caveat: 'Лише отримані події ліквідацій. Прогалини у потоках і періоди без глядачів не відновлюються.',
    };
  }
}

export const liquidationArchive = new LiquidationArchive();
