import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('profile selection and formation panel layouts resize renderers and preserve per-account settings', async () => {
  const fixture = fileURLToPath(new URL('./fixtures/hookchart-dom.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', fixture], { timeout: 45_000, maxBuffer: 1_000_000 });
  assert.ok(stdout.includes('PASS:'), stdout);
});
