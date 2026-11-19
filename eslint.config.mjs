import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Fast, typed-syntax ESLint baseline for the whole TypeScript codebase.
 * No TypeScript project service or runtime import: lint runs in development/CI,
 * never in the production server or browser.
 *
 * Existing legacy hook/dependency findings are advisory until triaged.
 * Definite correctness bugs are CI-blocking everywhere.
 */
export default [
  {
    ignores: [
      'node_modules/**', 'dist/**', 'coverage/**', 'desktop/**',
      'public/**', 'extracted_chart/**', 'server/data/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
