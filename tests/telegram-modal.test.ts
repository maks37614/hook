import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('Telegram UI connects without exposing secrets and switches account authorization', async () => {
  const fixture = fileURLToPath(new URL('./fixtures/telegram-modal.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', fixture], { timeout: 20000, maxBuffer: 1000000 });
  assert.match(stdout, /PASS:/);
});
