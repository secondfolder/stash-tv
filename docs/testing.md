# Testing

How the automated test suites work, the standards tests must follow, and the gotchas learned so far.

## Tiers & commands

| Tier | Where | Runner | Command |
| --- | --- | --- | --- |
| Unit | `packages/tv-ui/test/unit/` | Vitest + RTL (jsdom) | `yarn --cwd packages/tv-ui test` |
| Integration | `packages/tv-ui/test/integration/` | Vitest + RTL against a real in-memory mock Stash API | same command as unit |
| Mock server meta/conformance | `packages/mock-stash/test/` | Vitest (node env; conformance uses Docker, auto-skips without it) | `yarn --cwd packages/mock-stash test` / `test:conformance` |
| Docs validation | `packages/repo/test/` | Vitest | `yarn --cwd packages/repo test` |
| E2E | `packages/tv-ui/test/e2e/` (planned) | Playwright | `yarn test:e2e` (planned) |

`yarn test` at the repo root runs repo + mock-stash + tv-ui.

## Standards (binding for all tests)

- **Test behavior, not implementation.** Every test must state an observable behavior: a guard firing, persistence landing in the right backend, a computed output, a conditional render, a callback receiving the right arguments. Heuristic: if you can describe the test as "when X happens, Y is the observable result", keep it; if you can only describe it as "the code contains X", delete it. Explicitly excluded: default-value restatements, `set(x); expect(get(x))` round-trips, `typeof` assertions, class-name-existence checks.
- **Query priority (RTL):** accessible queries (`getByRole`, `getByText`, `getByLabelText`) → `data-testid` (add to app code when needed — sanctioned) → class selectors only when the class *is* the contract (styling components like `Tag`/`ClipTimestamp`).
- **Interactions:** prefer `userEvent` over `fireEvent` for realistic user interactions. `fireEvent` is acceptable for events users don't literally fire or jsdom workarounds — comment why.
- **TypeScript:** tests are typechecked and must be clean. No `as Foo` casts, `any`, or `@ts-expect-error` — narrow unions properly. If narrowing is needed repeatedly, put one cast inside a shared helper rather than scattering casts.
- **Shared helpers, no duplication:** store reset/gating lives in `tv-ui/test/unit/helpers/stores.ts` (`resetStores()`, `setTvConfigLoaded()`); RTL cleanup is centralized in `tv-ui/test/setup.ts`. Never add per-file `cleanupRtl()` boilerplate.
- **File placement:** unit tests in `test/unit/<area>/`, integration in `test/integration/`. Tests never live in `src/`. Import app code with the `src/` prefix.
- **One behavior per test**, named after the behavior ("blocks sets and warns before tvConfigLoaded"), not the API.
- **Doc citations:** tests verifying documented behavior cite it with `@see docs/<file>.md § "<heading>"`. If behavior is worth testing but not documented, document it.

## Gotchas

⚠️ **Nothing typechecks tests automatically.** There is no pre-commit hook in this repo (no husky/lint-staged; commitlint covers commit messages in CI only), and **vitest does not typecheck** — esbuild strips types. Type errors have landed in `main` test files this way. Run `npx tsc --noEmit -p tsconfig.json` **from the repo root** as part of any test change.

⚠️ **`tsc` run inside a package directory checks only that package.** `packages/repo` and `packages/mock-stash` have their own `tsconfig.json`; running bare `tsc` there silently skips tv-ui and vice versa (the root tsconfig is the only one covering `tv-ui`).

⚠️ **jest-dom matcher typing can disagree between CLI and editor.** jest-dom v5 (pinned for React 17) ships only Jest-style types via `@types/testing-library__jest-dom`, which augments the global `jest.Matchers` namespace. Vitest's `Assertion` extends `jest.Matchers`, so the CLI resolves matchers via auto-included `@types` — but the editor's TS server doesn't reliably apply that augmentation, producing phantom "Property 'toHaveStyle' does not exist" errors that `tsc --noEmit` doesn't report. The explicit bridge in `tv-ui/types/jest-dom-matchers.d.ts` declares the matchers directly on vitest's `Assertion` so both agree. If you add more matcher libraries, extend that bridge.

⚠️ **Version pins for React 17:** `@testing-library/react` 12.x, `@testing-library/dom` 8.x, `@testing-library/jest-dom` 5.x, `@testing-library/user-event` 14.x. Do not bump these without solving React 18 first.

⚠️ **Node 26 shadowing jsdom localStorage:** tests must run with `--no-experimental-webstorage` (already in the package `test` scripts — keep it there).

⚠️ **Known jsdom limitations:** no pointer capture (Radix drag tests are skipped with reasons inline), no Gamepad API (stubbed in `setup.ts`), `HTMLMediaElement.play` stubbed. Document skipped tests inline.

## Test-only exceptions to app-code rules

- `useStore.setState` — forbidden in app code (bypasses typed setters and persistence routing), permitted **only** inside the shared test helpers in `test/unit/helpers/stores.ts` for resetting to a known state. Never scatter raw `setState` through individual tests.
- Apollo client mocks (`vi.mock` of `src/hooks/getApolloClient`) prevent real connection attempts in unit tests; integration tests use the real client against `mock-stash` instead.

## History

The test suite was introduced via the plan in `docs/historical-plans/2026-08-30-testing-implementation-plan.md` (mock-stash package, conformance-vs-real-Stash, tiered strategy). That plan is frozen; this doc is the living reference.
