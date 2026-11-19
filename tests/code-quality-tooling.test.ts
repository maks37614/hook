import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('ESLint is a separate real lint command, while whole-app and strict typechecks stay explicit', () => {
  const pkg = JSON.parse(source('../package.json'));
  assert.equal(pkg.scripts.lint, 'eslint .');
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts['typecheck:strict'], 'tsc --project tsconfig.strict.json');
  for (const dependency of ['eslint', 'typescript-eslint', 'eslint-plugin-react-hooks']) {
    assert.equal(typeof pkg.devDependencies[dependency], 'string');
    assert.equal(pkg.dependencies?.[dependency], undefined, 'no production lint dependencies');
  }
  const lock = JSON.parse(source('../package-lock.json'));
  assert.equal(lock.packages[''].devDependencies.eslint, pkg.devDependencies.eslint);
  assert.equal(lock.packages[''].devDependencies['typescript-eslint'], pkg.devDependencies['typescript-eslint']);
});

test('incremental strict mode checks runtime-critical independent modules and cannot be silently disabled', () => {
  const tsconfig = JSON.parse(source('../tsconfig.json'));
  const strict = JSON.parse(source('../tsconfig.strict.json'));
  assert.equal(tsconfig.compilerOptions.noFallthroughCasesInSwitch, true);
  assert.equal(tsconfig.compilerOptions.forceConsistentCasingInFileNames, true);
  assert.equal(strict.extends, './tsconfig.json');
  assert.equal(strict.compilerOptions.strict, true);
  assert.ok(strict.files.includes('server/smartAnalysisGate.ts'));
  assert.ok(strict.files.includes('server/boundedAnalysisCache.ts'));
  assert.ok(strict.files.includes('server/surveillanceLimits.ts'));
  assert.ok(strict.files.includes('src/components/hookchart/crosshairState.ts'));
});

test('CI enforces ESLint and both TypeScript checks without deploying lint dependencies', () => {
  const workflow = source('../.github/workflows/verify.yml');
  assert.match(workflow, /name: Type check\s+run: npm run typecheck/);
  assert.match(workflow, /name: Strict TypeScript core-module check\s+run: npm run typecheck:strict/);
  assert.match(workflow, /name: ESLint static analysis\s+run: npm run lint/);
  const config = source('../eslint.config.mjs');
  assert.match(config, /from 'typescript-eslint'/);
  assert.match(config, /from 'eslint-plugin-react-hooks'/);
  assert.match(config, /no-unreachable': 'error'/);
  assert.match(config, /react-hooks\/rules-of-hooks': 'error'/);
  assert.doesNotMatch(config, /projectService:\s*true/);
});
