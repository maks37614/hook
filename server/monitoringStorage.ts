import fs from 'node:fs';
import path from 'node:path';

const savedWrites = new Map<string, { json: string; stamp: string }>();
const fileStamp = (file: string) => {
  const stat = fs.statSync(file);
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
};

function rememberWrite(file: string, json: string, stamp: string) {
  savedWrites.delete(file);
  savedWrites.set(file, { json, stamp });
  if (savedWrites.size > 64) savedWrites.delete(savedWrites.keys().next().value!);
}

/** All monitoring stores, including deletion tombstones, must share the mounted volume. */
export function getMonitoringDataDirectory(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return path.resolve(cwd, env.DATA_DIR?.trim() || env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || 'server/data');
}

export function writeMonitoringJson(file: string, value: unknown): void {
  const json = JSON.stringify(value, null, 2);
  const absolute = path.resolve(file);
  if (fs.existsSync(file)) {
    const stamp = fileStamp(file);
    const saved = savedWrites.get(absolute);
    if (saved?.json === json && saved.stamp === stamp) return;
    // Check the real file after restart or an external replacement/deletion.
    if (fs.readFileSync(file, 'utf8') === json) {
      rememberWrite(absolute, json, stamp);
      return;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, json); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  rememberWrite(absolute, json, fileStamp(file));
}

const initialized = new Set<string>();

/** Existing volume data is authoritative. Never automatically restore old repository/env snapshots. */
export function ensureMonitoringDataDirectory(directory: string): void {
  if (initialized.has(directory)) return;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  initialized.add(directory);
  console.info(`[Monitoring] Data directory: ${directory}`);
}
