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

E2E tests set up server-side state through `test/e2e/helpers/stash.ts`: `graphql(request, query, variables)` runs an operation against mock-stash, `setTvConfig(request, state)` replaces the persisted tvConfig with the given settings, and `setActionButtons(request, config)` replaces just the action button stack (`null` restores the defaults for either; call it in `afterEach`). `expectUsableOnScreen(locator)` (`test/e2e/helpers/layout.ts`) checks an element is on screen with nothing covering it. ⚠️ It hit-tests the element's corners, which aren't part of an element with rounded corners (e.g. a pill): check something inside it instead.

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

- `pinUncheckedActionButton(options)`: pin one button whose config skips type checking, to test how buttons handle bad saved config (e.g. an unknown `buttonType`, a quick tag with no `tagId`)
- `fireLoadStart(app)`: fire `loadstart` on the current slide's video (see the gotcha below)
- `failCurrentSource(app)`: make the current slide's video fail to play its source, as a browser does when it can't decode it

Entity popover helpers (`test/integration/helpers/entity-popovers.ts`): `bootShowingFields([...])` boots with the info panel open showing the title, date and those fields; `openEntityPopover(app, name)` clicks an entity's name in it and returns its popover; `showTemporaryEntityFilter`, `temporaryChannelFilter`, and `feedShows` / `feedDoesNotShow` (by scene title).

Harness helpers for tests that change state outliving a test:
- `restoreServerMediaAfterEach(integration)`: snapshot the server's scenes and markers before each test and restore them after
- `savedTvConfig(integration)`: the tvConfig the app has saved to the server (see the gotcha below)

Action button helpers shared by both tiers live in `test/helpers/actionButtons.tsx`: `sidePanel()` / `isSidePanelOpen()` / `closeSidePanelByClickingOutside()`, `actionButtonRoot(button)`, and `displayedIconState(actionButton, icon)`, which reads a button's state from its icon (the only sign of it for buttons whose title doesn't change). ⚠️ That file imports app code only inside its functions, and integration tests must do the same: see the `StashService` gotcha below.

Tests that change the mock server's scenes or markers (rating, o-count, deleting) must restore them in `afterEach` (`restoreServerMediaAfterEach`): the server store outlives each test. Fixture scenes have no captions; set `captions` on a scene record to give it some. Fixture tags, performers and studios have no images of their own: like Stash, mock-stash marks their `image_path` as its stand-in (`default=true`) unless the record has `has_image`. Filtering scenes by studio includes sub-studios' scenes, and leaves out scenes without a studio.

## Standards (binding for all tests)

- **Test behavior, not implementation.** Every test must state an observable behavior: a guard firing, persistence landing in the right backend, a computed output, a conditional render, a callback receiving the right arguments. Heuristic: if you can describe the test as "when X happens, Y is the observable result", keep it; if you can only describe it as "the code contains X", delete it. Explicitly excluded: default-value restatements, `set(x); expect(get(x))` round-trips, `typeof` assertions, class-name-existence checks.
- **Query priority (RTL):** accessible queries (`getByRole`, `getByText`, `getByLabelText`) → `data-testid` (add to app code when needed — sanctioned) → class selectors only when the class *is* the contract (styling components like `Tag`/`ClipTimestamp`).
- **Interactions:** prefer `userEvent` over `fireEvent` for realistic user interactions. `fireEvent` is acceptable for events users don't literally fire or jsdom workarounds — comment why.
- **TypeScript:** tests are typechecked and must be clean. No `as Foo` casts, `any`, or `@ts-expect-error` — narrow unions properly. If narrowing is needed repeatedly, put one cast inside a shared helper rather than scattering casts.
- **Shared helpers, no duplication:** store reset/gating lives in `tv-ui/test/unit/helpers/stores.ts` (`resetStores()`, `setTvConfigLoaded()`); RTL cleanup is centralized in `tv-ui/test/setup.ts`. Never add per-file `cleanupRtl()` boilerplate.
- **File placement:** unit tests in `test/unit/<area>/`, integration in `test/integration/`. Tests never live in `src/`. Import app code by relative path into `src/` (e.g. `../../../src/components/...`) — there's no `src/` alias.
- **One behavior per test**, named after the behavior ("blocks sets and warns before tvConfigLoaded"), not the API.
- **Doc citations:** tests verifying documented behavior cite it with `@see docs/<file>.md § "<heading>"` (or `AGENTS.md § "<heading>"` for repo-wide behaviour). `packages/repo/test/docs.test.ts` checks every cited heading exists, matching exactly, case included. If behavior is worth testing but not documented, document it.

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

⚠️ **Don't hard-code a window width a test's set up depends on.** Some scene info panel e2e tests need things to wrap a particular way (e.g. a row of unused fields with no room for another), which moves whenever the pills' contents or the panel's padding change, so a width that worked stops working. They step the window's width until what they need holds (`resizeUntil` in `test/e2e/scene-info-panel.test.ts`), checked in the page, and fail saying so if no width does.

⚠️ **Importing Stash's `StashService` connects to Stash.** It creates its Apollo client and WebSocket as it's imported, and in a unit test (no mock server) the WebSocket's disposal in `afterAll` times out, failing the file though its tests pass ("Hook timed out"). Many components import it, directly or through hooks (e.g. `useSetRating`, `useOCounter`), so a unit test of plain code that imports components through it needs `vi.mock("stash-ui/dist/src/core/StashService", () => ({}))` (as `sceneInfoConfig.test.ts` does), and modules the stores import mustn't import components (as the tvConfig store imports the scene info panel's default layout from `default-layout.ts`).

⚠️ **Version pins for React 17:** `@testing-library/react` 12.x, `@testing-library/dom` 8.x, `@testing-library/jest-dom` 5.x, `@testing-library/user-event` 14.x. Do not bump these without solving React 18 first.

⚠️ **Unit tests must never make real network requests.** Without `VITE_APP_PLATFORM_URL` set, Apollo links default to `http://localhost:9999` — Stash's default port, likely a live server (or SSH tunnel) on a dev machine; real responses (e.g. 404s) surface as unhandled rejections. Unit tests are kept network-free by the project-scoped Apollo client mock (see "Test-only exceptions"); integration tests use `mock-stash`'s ephemeral port. If you add a unit test that needs Apollo, extend the mock — don't let it hit the default port.

⚠️ **`graphql-ws` clients need disposal before jsdom teardown.** The Apollo client singleton uses `retryAttempts: Infinity`; integration tests create many clients via `vi.resetModules()` re-imports. `tv-ui/test/setup.ts` wraps `graphql-ws`'s `createClient` to track and dispose all clients in `afterAll`. If you see unhandled `ECONNREFUSED`/reconnect errors in teardown, this wrapper is the place to look.

⚠️ **`vi.mock` calls must live in the test file itself.** Vitest hoists `vi.mock` to the top of the *file that declares it* — mocks placed in an imported helper module (e.g. `test-harness.ts`) are applied too late and the real module loads. This bit the tv-plugin tests: mocks for `stash-ui/dist/src/core/StashService` etc. must be declared in each test file (a shared comment pointing at the reasoning is the pattern used in `packages/tv-plugin/test/unit/`).

⚠️ **Persisted-config tests must seed the hybrid storage's local key.** tvConfig persists through `createJSONStorage` over the hybrid storage: the localStorage half lives under **`app-state-local`** (the `-local` suffix), not the plugin-name key. Tests that seed any other key pass vacuously on defaults — this silently gutted the original migration tests.

⚠️ **`startMockStash` rejects with `EADDRINUSE` when its fixed port is taken** (it used to hang until the hook timeout). Find leftovers with `lsof -nP -iTCP:4000 -sTCP:LISTEN`. The WebSocket server is attached only after `listen` succeeds, because `ws` re-emits HTTP server errors and graphql-ws would log them as a noisy "internal error".

⚠️ **To assert on which requests were made, use the mock server's request log.** `server.getRequestCounts()` counts operations by name, and `server.getRequests()` lists each one in order with its variables (e.g. to check which scene a `FindScene` was for). `resetRequestCounts()` clears both. Note vitest hides `console.log` output from passing tests (`silent: 'passed-only'`), so debug logging only shows up when a test fails.

⚠️ **`DEBUG_MOCK_REQUESTS=1` logs every GraphQL operation mock-stash executes** (operation name + variables) — the fastest way to see what the app actually sends when debugging integration/e2e tests.

⚠️ **SVG `?react` imports need `vite-plugin-svgr` in every Vitest project.** Vitest projects don't inherit root `plugins`, so `vitest.config.ts` sets `svgr()` on each project. Without it `*.svg?react` resolves to a data-URL string. A button whose whole `icon` is such a string then renders "?" (see the `ActionButtonIcon` string bug under "App-code smells"), and the "?" ends up in its accessible name.

⚠️ **Action buttons have no `data-testid`.** The per-type button components don't thread unknown props to the DOM, so e2e asserts on the `ActionButton` root class (the component's contract). If buttons ever gain a testid, prefer it (see "Known gaps").

⚠️ **Saved-filter fixtures must use Stash's UI shape for hierarchical criteria.** Stash's frontend saves tag/performer criteria in saved filters as `{value: {items: [{id, label}], excluded, depth}, modifier}` — *not* the flat `{value: [ids], modifier, depth}` criterion input the GraphQL API accepts. The mock's fixtures originally used the flat shape, which `ListFilterModel.configureFromSavedFilter` silently parses to an empty item list — tag filters matched nothing and nothing errored. Any new fixture with a tags/performers criterion must use the `items` shape.

⚠️ **Node 26 shadowing jsdom localStorage:** tests must run with `--no-experimental-webstorage` (already in the package `test` scripts — keep it there).

⚠️ **Mousetrap needs `KeyboardEvent.which`, which jsdom leaves at 0.** Stash's keybind hooks (e.g. rating shortcuts) use Mousetrap, which reads only `which`; `test/setup.ts` polyfills it from `charCode`/`keyCode` as browsers do. Without it, Mousetrap bindings silently never fire under `userEvent`.

⚠️ **Mousetrap is one shared instance across boots.** It's an externalised node_modules dependency, so `vi.resetModules()` doesn't give each `bootApp()` a fresh copy, and its bindings are global. Stash's rating keybinds unbind the digit keys on a 1s timer after `r`, and that timer lives in the stash-ui module instance of the app that started it — a re-imported app can't cancel it. A test that presses `r` must let that window expire before the next test (see `keyboard-rating.test.tsx`), or the stale timer can unbind the next app's digits mid-sequence.

⚠️ **Don't race Stash's 1s rating window against wall-clock time — freeze the clock.** Tests about what happens when a sequence's window runs out (e.g. a second rating spanning the first one's timeout) used to sleep until ~850ms after the first `r`, but under a full parallel run the first rating's server round trip alone took 1–3s, so they flaked. They now use `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })` for just the typing, with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` (the default userEvent waits on a real `setTimeout` between keys, which would hang), and step the window with `vi.advanceTimersByTime` (see `freezeClock()` in `keyboard-rating.test.tsx`). Faking only those, and only briefly, leaves the app and mock server working: the slowdown seen in one early trial was CPU load, not fake timers. While the clock is frozen:
- RTL's `waitFor` (and helpers built on it, like `goToNextSlide`) still polls, on `setInterval`, but its timeout is a `setTimeout` and never fires: RTL 8 only recognises Jest's fake timers. A wait that never succeeds shows up as the 20s test timeout, so do any wait that can fail after `vi.useRealTimers()`. The file's `afterEach` restores real timers before anything else, so the teardown hooks don't hang too.
- `vi.waitFor` does have a real deadline, but it advances the frozen clock on every check, so real time spent waiting eats into the window again. Don't use it to time a window.
- Anything that needs a timer to fire, e.g. VideoScroller's 100ms index throttle when changing slides, only moves when you advance the clock past it.

⚠️ **`userEvent.click` breaks once a MediaSlide is mounted.** userEvent defines `detail` on its click events as a non-configurable own property, and MediaSlide's use-gesture workaround redefines `detail` on every window click, so the click throws "Cannot redefine property: detail". Real browser clicks don't do this. In integration tests that click with the feed mounted, use `fireEvent.click` and say why in a comment (see `keyboard-shortcuts-help.test.tsx`).

⚠️ **jsdom's `document` outlives each `bootApp()`.** Inline state the app writes to `<html>`/`<body>` (e.g. modals set `--fixed-right-padding`, a bogus 649px under the stubbed VisualViewport, which react-spring then fails to parse when the next boot mounts the settings drawer) leaks into the next test, so the harness `afterEach` clears it the way a page reload would. Extend that reset if you find other document-level leakage. ⚠️ Vitest runs `afterEach` hooks in reverse registration order, so the global RTL `cleanup` in `setup.ts` runs *after* the harness's reset. The harness therefore calls `cleanup()` itself first. Otherwise a test that fails before `unmount()` leaves its app mounted through the reset, and the next test's boot crashes with react-spring's "Unexpected token 0px".

⚠️ **The app saves tvConfig to Stash without waiting for the write**, so a save can still be in flight when a test ends. The harness's `afterEach` waits for every boot's pending writes (`stashConfigWritesSettled()`) before resetting the server's config; without that, a write landing after the reset leaked into the next test's boot (it showed up on CI only, where the round trip is slower — the next boot came up with the previous test's info panel layout and timed out waiting for its ready text). To check a setting persists, wait on `savedTvConfig(integration)`.

⚠️ **Video.js (like Mousetrap) is one shared instance across boots, and so are the hooks registered on it.** tv-ui registers `videojs.hook(...)` callbacks at module level, so every `bootApp()` adds another set, and the previous apps' hooks still run on the new app's players. `usePlayerManager`'s hooks dispatch to per-player callbacks keyed by player id, and ids restart with each boot (`player-scene-7-0`), so a stale callback once ran the previous test's source-selector wrapper on the new player. The symptom was a stream preference from one test playing in the next, with the new app's tvConfig showing no preference. Per-player callbacks are now removed on unmount. If something leaks between tests with no trace in the server or tvConfig, look for module-level state on a shared dependency.

⚠️ **RTL's async timeout is 5s in integration tests** (`configure` in `harness.tsx`). The app and the mock server share one thread, so a round trip that takes ~200ms alone can take several times that when the whole suite runs in parallel. The 1s default made `create-marker-button` › "shows the new marker on the scene" flaky.

⚠️ **jsdom never fires `loadstart`.** Media loading is stubbed, so after a stream switch (or on a newly current slide) nothing tells `useSceneStreamSelection` which stream is playing. Call `fireLoadStart(app)` the way a browser would fire it.

⚠️ **The side panel isn't a `dialog` to RTL.** It renders as `<dialog>` without `open`, so `getByRole("dialog")` doesn't find it. Use `sidePanel()`. Its outside-click backdrop is the element just before it, and a click on it closes the panel only if a `pointerdown` on it came first (`closeSidePanelByClickingOutside()` fires both).

⚠️ **Don't import `stash-ui/dist/src/core/StashService` at the top of an integration test.** That includes anything that imports `store/tvConfig` (e.g. `ActionButtonBase`, any button definition, the icon registry's users): tvConfig → `stash-config-storage` → `getApolloClient` → `StashService`. The symptom is an `ApolloError … 404` and the `graphql-ws` disposal `afterAll` timing out. Import app values with `await import(...)` inside the test, after `bootApp()`; type-only imports are fine. Importing it creates an Apollo client immediately (`createClient()` at module scope). At the top of a test file that happens before the harness points `VITE_APP_PLATFORM_URL` at the mock server, so the client retries against port 9999 forever and can make the `graphql-ws` disposal `afterAll` time out. Import it dynamically inside the test after `bootApp()`, which also returns the app's own instance (see `background-updates.test.tsx`).

⚠️ **Stash's form labels don't point at their react-select inputs.** In forms like `SceneMarkerForm`, `<label for="primary_tag_id">` has no matching input id, so `getByLabelText` fails. Find the field's `.form-group` from its label and take the combobox inside it (see `markerFormSelect` in `create-marker-button.test.tsx`). `MarkerTitleSuggest` is also disabled until its suggestions load, so wait for it to be enabled before typing.

⚠️ **jsdom never fires `timeupdate`, and its playback position stays at 0.** Anything MediaSlide recomputes on `timeupdate` (e.g. the "currently playing marker" label) only changes in a test if you fire the event on the slide's `<video>` yourself.

⚠️ **The mock server is only as realistic as its resolvers.** Some queries the app makes are stubbed to return nothing (e.g. `sceneMarkerTags`, `plugins`). If a Stash component behaves differently in tests than against real Stash, check the mock's resolver first. `markerStrings` used to return `[]`, which made Stash's marker title field blank when editing an existing marker.

⚠️ **Anything that depends on layout needs an e2e test.** jsdom has no layout, so positioning bugs (e.g. a dropdown menu inside an action button's side panel opening off screen or behind the panel's backdrop) pass every unit and integration test. In Playwright, `toBeVisible()` doesn't catch them either: an element off screen or covered by something else still counts as visible. Check `toBeInViewport()` and hit-test with `document.elementFromPoint` (see `expectUsableOnScreen` in `test/e2e/helpers/layout.ts`).

⚠️ **jsdom tests don't load stylesheets**, so anything CSS decides, such as which elements are hidden, also needs an e2e test (e.g. the folder preview's 4-icon limit in `test/e2e/action-button-stack.test.ts`).

⚠️ **Dropdown e2e tests need realistic data and timing.** The mock has only 5 tags, so a tag menu is much shorter than on a real library, and Stash's tag selects load their options asynchronously, so a menu opened straight away is just "Loading...". Bugs that depend on menu size, like react-select scrolling the page to reveal a menu, only show up with enough options and once they've loaded: create extra tags with the mock's `tagCreate` (and `tagDestroy` them afterwards), and wait for the field's `.react-select__loading-indicator` to go before clicking (see the very-short-window test in `create-marker-button.test.ts`).

⚠️ **E2E tests that need non-default config set it through the API.** tvConfig lives in Stash's plugin config, so send a `configurePlugin` mutation to `/graphql` (proxied to mock-stash) before `page.goto`, and reset it to `{}` afterwards: the mock server is shared by every e2e test. Include `showGuideOverlay: false`, or the first-run guide overlay covers the page and swallows every click.

⚠️ **The iOS on-screen keyboard can only be reproduced in the iOS Simulator, with a person tapping.** Playwright's WebKit has no on-screen keyboard. What works:
- In the Simulator app, untick I/O ▸ Keyboard ▸ Connect Hardware Keyboard, or the on-screen keyboard never appears.
- Run the dev server (the simulator shares the Mac's network, so `localhost` works) and open the app in the simulator's Safari with `xcrun simctl openurl booted <url>`.
- Have someone tap through the steps, with a temporary dev-only script in the app that POSTs measurements (`visualViewport` size/offset, `scrollY`, focus, element rects) on each change to a small local HTTP server. Remove the script afterwards.
- `safaridriver` (with `safari:useSimulator`) can load pages and run scripts in the simulator, but not reproduce this: its taps arrive as a long press with no `touchend` or `click`, a focus it causes doesn't bring up the keyboard, and a person interacting by hand ends its session.

⚠️ **Known jsdom limitations:** no pointer capture (Radix drag tests are skipped with reasons inline), no Gamepad API (stubbed in `setup.ts`), `HTMLMediaElement.play` stubbed. Document skipped tests inline.

⚠️ **jsdom media stubs in `setup.ts`:** `MediaError` is polyfilled (Stash's source selector reads its codes to decide whether to fall back to the next stream), and `canPlayType` claims MP4 and WebM like a browser. Without the latter, Video.js rejects every source, so every player falls back through all its streams on boot. HLS/DASH stay unsupported (no Media Source Extensions), so choosing them errors as it would in a browser without MSE. To test a stream failing, use `failCurrentSource(app)`.

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
- `MediaSlide` (~63%) and `Feed` error/empty-state paths

### Test-quality debt

- **mock-stash `meta.test.ts`**: the marker create/update/destroy test bundles three behaviours in one `it`.
- **Conformance suite** (`packages/mock-stash/test/conformance/`): scattered `as` casts on projections (centralise a typed-projection helper); "findScenes sorts by path consistently" sorts inside its own projection, weakening what it verifies.
- **E2E is still mostly smoke-level**: the only interaction tests are the create-marker side panel's dropdowns. Nothing yet covers scrolling to the next slide or opening settings.
- **`EditTagsContents` unit tests mock `EditTagSelectionForm`** — a real-form integration test would cover the prop forwarding for free and exercise the actual editing flow.

### App-code smells surfaced by the review (fix in app code, not tests)

- **Scan-complete cache reset doesn't exist in tv-ui.** `resetStore()` on `ScanComplete` lives on stash-ui's `createClient()` client, which the app doesn't use for its queries — a finished scan won't refresh the feed. The original integration test asserted this fiction and was deleted. If the behaviour is wanted, wire the subscription in tv-ui and restore the test (the mock-server request counting added during the review is still available).

## History

The test suite was introduced via the plan in `docs/historical-plans/2026-08-30-testing-implementation-plan.md` (mock-stash package, conformance-vs-real-Stash, tiered strategy). That plan is frozen; this doc is the living reference.
