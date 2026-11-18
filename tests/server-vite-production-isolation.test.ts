import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static invariant: no Vite module may execute at top-level when the VPS
// starts NODE_ENV=production. The actual development server remains available.
const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('production server does not statically load Vite development tooling', () => {
  assert.doesNotMatch(source, /(?:^|\n)\s*import\s+[^\n]+\sfrom\s+['"]vite['"]/);
  assert.doesNotMatch(source, /(?:^|\n)\s*import\s+['"]vite['"]/);
  const start = source.indexOf("if (process.env.NODE_ENV !== 'production') {");
  const otherwise = source.indexOf('} else {', start);
  assert.ok(start > 0 && otherwise > start, 'development/production guard must remain intact');
  const devBlock = source.slice(start, otherwise);
  assert.match(devBlock, /await import\('vite'\)/, 'load Vite only when development middleware is requested');
  assert.match(devBlock, /await createViteServer\(/);
  const prodBlock = source.slice(otherwise, source.indexOf('\n\n  const httpServer', otherwise));
  assert.match(prodBlock, /installProductionAssets\(app, distPath\)/);
  assert.doesNotMatch(prodBlock, /createViteServer|import\('vite'\)/);
});
