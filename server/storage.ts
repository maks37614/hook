import fs from 'node:fs';
import { getMonitoringDataDirectory, writeMonitoringJson } from './monitoringStorage';

// One server process owns this store. Mount this directory on persistent storage.
export const DATA_DIR = getMonitoringDataDirectory();

export function writeJson(file: string, value: unknown) {
  writeMonitoringJson(file, value);
}

export function readJson<T>(file: string, fallback: T): T {
  // Fail closed on corrupt data; never silently replace persisted accounts or jobs.
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

export function initializeDataDirectory() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  // Import into a new volume explicitly before startup. Old environment snapshots
  // must never recreate data after an administrator intentionally removes a file.
}
