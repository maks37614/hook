import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('retired Community transfer and signed-score API routes are absent', () => {
  const routes = source('../server/pgIdentityRoutes.ts');
  const archive = source('../src/components/ArchiveModal.tsx');
  assert.doesNotMatch(routes, /community-handoff|quality-proof|communityArchiveHandoff|archiveQualityProof/);
  assert.doesNotMatch(archive, /handleCopyQualityProof|archive\.communityScore|archive\.proofTitle/);
  assert.match(routes, /app\.get\('\/api\/account\/archive\/:id', requirePostgresSession/);
  assert.match(routes, /app\.get\('\/api\/account\/archive\/:id\/chart-image', requirePostgresSession/);
  assert.match(archive, /archive\.confluenceLabel/);
});

test('retired paper and mon endpoints are not mounted or imported', () => {
  const server = source('../server.ts');
  const assets = source('../server/productionAssets.ts');
  const market = source('../server/marketService.ts');
  for (const old of ['installPaperFeed', 'installMonMarketFeed', './server/paperFeed', './server/monMarketFeed', '/api/paper/formations', '/api/mon/feed', '/api/mon/candles']) {
    assert.equal(server.includes(old), false, old + ' must not remain in the server');
  }
  assert.equal(market.includes('getPaperFormationSnapshots'), false);
  assert.equal(market.includes('getPaperMarketSnapshot'), false);
  assert.ok(server.includes("app.get('/api/health'"), 'normal site health route must remain');
  assert.equal(server.includes('formationDensityFeed.start();'), false, 'retired bot depth streams must not start');
  assert.equal(server.includes("from './server/formationDensityFeed'"), false);
  assert.ok(server.includes('installHookChartDepthStream(httpServer)'), 'native HookChart depth stream must remain');
  assert.ok(assets.includes("app.get('*'"), 'unmatched API routes must fall through to 404');
  assert.ok(market.includes('export function fetchKlines('), 'shared candle-fetching must remain');
  assert.ok(market.includes('export function isReusableScreenerScanSnapshot('), 'scan caching must remain');
});
