# Code quality checks (incremental rollout)

This repository distinguishes three checks:

- `npm run typecheck`: the existing whole-project TypeScript check (`tsc --noEmit`). It must stay green as strictness increases.
- `npm run typecheck:strict`: **real `strict: true` compilation** of a small, explicitly listed collection of self-contained modules in `tsconfig.strict.json`. New modules are added only after their strict errors are fixed.
- `npm run lint`: ESLint 9 with the TypeScript parser and React Hooks plugin across the main source and test TypeScript files. Correctness errors fail CI; the React Hooks call-order rule blocks CI; existing exhaustive-deps findings remain visible as warnings while they are reviewed.

`noFallthroughCasesInSwitch` and `forceConsistentCasingInFileNames` are also enabled in the general TypeScript configuration.

We deliberately **do not** enable `strict: true` for the entire older codebase yet. Doing so blindly may block releases for unrelated pre-existing typing issues. Expand `tsconfig.strict.json` module by module after resolving actual errors, without adding `@ts-ignore` just to silence them. React Hooks call-order violations are errors. Review remaining exhaustive-deps warnings before promoting them to errors; do not mechanically add unstable dependencies.

All checks run in GitHub Actions before merge, use only pinned **devDependencies**, and add no server polling, WebSocket subscriptions, chart rendering, or VPS runtime load. Docker retains its existing production dependency pruning.

To verify locally:

```bash
npm ci
npm run typecheck
npm run typecheck:strict
npm run lint
npm run build
npm test
```
