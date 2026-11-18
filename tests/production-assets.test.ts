import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { installProductionAssets } from '../server/productionAssets';
import { legalPages, renderLegalHtml } from '../seo/legalAssets';

test('production serves real bundles, returns 404 for missing assets, and preserves SPA routes', async t => {
  const directory = await mkdtemp(path.join(process.cwd(), 'tests', 'assets-fixture-'));
  await mkdir(path.join(directory, 'assets'));
  const shell = '<!doctype html><title>H00K fixture</title><div id="root"></div>';
  await writeFile(path.join(directory, 'index.html'), shell);
  for (const page of legalPages) await writeFile(path.join(directory, `${page}.html`), renderLegalHtml(shell, page));
  await writeFile(path.join(directory, 'assets', 'index-current.js'), 'export const version = 1;');
  await writeFile(path.join(directory, 'assets', 'index-current.css'), 'body { color: white; }');
  const app = express();
  installProductionAssets(app, directory);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const extension of ['js', 'css']) {
    const present = await fetch(`${base}/assets/index-current.${extension}`);
    assert.equal(present.status, 200);
    assert.match(present.headers.get('content-type')!, extension === 'js' ? /javascript/ : /text\/css/);
    assert.match(present.headers.get('cache-control')!, /immutable/);
    const missing = await fetch(`${base}/assets/index-old.${extension}`);
    assert.equal(missing.status, 404);
    assert.doesNotMatch(await missing.text(), /<!doctype|H00K fixture/i);
  }
  for (const route of ['/', '/terms', '/privacy', '/replay']) {
    const page = await fetch(base + route);
    assert.equal(page.status, 200, route);
    const html = await page.text();
    // Public legal routes intentionally replace the SPA title for SEO.
    // Other SPA routes must keep the original application shell.
    if (route === '/terms') {
      assert.match(html, /Користувацька угода — h00k\.top/);
    } else if (route === '/privacy') {
      assert.match(html, /Політика обробки персональних даних — h00k\.top/);
    } else {
      assert.match(html, /H00K fixture/);
    }
    assert.equal(page.headers.get('cache-control'), 'no-cache');
  }
});
