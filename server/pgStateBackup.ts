/** A private, immutable local safety copy before PostgreSQL staging.
 * JSON stays authoritative; this copy does not replace a full Docker volume
 * backup or a PostgreSQL pg_dump. Capture while the app is quiesced. */
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { PersonalStateSnapshot } from './pgPersonalState';
import { personalStateSnapshotDigest } from './pgPersonalState';

export const PERSONAL_STATE_BACKUP_FORMAT = 'h00k-personal-state-backup-v1';

export function createPersonalStateBackup(snapshot: PersonalStateSnapshot,
  directory = resolve(process.cwd(), 'server', 'data', 'personal-state-backups')) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Existing backup directories must be private before creating new files.
  fs.chmodSync(directory, 0o700);
  const sha256 = personalStateSnapshotDigest(snapshot);
  const name = `personal-state-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
  const file = resolve(directory, name);
  const contents = JSON.stringify({ format: PERSONAL_STATE_BACKUP_FORMAT, sha256,
    createdAt: new Date().toISOString(), snapshot });
  // Exclusive creation prevents following a preplanted symlink or truncating
  // an earlier backup. Permissions are 0600 from the first written byte.
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, contents, 'utf8');
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    fs.rmSync(file, { force: true });
    throw error;
  }
  fs.closeSync(fd);
  if (verifyPersonalStateBackup(file).sha256 !== sha256)
    throw new Error('Backup verification failed');
  return { file, sha256 };
}

/** Validate integrity before using a private backup for an operator-led restore.
 * Never automatically replace live JSON or re-send old notifications. */
export function verifyPersonalStateBackup(file: string): {
  sha256: string; snapshot: PersonalStateSnapshot;
} {
  const document: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!document || typeof document !== 'object') throw new Error('Invalid personal state backup');
  const value = document as Record<string, unknown>;
  if (value.format !== PERSONAL_STATE_BACKUP_FORMAT || typeof value.sha256 !== 'string' ||
      !value.snapshot || typeof value.snapshot !== 'object')
    throw new Error('Invalid personal state backup format');
  const snapshot = value.snapshot as PersonalStateSnapshot;
  if (!snapshot.surveillance || !Array.isArray(snapshot.alerts) || !Array.isArray(snapshot.history))
    throw new Error('Invalid personal state backup snapshot');
  const actual = personalStateSnapshotDigest(snapshot);
  if (actual !== value.sha256) throw new Error('Personal state backup checksum mismatch');
  return { sha256: actual, snapshot };
}
