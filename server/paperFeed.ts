import type { Express } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getPaperFormationSnapshots } from './marketService';
import { getMarketSourceStatuses } from './marketTickerFeed';

/** Install before session middleware: a dedicated, read-only service credential. */
export function installPaperFeed(app: Express) {
  app.get('/api/paper/formations', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const expected = process.env.HOOK_PAPER_FEED_TOKEN || '';
    if (expected.length < 32) return void res.sendStatus(503);
    const received = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] || '';
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(expected), hash(received))) return void res.sendStatus(401);
    const snapshots = getPaperFormationSnapshots();
    res.status(snapshots.length ? 200 : 503).json({
      success: snapshots.length > 0,
      generatedAt: Date.now(), snapshots,
      sources: getMarketSourceStatuses({ exchange: 'all', marketType: 'all' }),
      ...(!snapshots.length ? { error: 'No fresh cached formations; waiting for the existing screener cron.' } : {}),
    });
  });
}
