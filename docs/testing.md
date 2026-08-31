# Testing

How the automated test suites work, the standards tests must follow, and the gotchas learned so far.

## Tiers & commands

| Tier | Where | Runner | Command |
| --- | --- | --- | --- |
| Unit | `packages/tv-ui/test/unit/` | Vitest + RTL (jsdom) | `yarn --cwd packages/tv-ui test` |
| Integration | `packages/tv-ui/test/integration/` | Vitest + RTL against a real in-memory mock Stash API | same command as unit |
| Mock server meta/conformance | `packages/mock-stash/test/` | Vitest (node env; conformance uses Docker, auto-skips without it) | `yarn --cwd packages/mock-stash test` / `test:conformance` |
| Docs validation | `packages/repo/test/` | Vitest | `yarn --cwd packages/repo test` |
| Plugin | `packages/tv-plugin/test/unit/` | Vitest (node env) | `yarn --cwd packages/tv-plugin test` |
| E2E | `packages/tv-ui/test/e2e/` | Playwright + Chromium | `yarn test:e2e` |

`yarn test` at the repo root runs repo + mock-stash + tv-ui + tv-plugin.

From `packages/tv-ui` (or with `yarn --cwd packages/tv-ui`):

```bash
yarn test                                      # all tv-ui tests (unit + integration)
yarn test test/unit/                           # unit only
yarn test test/integration/                    # integration only
yarn test test/unit/store/globalState.test.ts  # one file
yarn test --watch                              # watch mode
yarn test --coverage                           # coverage report
yarn test:e2e                                  # E2E tests (requires mock-stash + dev server running)
```

### Running E2E tests

E2E tests require both mock-stash and dev server to be running:

```bash
# Terminal 1: Start mock-stash (port 4000)
yarn --cwd packages/mock-stash test:e2e-server

# Terminal 2: Start dev server with STASH_PROXY (port 8888)
STASH_ADDRESS=http://localhost:4000 STASH_PROXY=true yarn --cwd packages/tv-ui dev

# Terminal 3: Run E2E tests
yarn --cwd packages/tv-ui test:e2e
```

## Standards (binding for all tests)

- **Test behavior, not implementation.** Every test must state an observable behavior: a guard firing, persistence landing in the right backend, a computed output, a conditional render, a callback receiving the right arguments. Heuristic: if you can describe the test as "when X happens, Y is the observable result", keep it; if you can only describe it as "the code contains X", delete it. Explicitly excluded: default-value restatements, `set(x); expect(get(x))` round-trips, `typeof` assertions, class-name-existence checks.
- **Query priority (RTL):** accessible queries (`getByRole`, `getByText`, `getByLabelText`) → `data-testid` (add to app code when needed — sanctioned) → class selectors only when the class *is* the contract (styling components like `Tag`/`ClipTimestamp`).
- **Interactions:** prefer `userEvent` over `fireEvent` for realistic user interactions. `fireEvent` is acceptable for events users don't literally fire or jsdom workarounds — comment why.
- **TypeScript:** tests are typechecked and must be clean. No `as Foo` casts, `any`, or `@ts-expect-error` — narrow unions properly. If narrowing is needed repeatedly, put one cast inside a shared helper rather than scattering casts.
- **Shared helpers, no duplication:** store reset/gating lives in `tv-ui/test/unit/helpers/stores.ts` (`resetStores()`, `setTvConfigLoaded()`); RTL cleanup is centralized in `tv-ui/test/setup.ts`. Never add per-file `cleanupRtl()` boilerplate.
- **File placement:** unit tests in `test/unit/<area>/`, integration in `test/integration/`. Tests never live in `src/`. Import app code with the `src/` prefix.
- **One behavior per test**, named after the behavior ("blocks sets and warns before tvConfigLoaded"), not the API.
- **Doc citations:** tests verifying documented behavior cite it with `@see docs/<file>.md § "<heading>"`. If behavior is worth testing but not documented, document it.

## Why teardown is clean (parallel execution history)

The suite runs fully parallel with zero unhandled errors. Getting there required three independent fixes; if regressions appear, check these first:

1. **Unhandled rejections in app code** — `updateTvConfig` in `tv-ui/src/helpers/stash-config-storage.ts` runs without a caller awaiting it, so any API failure must be caught there or it surfaces as an unhandled rejection.
2. **Unit tests making real Apollo requests** — the tvConfig store hydrates through `stashConfigStorage`, which builds a real Apollo client. Even caught failures can leak unhandled rejections through Apollo's internal promises, so unit tests mock the client entirely (see "Test-only exceptions").
3. **`graphql-ws` disposal** — see the disposal gotcha above.

Full history of the investigation (including attempts that failed) lives in `docs/historical-plans/2026-08-30-websocket-cleanup-problem-handoff.md`.

## Templates

Unit:

```typescript
import { describe, expect, it, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";

describe("feature being tested", () => {
  beforeEach(() => {
    // Setup: reset state, clear localStorage, etc.
  });

  it("does something specific", () => {
    // Arrange: set up test data
    // Act: call the function
    // Assert: verify the result
    expect(result).toBe(expected);
  });
});
```

Integration — note React 17's `act` doesn't propagate callback return values, so use definite assignment for `rendered`:

```typescript
import { describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("integration feature", () => {
  it("behaves correctly with mock API", async () => {
    const { default: App } = await loadFreshAppModules();
    const { getApolloClient } = await import("../../src/hooks/getApolloClient");

    let rendered!: ReturnType<typeof render>;
    const apolloClient = getApolloClient();
    await act(async () => {
      rendered = render(
        <ApolloProvider client={apolloClient}>
          <App />
        </ApolloProvider>
      );
    });

    await waitFor(() => {
      expect(rendered.container.textContent).toContain("expected text");
    });

    // Cleanup: unmount only — Apollo clients are deliberately not stopped (see
    // the harness NOTE and the graphql-ws disposal gotcha above).
    await act(async () => {
      rendered.unmount();
    });
  });
});
```

## Gotchas

⚠️ **Nothing typechecks tests automatically.** There is no pre-commit hook in this repo (no husky/lint-staged; commitlint covers commit messages in CI only), and **vitest does not typecheck** — esbuild strips types. Type errors have landed in `main` test files this way. Run `npx tsc --noEmit -p tsconfig.json` **from the repo root** as part of any test change.

⚠️ **`tsc` run inside a package directory checks only that package.** `packages/repo` and `packages/mock-stash` have their own `tsconfig.json`; running bare `tsc` there silently skips tv-ui and vice versa (the root tsconfig is the only one covering `tv-ui`).

⚠️ **jest-dom matcher typing can disagree between CLI and editor.** jest-dom v5 (pinned for React 17) ships only Jest-style types via `@types/testing-library__jest-dom`, which augments the global `jest.Matchers` namespace. Vitest's `Assertion` extends `jest.Matchers`, so the CLI resolves matchers via auto-included `@types` — but the editor's TS server doesn't reliably apply that augmentation, producing phantom "Property 'toHaveStyle' does not exist" errors that `tsc --noEmit` doesn't report. The explicit bridge in `tv-ui/types/jest-dom-matchers.d.ts` declares the matchers directly on vitest's `Assertion` so both agree. If you add more matcher libraries, extend that bridge.

⚠️ **Version pins for React 17:** `@testing-library/react` 12.x, `@testing-library/dom` 8.x, `@testing-library/jest-dom` 5.x, `@testing-library/user-event` 14.x. Do not bump these without solving React 18 first.

⚠️ **Unit tests must never make real network requests.** Without `VITE_APP_PLATFORM_URL` set, Apollo links default to `http://localhost:9999` — Stash's default port, likely a live server (or SSH tunnel) on a dev machine; real responses (e.g. 404s) surface as unhandled rejections. Unit tests are kept network-free by the project-scoped Apollo client mock (see "Test-only exceptions"); integration tests use `mock-stash`'s ephemeral port. If you add a unit test that needs Apollo, extend the mock — don't let it hit the default port.

⚠️ **`graphql-ws` clients need disposal before jsdom teardown.** The Apollo client singleton uses `retryAttempts: Infinity`; integration tests create many clients via `vi.resetModules()` re-imports. `tv-ui/test/setup.ts` wraps `graphql-ws`'s `createClient` to track and dispose all clients in `afterAll`. If you see unhandled `ECONNREFUSED`/reconnect errors in teardown, this wrapper is the place to look.

⚠️ **Node 26 shadowing jsdom localStorage:** tests must run with `--no-experimental-webstorage` (already in the package `test` scripts — keep it there).

⚠️ **Known jsdom limitations:** no pointer capture (Radix drag tests are skipped with reasons inline), no Gamepad API (stubbed in `setup.ts`), `HTMLMediaElement.play` stubbed. Document skipped tests inline.

## Test-only exceptions to app-code rules

- `useStore.setState` — forbidden in app code (bypasses typed setters and persistence routing), permitted **only** inside the shared test helpers in `test/unit/helpers/stores.ts` for resetting to a known state. Never scatter raw `setState` through individual tests.
- Apollo client mocks prevent real connection attempts in unit tests; integration tests use the real client against `mock-stash` instead. The unit/integration split is a Vitest "projects" config (`tv-ui/vitest.config.ts`): the mock lives in `tv-ui/test/setup-unit-apollo.ts` and is only in the unit project's `setupFiles` — putting it in the shared `test/setup.ts` breaks integration tests.

## History

The test suite was introduced via the plan in `docs/historical-plans/2026-08-30-testing-implementation-plan.md` (mock-stash package, conformance-vs-real-Stash, tiered strategy). That plan is frozen; this doc is the living reference.
