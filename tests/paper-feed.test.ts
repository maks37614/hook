import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { installPaperFeed } from '../server/paperFeed';
import { getPaperFormationSnapshots } from '../server/marketService';

test('paper feed is disabled by default, uses a separate credential and never starts scans', async () => {
  const previous = process.env.HOOK_PAPER_FEED_TOKEN;
  const app = express(); installPaperFeed(app);
  app.use('/api', (_req, res) => { res.sendStatus(401); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (token = '') => fetch(base + '/api/paper/formations', { headers: { Authorization: `Bearer ${token}` } });
  try {
    delete process.env.HOOK_PAPER_FEED_TOKEN;
    assert.equal((await request()).status, 503);
    process.env.HOOK_PAPER_FEED_TOKEN = 'x'.repeat(64);
    assert.equal((await request()).status, 401);
    assert.equal((await request('wrong')).status, 401);
    const before = getPaperFormationSnapshots();
    const result = await request('x'.repeat(64));
    assert.equal(result.status, before.length ? 200 : 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const body = await result.json();
    assert.deepEqual(body.snapshots, before);
    assert.deepEqual(getPaperFormationSnapshots(), before, 'reading the feed must not populate scan cache');
    assert.equal((await fetch(base + '/api/screener/scan', { headers: { Authorization: `Bearer ${'x'.repeat(64)}` } })).status, 401);
  } finally {
    if (previous === undefined) delete process.env.HOOK_PAPER_FEED_TOKEN; else process.env.HOOK_PAPER_FEED_TOKEN = previous;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
