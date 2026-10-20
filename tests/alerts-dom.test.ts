import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('Telegram alert synchronization never imports ownerless cache or restores deleted alerts', async () => {
  const loader = fileURLToPath(new URL('./fixtures/alerts-sync-loader.mjs', import.meta.url));
  const fixture = fileURLToPath(new URL('./fixtures/alerts-sync-dom.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ['--import', loader, '--import', 'tsx', fixture], {
    timeout: 30_000, maxBuffer: 1_000_000,
  });
  assert.match(stdout, /PASS:/);
});
