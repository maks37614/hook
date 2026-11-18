/** Durable private JSON checkpoints for alerts, Telegram and surveillance.
 * Never open a predictable reused temp: an old temp may be world-readable
 * or be an attacker-controlled symlink. All callers publish state only after
 * this synchronous operation succeeds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/** Atomic replacement with exclusive 0600 creation, fsync before rename,
 * cleanup on failure, and a best-effort directory sync after publication.
 * Never throw for a post-rename directory-sync failure: the file is already
 * published and treating it as an unsuccessful edit would corrupt caches. */
export function writePrivateJsonAtomic(destination: string, payload: string): void {
  const directory = path.dirname(destination);
  fs.mkdirSync(directory, { recursive: true });

  // Older releases used this predictable name. Unlink it without opening it
  // or following a symlink. No private data are written until that succeeds.
  try { fs.unlinkSync(`${destination}.tmp`); }
  catch (error) { if (!isMissing(error)) throw error; }

  const temporary = `${destination}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  let published = false;
  try {
    // O_EXCL prevents reuse and O_NOFOLLOW explicitly rejects symlinks.
    fd = fs.openSync(temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, payload, { encoding: 'utf8' });
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, destination);
    published = true;
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* Preserve original error. */ }
    }
    if (!published) {
      try { fs.unlinkSync(temporary); }
      catch (cleanupError) {
        if (!isMissing(cleanupError)) console.error('[Private JSON] Temp cleanup failed:', cleanupError);
      }
    }
    throw error;
  }
  // On Linux a successful file fsync + rename is followed by an fsync of its
  // parent directory to persist the directory entry. If the filesystem does
  // not support that operation, report it; do not roll back a published file.
  let dirFd: number | undefined;
  try {
    dirFd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    fs.fsyncSync(dirFd);
  } catch (error) {
    console.error('[Private JSON] Directory sync after rename failed:', error);
  } finally {
    if (dirFd !== undefined) {
      try { fs.closeSync(dirFd); }
      catch (error) { console.error('[Private JSON] Directory descriptor close failed:', error); }
    }
  }
}
