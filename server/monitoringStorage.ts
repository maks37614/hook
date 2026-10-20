import fs from 'node:fs';
import path from 'node:path';

/** All monitoring stores, including deletion tombstones, must share the mounted volume. */
export function getMonitoringDataDirectory(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return path.resolve(cwd, env.DATA_DIR?.trim() || env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || 'server/data');
}

export function writeMonitoringJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}

const initialized = new Set<string>();

/** Existing volume data is authoritative. Never automatically restore old repository/env snapshots. */
export function ensureMonitoringDataDirectory(directory: string): void {
  if (initialized.has(directory)) return;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  initialized.add(directory);
  console.info(`[Monitoring] Data directory: ${directory}`);
}
