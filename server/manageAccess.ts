// Run inside the application container. The bootstrap key never leaves the VPS.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './storage';

const [command, userId] = process.argv.slice(2);
if (!['grant-admin', 'remove-admin'].includes(command) || !userId) {
  console.error('Usage: node --import tsx server/manageAccess.ts grant-admin|remove-admin USER_ID');
  process.exit(1);
}
const key = fs.readFileSync(path.join(DATA_DIR, 'access-admin.key'), 'utf8').trim();
const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/internal/access-admin`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hook2-Admin': key },
  body: JSON.stringify({ userId, enabled: command === 'grant-admin' }), signal: AbortSignal.timeout(10000),
});
if (!response.ok) { console.error(await response.text()); process.exit(1); }
console.log(command === 'grant-admin' ? 'Administrator enabled. Refresh the website.' : 'Administrator removed.');
