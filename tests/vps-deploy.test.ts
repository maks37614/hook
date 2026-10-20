import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('VPS deployment gates CI, serializes releases, preserves data and rolls back failures', async () => {
  const fixture = fileURLToPath(new URL('./fixtures/vps-deploy-tests.py', import.meta.url));
  const result = await promisify(execFile)('python3', [fixture], { timeout: 30_000, maxBuffer: 1_000_000 });
  assert.match(result.stderr, /Ran 10 tests/);
  assert.match(result.stderr, /OK/);
});
