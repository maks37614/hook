import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireUserAuth } from '../server/userAuth';
import { requirePostgresSession } from '../server/pgIdentityRoutes';

test('all protected API routes use PostgreSQL sessions with no legacy token fallback', () => {
  assert.equal(requireUserAuth, requirePostgresSession);
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(server, /void initializeIdentity\(\)/);
  assert.match(server, /installPostgresIdentityRoutes\(app\)/);
  assert.doesNotMatch(server, /await initializeIdentity\(\)/);
  assert.match(server, /app\.use\(\['\/api\/alerts', '\/api\/telegram', '\/api\/surveillance', '\/api\/cron'\], requireUserAuth\)/);
  assert.doesNotMatch(server, /verify-code|ACCESS_CODES/);
  const routes = readFileSync(new URL('../server/pgIdentityRoutes.ts', import.meta.url), 'utf8');
  assert.match(routes, /!cookieToken\(req\)/, 'guest session checks must bypass the database');
  assert.match(routes, /void initializeIdentity\(\)\.then/, 'account routes initialize lazily');
});
