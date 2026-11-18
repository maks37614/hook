import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = new URL('../', import.meta.url);
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?|cjs|mjs)$/.test(entry.name) ? [full] : [];
  });
}

test('authentication only uses PostgreSQL and no Firebase files or imports survive', () => {
  for (const file of ['src/firebase.ts', 'firebase-applet-config.json', 'firebase-blueprint.json', 'firestore.rules', 'src/lib/firestoreErrors.ts', 'src/lib/firestoreUtils.ts', 'scripts/import-firebase-users.ts', 'src/utils/accessCodes.ts']) {
    assert.equal(existsSync(new URL('../' + file, import.meta.url)), false, 'Obsolete file: ' + file);
  }
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies.firebase, undefined);
  assert.equal(lock.packages[''].dependencies.firebase, undefined);
  assert.equal(Object.keys(lock.packages).some(name => name === 'node_modules/firebase' || name.startsWith('node_modules/@firebase/')), false);
  const staleReferences: string[] = [];
  for (const folder of ['src', 'server', 'scripts', 'desktop']) {
    for (const filename of sourceFiles(path.join(new URL(root).pathname, folder))) {
      const source = readFileSync(filename, 'utf8');
      assert.doesNotMatch(source, /(?:from\s*['"][^'"]*firebase|import\s*\(['"][^'"]*firebase|require\(['"][^'"]*firebase)/i, 'Unexpected import in ' + filename);
      if (/firebase|firestore/i.test(source)) staleReferences.push(filename);
    }
  }
  assert.deepEqual(staleReferences, [], 'All obsolete Firebase mentions must be removed from application code');
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.doesNotMatch(dockerfile, /firebase|firestore/i);

  // Generated dist once contained the old Firebase SDK even after source migration.
  // Check tracked files, not only the working-tree dist, because npm run build regenerates it.
  if (existsSync(new URL('../.git', import.meta.url))) {
    const trackedDist = execFileSync('git', ['ls-files', '--cached', '--', 'dist/'], {
      cwd: new URL(root).pathname, encoding: 'utf8',
    }).trim();
    assert.equal(trackedDist, '', 'dist is generated output and must not be tracked by Git');
  }
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^dist\/$/m);
  assert.match(ignore, /^\.env$/m);
});

test('production JS build does not contain the removed Firebase SDK or Firestore runtime', () => {
  const output = new URL('../dist/assets', import.meta.url).pathname;
  if (!existsSync(output)) return; // npm test can run before npm run build.
  for (const filename of readdirSync(output).filter(file => file.endsWith('.js'))) {
    const content = readFileSync(path.join(output, filename), 'utf8');
    assert.doesNotMatch(content,
      /@firebase\/|__FIREBASE_DEFAULTS__|firestore\.googleapis\.com|firebaseapp\.com|firebase-auth/i,
      'Firebase code must not ship in dist/assets/' + filename);
  }
});
