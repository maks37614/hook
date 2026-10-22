import type { Express } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getPaperFormationSnapshots, getPaperMarketSnapshot } from './marketService';
import { getMarketSourceStatuses } from './marketTickerFeed';
import type { Timeframe } from '../src/types';

/** Install before session middleware: a dedicated, read-only service credential. */
export function installPaperFeed(app: Express) {
  app.get('/api/paper/formations', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const expected = process.env.HOOK_PAPER_FEED_TOKEN || '';
    if (expected.length < 32) return void res.sendStatus(503);
    const received = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] || '';
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(expected), hash(received))) return void res.sendStatus(401);
    const watch = typeof req.query.watch === 'string' && req.query.watch ? req.query.watch.split(',') : [];
    const timeframes = typeof req.query.tfs === 'string' ? req.query.tfs.split(',') : ['1m', '5m', '15m'];
    const formationTf = req.query.formationTf || '1h';
    if ((req.query.watch !== undefined && typeof req.query.watch !== 'string') || (req.query.tfs !== undefined && typeof req.query.tfs !== 'string')
      || typeof formationTf !== 'string' || !['1m', '5m', '15m', '1h', '4h', '1d'].includes(formationTf)
      || watch.length > 12 || watch.some(value => !/^(binance|bybit):(spot|futures):[\p{L}\p{N}]{3,60}$/u.test(value))
      || timeframes.length > 6 || timeframes.some(value => !['1m', '5m', '15m', '1h', '4h', '1d'].includes(value)))
      return void res.status(400).json({ success: false, error: 'Invalid bounded cache selection' });
    const snapshots = getPaperFormationSnapshots(Date.now(), formationTf as Timeframe);
    const market = getPaperMarketSnapshot(watch, timeframes);
    const ready = snapshots.length > 0 || market.quotes.length > 0;
    res.status(ready ? 200 : 503).json({
      version: 2, success: ready, market,
      generatedAt: Date.now(), snapshots,
      sources: getMarketSourceStatuses({ exchange: 'all', marketType: 'all' }),
      ...(!ready ? { error: 'No cached market data; waiting for the existing site collectors.' } : {}),
    });
  });
}
