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
yarn test:e2e                                  # E2E tests (servers are managed for you)
```

### Running E2E tests

Playwright starts (and tears down) both servers itself via `webServer` entries
in `packages/tv-ui/playwright.config.ts`, so `yarn test:e2e` at the root is
just an alias for `yarn --cwd packages/tv-ui test:e2e`:

- mock-stash on port 4000 (`yarn --cwd packages/mock-stash test:e2e-server` —
  a Vitest "test" that boots the TS server on `MOCK_STASH_PORT` and holds the
  process open)
- the tv-ui dev server on port 8888 (`--strictPort`), with `STASH_PROXY=true`
  pointing at mock-stash, and `VITE_APP_PLATFORM_URL` set to the dev server's
  own URL so the app's API/WebSocket URLs stay same-origin. ⚠️ Without that
  var, stash-ui's `getPlatformURL` forces port **9999** (Stash's default) in
  dev mode, so the app talks past the proxy to whatever runs on 9999 and the
  feed dies with `Error: Failed to fetch`.

If either port is taken, the config prints a one-line note and uses the next
free port (`test/e2e/helpers/ports.ts`). Servers are never reused: a stale or
real-Stash-backed server on the default port can't leak into a run. The chosen
ports are cached in `E2E_MOCK_STASH_PORT` / `E2E_DEV_SERVER_PORT` because
Playwright re-evaluates its config in every worker. Run standalone,
`test:e2e-server` does the same fallback itself.

⚠️ Don't background the servers from a shell script (`server & sleep && …`).
Nothing kills them when the script exits, and killing the `vitest` parent
leaves its worker (the one holding the port) running. Playwright avoids this by
killing the whole process group. ⚠️ The dev server's proxy settings come from
`packages/tv-ui/.env` *and* the command's env vars (command wins).

### Integration harness

Integration tests boot the full app through `bootApp()` from
`test/integration/helpers/harness.tsx`: it renders `<App />` against the mock
server, waits for a ready text (default `"Aurora Ascending"`, the first-page
fixture — pass your own when booting a different filter), and returns
`{ rendered, apolloClient, unmount }`. `afterEach` resets localStorage *and*
the mock server's plugin/ui config so tests can't rehydrate each other's
writes.

Feed-level helpers live in `test/integration/helpers/feed.ts`:
- `slides` / `currentSlide` / `sceneIdOf` / `goToNextSlide` / `goToSlide`: find and move between rendered slides
- `bootWithTvConfig(configure, readyText?)`: boot, change persisted tvConfig, then boot fresh (e.g. a different filter or page size)
- `pinActionButtons([...])` and `displayedSideInfo(app, buttonType)`: most action buttons sit in a closed folder by default, so pin the ones whose displayed state you assert on. Pass a button type, or a button's options for buttons that need them (e.g. `{ buttonType: "create-marker", iconId: "bookmark", markerDefaults: … }`)

Tests that change the mock server's scenes or markers (rating, o-count, deleting) must restore them in `afterEach`: the server store outlives each test.

## Standards (binding for all tests)

- **Test behavior, not implementation.** Every test must state an observable behavior: a guard firing, persistence landing in the right backend, a computed output, a conditional render, a callback receiving the right arguments. Heuristic: if you can describe the test as "when X happens, Y is the observable result", keep it; if you can only describe it as "the code contains X", delete it. Explicitly excluded: default-value restatements, `set(x); expect(get(x))` round-trips, `typeof` assertions, class-name-existence checks.
- **Query priority (RTL):** accessible queries (`getByRole`, `getByText`, `getByLabelText`) → `data-testid` (add to app code when needed — sanctioned) → class selectors only when the class *is* the contract (styling components like `Tag`/`ClipTimestamp`).
- **Interactions:** prefer `userEvent` over `fireEvent` for realistic user interactions. `fireEvent` is acceptable for events users don't literally fire or jsdom workarounds — comment why.
- **TypeScript:** tests are typechecked and must be clean. No `as Foo` casts, `any`, or `@ts-expect-error` — narrow unions properly. If narrowing is needed repeatedly, put one cast inside a shared helper rather than scattering casts.
- **Shared helpers, no duplication:** store reset/gating lives in `tv-ui/test/unit/helpers/stores.ts` (`resetStores()`, `setTvConfigLoaded()`); RTL cleanup is centralized in `tv-ui/test/setup.ts`. Never add per-file `cleanupRtl()` boilerplate.
- **File placement:** unit tests in `test/unit/<area>/`, integration in `test/integration/`. Tests never live in `src/`. Import app code by relative path into `src/` (e.g. `../../../src/components/...`) — there's no `src/` alias.
- **One behavior per test**, named after the behavior ("blocks sets and warns before tvConfigLoaded"), not the API.
- **Doc citations:** tests verifying documented behavior cite it with `@see docs/<file>.md § "<heading>"`. If behavior is worth testing but not documented, document it.

## Why teardown is clean (parallel execution history)

The suite runs fully parallel with zero unhandled errors. Getting there required four independent fixes; if regressions appear, check these first:

1. **Unhandled rejections in app code** — `updateTvConfig` in `tv-ui/src/helpers/stash-config-storage.ts` runs without a caller awaiting it, so any API failure must be caught there or it surfaces as an unhandled rejection.
2. **Unit tests making real Apollo requests** — the tvConfig store hydrates through `stashConfigStorage`, which builds a real Apollo client. Even caught failures can leak unhandled rejections through Apollo's internal promises, so unit tests mock the client entirely (see "Test-only exceptions").
3. **`graphql-ws` disposal** — see the disposal gotcha above.
4. **XHRs settling after teardown** — Stash's VTT thumbnails plugin loads its `.vtt` with `XMLHttpRequest` and touches `window` when it loads; one landing after jsdom teardown fails the run with "window is not defined". `test/setup.ts` tracks in-flight XHRs and awaits them (bounded) in `afterAll`. ⚠️ Vitest 3.2 has no `onUnhandledError`/`onUnhandledRejection` config option — an earlier attempt to filter this error in `vitest.config.ts` was silently ignored, so fix such errors at the source rather than filtering.

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

Integration — `bootApp()` handles the module reset, render, readiness wait, and unmount:

```typescript
import { describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("integration feature", () => {
  it("behaves correctly with mock API", async () => {
    const app = await bootApp();

    // Assert on observable outcomes: DOM content, server state, or request
    // counts (integration.server.getRequestCounts()).
    await waitFor(() => {
      expect(app.rendered.container.textContent).toContain("expected text");
    });

    // Cleanup: unmount only — Apollo clients are deliberately not stopped (see
    // the harness NOTE and the graphql-ws disposal gotcha above).
    await app.unmount();
  });
});
```

## Gotchas

⚠️ **Running tests doesn't typecheck them.** There is no pre-commit hook in this repo (no husky/lint-staged; commitlint covers commit messages in CI only), and **vitest does not typecheck** — esbuild strips types. Type errors have landed in `main` test files this way. Run `yarn typecheck` from the repo root as part of any test change. It checks the root tsconfig (tv-ui, tv-plugin, mock-stash) and `packages/repo`'s own tsconfig.

⚠️ **A bare `tsc` covers only one tsconfig.** `packages/repo` has its own `tsconfig.json`, which the root one doesn't include. Running `tsc` there skips everything else, and running it at the root skips `packages/repo`. `yarn typecheck` runs both.

⚠️ **jest-dom matcher typing can disagree between CLI and editor.** jest-dom v5 (pinned for React 17) ships only Jest-style types via `@types/testing-library__jest-dom`, which augments the global `jest.Matchers` namespace. Vitest's `Assertion` extends `jest.Matchers`, so the CLI resolves matchers via auto-included `@types` — but the editor's TS server doesn't reliably apply that augmentation, producing phantom "Property 'toHaveStyle' does not exist" errors that `tsc --noEmit` doesn't report. The explicit bridge in `tv-ui/types/jest-dom-matchers.d.ts` declares the matchers directly on vitest's `Assertion` so both agree. If you add more matcher libraries, extend that bridge.

⚠️ **Version pins for React 17:** `@testing-library/react` 12.x, `@testing-library/dom` 8.x, `@testing-library/jest-dom` 5.x, `@testing-library/user-event` 14.x. Do not bump these without solving React 18 first.

⚠️ **Unit tests must never make real network requests.** Without `VITE_APP_PLATFORM_URL` set, Apollo links default to `http://localhost:9999` — Stash's default port, likely a live server (or SSH tunnel) on a dev machine; real responses (e.g. 404s) surface as unhandled rejections. Unit tests are kept network-free by the project-scoped Apollo client mock (see "Test-only exceptions"); integration tests use `mock-stash`'s ephemeral port. If you add a unit test that needs Apollo, extend the mock — don't let it hit the default port.

⚠️ **`graphql-ws` clients need disposal before jsdom teardown.** The Apollo client singleton uses `retryAttempts: Infinity`; integration tests create many clients via `vi.resetModules()` re-imports. `tv-ui/test/setup.ts` wraps `graphql-ws`'s `createClient` to track and dispose all clients in `afterAll`. If you see unhandled `ECONNREFUSED`/reconnect errors in teardown, this wrapper is the place to look.

⚠️ **`vi.mock` calls must live in the test file itself.** Vitest hoists `vi.mock` to the top of the *file that declares it* — mocks placed in an imported helper module (e.g. `test-harness.ts`) are applied too late and the real module loads. This bit the tv-plugin tests: mocks for `stash-ui/dist/src/core/StashService` etc. must be declared in each test file (a shared comment pointing at the reasoning is the pattern used in `packages/tv-plugin/test/unit/`).

⚠️ **Persisted-config tests must seed the hybrid storage's local key.** tvConfig persists through `createJSONStorage` over the hybrid storage: the localStorage half lives under **`app-state-local`** (the `-local` suffix), not the plugin-name key. Tests that seed any other key pass vacuously on defaults — this silently gutted the original migration tests.

⚠️ **`startMockStash` rejects with `EADDRINUSE` when its fixed port is taken** (it used to hang until the hook timeout). Find leftovers with `lsof -nP -iTCP:4000 -sTCP:LISTEN`. The WebSocket server is attached only after `listen` succeeds, because `ws` re-emits HTTP server errors and graphql-ws would log them as a noisy "internal error".

⚠️ **`DEBUG_MOCK_REQUESTS=1` logs every GraphQL operation mock-stash executes** (operation name + variables) — the fastest way to see what the app actually sends when debugging integration/e2e tests.

⚠️ **SVG `?react` imports need `vite-plugin-svgr` in every Vitest project.** Vitest projects don't inherit root `plugins`, so `vitest.config.ts` sets `svgr()` on each project. Without it `*.svg?react` resolves to a data-URL string. A button whose whole `icon` is such a string then renders "?" (see the `ActionButtonIcon` string bug under "App-code smells"), and the "?" ends up in its accessible name.

⚠️ **Action buttons have no `data-testid`.** The per-type button components don't thread unknown props to the DOM, so e2e asserts on the `ActionButton` root class (the component's contract). If buttons ever gain a testid, prefer it (see "Known gaps").

⚠️ **Saved-filter fixtures must use Stash's UI shape for hierarchical criteria.** Stash's frontend saves tag/performer criteria in saved filters as `{value: {items: [{id, label}], excluded, depth}, modifier}` — *not* the flat `{value: [ids], modifier, depth}` criterion input the GraphQL API accepts. The mock's fixtures originally used the flat shape, which `ListFilterModel.configureFromSavedFilter` silently parses to an empty item list — tag filters matched nothing and nothing errored. Any new fixture with a tags/performers criterion must use the `items` shape.

⚠️ **Node 26 shadowing jsdom localStorage:** tests must run with `--no-experimental-webstorage` (already in the package `test` scripts — keep it there).

⚠️ **Mousetrap needs `KeyboardEvent.which`, which jsdom leaves at 0.** Stash's keybind hooks (e.g. rating shortcuts) use Mousetrap, which reads only `which`; `test/setup.ts` polyfills it from `charCode`/`keyCode` as browsers do. Without it, Mousetrap bindings silently never fire under `userEvent`.

⚠️ **Mousetrap is one shared instance across boots.** It's an externalised node_modules dependency, so `vi.resetModules()` doesn't give each `bootApp()` a fresh copy, and its bindings are global. Stash's rating keybinds unbind the digit keys on a 1s timer after `r`, and that timer lives in the stash-ui module instance of the app that started it — a re-imported app can't cancel it. A test that presses `r` must let that window expire before the next test (see `keyboard-rating.test.tsx`), or the stale timer can unbind the next app's digits mid-sequence.

⚠️ **`userEvent.click` breaks once a MediaSlide is mounted.** userEvent defines `detail` on its click events as a non-configurable own property, and MediaSlide's use-gesture workaround redefines `detail` on every window click, so the click throws "Cannot redefine property: detail". Real browser clicks don't do this. In integration tests that click with the feed mounted, use `fireEvent.click` and say why in a comment (see `keyboard-shortcuts-help.test.tsx`).

⚠️ **jsdom's `document` outlives each `bootApp()`.** Inline state the app writes to `<html>`/`<body>` (e.g. modals set `--fixed-right-padding`, a bogus 649px under the stubbed VisualViewport, which react-spring then fails to parse when the next boot mounts the settings drawer) leaks into the next test, so the harness `afterEach` clears it the way a page reload would. Extend that reset if you find other document-level leakage. ⚠️ Vitest runs `afterEach` hooks in reverse registration order, so the global RTL `cleanup` in `setup.ts` runs *after* the harness's reset. The harness therefore calls `cleanup()` itself first. Otherwise a test that fails before `unmount()` leaves its app mounted through the reset, and the next test's boot crashes with react-spring's "Unexpected token 0px".

⚠️ **Don't import `stash-ui/dist/src/core/StashService` at the top of an integration test.** Importing it creates an Apollo client immediately (`createClient()` at module scope). At the top of a test file that happens before the harness points `VITE_APP_PLATFORM_URL` at the mock server, so the client retries against port 9999 forever and can make the `graphql-ws` disposal `afterAll` time out. Import it dynamically inside the test after `bootApp()`, which also returns the app's own instance (see `background-updates.test.tsx`).

⚠️ **Stash's form labels don't point at their react-select inputs.** In forms like `SceneMarkerForm`, `<label for="primary_tag_id">` has no matching input id, so `getByLabelText` fails. Find the field's `.form-group` from its label and take the combobox inside it (see `markerFormSelect` in `create-marker-button.test.tsx`). `MarkerTitleSuggest` is also disabled until its suggestions load, so wait for it to be enabled before typing.

⚠️ **jsdom never fires `timeupdate`, and its playback position stays at 0.** Anything MediaSlide recomputes on `timeupdate` (e.g. the "currently playing marker" label) only changes in a test if you fire the event on the slide's `<video>` yourself.

⚠️ **Anything that depends on layout needs an e2e test.** jsdom has no layout, so positioning bugs (e.g. a dropdown menu inside an action button's side panel opening off screen or behind the panel's backdrop) pass every unit and integration test. In Playwright, `toBeVisible()` doesn't catch them either: an element off screen or covered by something else still counts as visible. Check `toBeInViewport()` and hit-test with `document.elementFromPoint` (see `expectUsableOnScreen` in `test/e2e/create-marker-button.test.ts`).

⚠️ **E2E tests that need non-default config set it through the API.** tvConfig lives in Stash's plugin config, so send a `configurePlugin` mutation to `/graphql` (proxied to mock-stash) before `page.goto`, and reset it to `{}` afterwards: the mock server is shared by every e2e test. Include `showGuideOverlay: false`, or the first-run guide overlay covers the page and swallows every click.

⚠️ **Known jsdom limitations:** no pointer capture (Radix drag tests are skipped with reasons inline), no Gamepad API (stubbed in `setup.ts`), `HTMLMediaElement.play` stubbed. Document skipped tests inline.

## Test-only exceptions to app-code rules

- `useStore.setState` — forbidden in app code (bypasses typed setters and persistence routing), permitted **only** inside the shared test helpers in `test/unit/helpers/stores.ts` for resetting to a known state. Never scatter raw `setState` through individual tests.
- Apollo client mocks prevent real connection attempts in unit tests; integration tests use the real client against `mock-stash` instead. The unit/integration split is a Vitest "projects" config (`tv-ui/vitest.config.ts`): the mock lives in `tv-ui/test/setup-unit-apollo.ts` and is only in the unit project's `setupFiles` — putting it in the shared `test/setup.ts` breaks integration tests.

## Known gaps & deferred improvements

Issues found in the 2026-09 test-suite review that were **not** fixed — pick these up incrementally.

### Enforcement (highest leverage)

- **No lint enforcement of the standards.** The `any`/`as`-cast/`fireEvent` drift the review found would be caught by a minimal ESLint config (`@typescript-eslint/no-explicit-any`, `no-unnecessary-type-assertion`, RTL-specific rules) scoped to test files. Until then, the standards are manual.
- **CI doesn't typecheck `packages/repo`.** CI's TypeScript check runs `tsc --noEmit` against the root tsconfig, which covers tv-ui (tests included), tv-plugin and mock-stash but not `packages/repo`. Switching that step to `yarn typecheck` would close the gap.
- **No coverage thresholds.** Coverage is scoped to `src/**` (stories excluded) but nothing prevents regressions. Consider `coverage.thresholds` once the numbers stabilise.

### Known coverage holes (from the v8 report)

- `useViewportRotate` (~42%) — a whole advertised feature, barely tested
- `useMediaItemTags` (~27%), `useSceneUpdate` (~32%), `useStashTvConfig` (~48%)
- Media-modifier hooks `openModifier` (~36%) and `shuffleModifier` (~25%) — integration coverage exists for the modifier *pipeline*, not these implementations
- `popper-modifiers/setMaxSize.ts` (~15%) and the other popper modifiers
- `action-buttons/button-config.ts` (~15%)
- `MediaSlide` (~63%) and `Feed` error/empty-state paths

### Test-quality debt

- **mock-stash `meta.test.ts`**: the `scanCompleteSubscribe` test uses a fixed 250 ms delay for subscription establishment — a CI flake risk (signal readiness instead); the marker create/update/destroy test bundles three behaviours in one `it`.
- **Conformance suite** (`packages/mock-stash/test/conformance/`): scattered `as` casts on projections (centralise a typed-projection helper); "findScenes sorts by path consistently" sorts inside its own projection, weakening what it verifies.
- **`docs.test.ts`**: only scans top-level `docs/` (a nested doc escapes validation); a citation pointing at a nonexistent file crashes with a raw ENOENT instead of a clean failure; `](docs/...)` links are matched anywhere in AGENTS.md, not just the Documentation table.
- **E2E is still mostly smoke-level**: the only interaction tests are the create-marker side panel's dropdowns. Nothing yet covers scrolling to the next slide or opening settings.
- **`EditTagsContents` unit tests mock `EditTagSelectionForm`** — a real-form integration test would cover the prop forwarding for free and exercise the actual editing flow.

### App-code smells surfaced by the review (fix in app code, not tests)

- **Scan-complete cache reset doesn't exist in tv-ui.** `resetStore()` on `ScanComplete` lives on stash-ui's `createClient()` client, which the app doesn't use for its queries — a finished scan won't refresh the feed. The original integration test asserted this fiction and was deleted. If the behaviour is wanted, wire the subscription in tv-ui and restore the test (the mock-server request counting added during the review is still available).
- **`ActionButtonIcon` silently mis-handles a top-level string `iconDefinition`**: it falls into the per-state indexing branch (`iconDefinition[state]`), which is `undefined` for strings — only strings *inside* a per-state map (or config `iconId` states) reach the `<img>` branch.
- **`propertyRemap`'s map-to-property-name mode only works for accessor (getter) properties** — data properties crash. Every in-repo use maps via a function; consider dropping or fixing the name mode.
- **`MediaItemStateContextProvider` uses `useMemo(..., [])`** — changing `initialValues` props after mount is silently ignored.
- **`Slider`'s mark count uses `max || 1` / `step || 1`** — a legitimate `0` value for `min`/`step` falls back to the default.

## History

The test suite was introduced via the plan in `docs/historical-plans/2026-08-30-testing-implementation-plan.md` (mock-stash package, conformance-vs-real-Stash, tiered strategy). That plan is frozen; this doc is the living reference.
