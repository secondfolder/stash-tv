# Unit & Integration Tests

**Read this when:** writing or changing tv-ui's unit or integration tests (Vitest, in jsdom), or touching their set-up (`test/setup.ts`, `vitest.config.ts`, the integration harness). The tiers, standards and where files go are in [testing](testing.md).

## Integration harness

Integration tests boot the full app through `bootApp()` from
`test/integration/helpers/harness.tsx`: it renders `<App />` against the mock
server, waits for a ready text (default `"Aurora Ascending"`, the first-page
fixture — pass your own when booting a different filter), and returns
`{ rendered, apolloClient, unmount }`. `afterEach` resets localStorage *and*
the mock server's plugin/ui config so tests can't rehydrate each other's
writes.

Feed-level helpers live in `test/integration/helpers/feed.ts`:
- `slides` / `currentSlide` / `sceneIdOf` / `goToNextSlide` / `goToSlide`: find and move between rendered slides
- `click(element)`: click with `fireEvent` (see the `userEvent.click` gotcha below). Use it rather than a local copy
- `tvConfig()`: the booted app's tvConfig store. `setStackConfig(config)` replaces the action button stack
- `actionButton(app, name)`: the current slide's action button with that name, looked for in the action button stack only (the info panel has buttons of the same names)
- `bootMarkersFeed()`: boot showing every marker. `feedShows(app, text)` / `feedDoesNotShow(app, text)`: wait for the feed to show text (e.g. a scene's title), or stop showing it
- `bootWithTvConfig(configure, readyText?)`: change persisted tvConfig, then boot with it (e.g. a different filter or page size). It changes the config through a fresh copy of the tvConfig store without rendering the app: the store loads saved config as it's imported and saves through the app's own storage, and rendering the feed is most of what a boot costs
- `pinActionButtons([...])` and `displayedSideInfo(app, buttonType)`: most action buttons sit in a closed folder by default, so pin the ones whose displayed state you assert on. Pass a button type, or a button's options for buttons that need them (e.g. `{ buttonType: "create-marker", iconId: "bookmark", markerDefaults: … }`)

- `pinUncheckedActionButton(options)`: pin one button whose config skips type checking, to test how buttons handle bad saved config (e.g. an unknown `buttonType`, a quick tag with no `tagId`)
- `fireLoadStart(app)`: fire `loadstart` on the current slide's video (see the gotcha below)
- `failCurrentSource(app)`: make the current slide's video fail to play its source, as a browser does when it can't decode it

Entity popover helpers (`test/integration/helpers/entity-popovers.ts`): `bootWithPanelOpenShowing([...])` boots with the info panel open showing the title, date and those fields; `openEntityPopover(app, name)` clicks an entity's name in it and returns its popover; `showTemporaryEntityFilter` and `temporaryChannelFilter`.

Dropdowns (`test/integration/helpers/selects.ts`), for the react-select selects in Stash's forms and ours: `chooseSelectOption(combobox, text)` types an option's name and picks it, `openSelectMenu(combobox)` opens the menu and returns its listbox, and `typeIntoSelect(combobox, keys)` types anything and returns the listbox once shown.

Helpers used by one feature's tests live in `test/integration/helpers/<feature>.ts`, with a `setup…Test()` (see the gotcha on keeping files short). Before adding one, check `feed.ts`, `harness.tsx` and `selects.ts`, and the shared `test/helpers/actionButtons.tsx`, for one that already does it.

Harness helpers for tests that change state outliving a test:
- `restoreServerMediaAfterEach(integration)`: snapshot the server's scenes and markers before each test and restore them after
- `savedTvConfig(integration)`: the tvConfig the app has saved to the server (see the gotcha below)
- `serverOCount(integration, sceneId)`: the scene's o-count on the server

Action button helpers shared by both tiers live in `test/helpers/actionButtons.tsx`: `sidePanel()` / `isSidePanelOpen()` / `closeSidePanelByClickingOutside()`, `actionButtonRoot(button)`, and `displayedIconState(actionButton, icon)`, which reads a button's state from its icon (the only sign of it for buttons whose title doesn't change). ⚠️ That file imports app code only inside its functions, and integration tests must do the same: see the `StashService` gotcha below.


Tests that change the mock server's scenes or markers (rating, o-count, deleting) must restore them in `afterEach` (`restoreServerMediaAfterEach`): the server store outlives each test. What the mock's fixtures have, and don't, is in [mock-stash tests](testing-mock-stash.md) § "Fixtures".

## Why teardown is clean (parallel execution history)

The suite runs fully parallel with zero unhandled errors. Getting there required four independent fixes; if regressions appear, check these first:

1. **Unhandled rejections in app code** — `updateTvConfig` in `tv-ui/src/helpers/stash-config-storage.ts` runs without a caller awaiting it, so any API failure must be caught there or it surfaces as an unhandled rejection.
2. **Unit tests making real Apollo requests** — the tvConfig store hydrates through `stashConfigStorage`, which builds a real Apollo client. Even caught failures can leak unhandled rejections through Apollo's internal promises, so unit tests mock the client entirely (see "Test-only exceptions").
3. **`graphql-ws` disposal** — see the disposal gotcha below.
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

⚠️ **jest-dom's matchers come from `@testing-library/jest-dom/vitest`.** `test/setup.ts` imports it, which both adds the matchers to vitest's `expect` and declares them on its `Assertion` type, so the editor and `tsc` agree. Don't import `@testing-library/jest-dom/matchers` and `expect.extend` them yourself: that registers them without their types.

⚠️ **Testing Library only recognises Jest's fake timers.** After every user-event call it waits for a `setTimeout(0)`, advancing fake timers to fire it if it finds a `jest` global. Under vitest's fake timers (`vi.useFakeTimers()`, e.g. the keyboard rating tests' `freezeClock()`) it would wait forever, so `test/setup.ts` defines a minimal `jest` with just the `advanceTimersByTime` it uses. A consequence: `waitFor` with fake timers advances them as it polls (as under Jest), so a test timing things with a frozen clock shouldn't `waitFor` in the middle; advance the clock in `act()` instead, which renders what it causes straight away.

⚠️ **A UI change follows the server's.** mock-stash records a mutation before the app has its response, so after waiting for the server to have a change (`serverScene(...)`, `ratingsSent(...)`), `waitFor` what the UI shows too rather than expecting it straight away. Under load the app's render comes noticeably later.

⚠️ **A timer that outlives its component fails the run.** React 18 reads `window` when a state update is scheduled, even on an unmounted component (React 17 just ignored it), so a timeout setting state that fires after a test file's jsdom is torn down throws `ReferenceError: window is not defined` from `getCurrentEventPriority`, an unhandled error failing the run though every test passed. Clear timers in the effect's cleanup.

⚠️ **Importing Stash's `StashService` connects to Stash.** It creates its Apollo client and WebSocket as it's imported, and in a unit test (no mock server) the WebSocket's disposal in `afterAll` times out, failing the file though its tests pass ("Hook timed out"). Many components import it, directly or through hooks (e.g. `useSetRating`, `useOCounter`), so a unit test of plain code that imports components through it needs `vi.mock("stash-ui/dist/src/core/StashService", () => ({}))` (as `sceneInfoConfig.test.ts` does), and modules the stores import mustn't import components (as the tvConfig store imports the scene info panel's default layout from `default-layout.ts`).

⚠️ **Testing Library versions follow React's.** On React 18: `@testing-library/react` 16.x (with its peer `@testing-library/dom` 10.x), `@testing-library/jest-dom` 6.x, `@testing-library/user-event` 14.x.

⚠️ **Unit tests must never make real network requests.** Without `VITE_APP_PLATFORM_URL` set, Apollo links default to `http://localhost:9999` — Stash's default port, likely a live server (or SSH tunnel, or the dev server with `DEV_PORT=9999`) on a dev machine; real responses (e.g. 404s) surface as unhandled rejections, and Stash's websocket client, connected to it, never finishes disposing so `test/setup.ts`'s teardown times out. So the unit project sets `VITE_APP_PLATFORM_URL` to `http://127.0.0.1:1`, where nothing listens. Unit tests are kept network-free by the project-scoped Apollo client mock (see "Test-only exceptions"); integration tests use `mock-stash`'s ephemeral port. If you add a unit test that needs Apollo, extend the mock — don't let it hit the default port. ⚠️ `StashService`'s own query helpers (e.g. `queryFindTagsForSelect`, which Stash's tag selects load their options with) use its real client, not the mocked `getClient()`, so mock each one a component calls, as `setup-unit-apollo.ts` does for the tag selects' (with no tags). A request that slips through shows up as an unhandled `ECONNREFUSED … :9999` rejection, failing the file.

⚠️ **`graphql-ws` clients need disposal before jsdom teardown.** The Apollo client singleton uses `retryAttempts: Infinity`; integration tests create many clients via `vi.resetModules()` re-imports. `tv-ui/test/setup.ts` wraps `graphql-ws`'s `createClient` to track and dispose all clients in `afterAll`. If you see unhandled `ECONNREFUSED`/reconnect errors in teardown, this wrapper is the place to look.

⚠️ **`vi.mock` calls must live in the test file itself.** Vitest hoists `vi.mock` to the top of the *file that declares it* — mocks placed in an imported helper module (e.g. `test-harness.ts`) are applied too late and the real module loads. This bit the tv-plugin tests: mocks for `stash-ui/dist/src/core/StashService` etc. must be declared in each test file (a shared comment pointing at the reasoning is the pattern used in `packages/tv-plugin/test/unit/`).

⚠️ **Persisted-config tests must seed the hybrid storage's local key.** tvConfig persists through `createJSONStorage` over the hybrid storage: the localStorage half lives under **`app-state-local`** (the `-local` suffix), not the plugin-name key. Tests that seed any other key pass vacuously on defaults — this silently gutted the original migration tests.

⚠️ **SVG `?react` imports need `vite-plugin-svgr` in every Vitest project.** Vitest projects don't inherit root `plugins`, so `vitest.config.ts` sets `svgr()` on each project. Without it `*.svg?react` resolves to a data-URL string. A button whose whole `icon` is such a string then renders "?" (see the `ActionButtonIcon` string bug under "App-code smells"), and the "?" ends up in its accessible name.

⚠️ **Node 26 shadowing jsdom localStorage:** tests must run with `--no-experimental-webstorage` (already in the package `test` scripts — keep it there).

⚠️ **Mousetrap needs `KeyboardEvent.which`, which jsdom leaves at 0.** Stash's keybind hooks use Mousetrap, which reads only `which`; `test/setup.ts` polyfills it from `charCode`/`keyCode` as browsers do. Without it, Mousetrap bindings silently never fire under `userEvent`. (Stash TV's own shortcuts, rating included, don't use Mousetrap: see [keyboard shortcuts](keyboard-shortcuts.md).)

⚠️ **userEvent doesn't set `KeyboardEvent.keyCode`** (it's 0), so code that only checks `keyCode` never sees the key in tests. That includes react-bootstrap modals closing on Escape (`keyCode === 27`): `{Escape}` doesn't close them. Match keys by `event.key`, as `CommandPalette` does for Escape (see [keyboard shortcuts](keyboard-shortcuts.md) § "The command palette").

⚠️ **Rating windows are held open in tests.** After a key starting a shortcut's sequence (e.g. `r`), the next key must come within 1s (see [keyboard shortcuts](keyboard-shortcuts.md) § "Matching"). `setupKeyboardRatingTest()` (`test/integration/helpers/keyboard-rating.ts`) holds those windows open (it recognises the timers by their callback, `endSequence`) until the test ends them with `endRatingWindows()`, or teardown does. They never run out in real time, so digits typed after `r` can't miss the window on a busy machine, and nothing waits a second for one to close. Tests of a window running out freeze the clock (below). A test that relies on whether a window is open checks how many it found (`expect(endRatingWindows()).toBe(0)`), so renaming the callback fails loudly. The sequence typed so far is module state, so teardown ends any window a test left open rather than leave it to the next test.

⚠️ **Don't race Stash's 1s rating window against wall-clock time — freeze the clock.** Tests about what happens when a sequence's window runs out (e.g. a second rating spanning the first one's timeout) used to sleep until ~850ms after the first `r`, but under a full parallel run the first rating's server round trip alone took 1–3s, so they flaked. They now use `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })` for just the typing, with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` (the default userEvent waits on a real `setTimeout` between keys, which would hang), and step the window with `vi.advanceTimersByTime` (see `freezeClock()` in `test/integration/helpers/keyboard-rating.ts`). Faking only those, and only briefly, leaves the app and mock server working: the slowdown seen in one early trial was CPU load, not fake timers. While the clock is frozen:
- RTL's `waitFor` (and helpers built on it, like `goToNextSlide`) advances the frozen clock as it polls (see the fake timers gotcha above), so a `waitFor` while it's frozen moves the window on as well as waiting. Do any wait after `vi.useRealTimers()`, or advance the clock yourself inside `act()`, which renders what that causes straight away. The file's `afterEach` restores real timers before anything else, so the teardown hooks don't hang.
- `vi.waitFor` does have a real deadline, but it advances the frozen clock on every check, so real time spent waiting eats into the window again. Don't use it to time a window.
- Anything that needs a timer to fire, e.g. VideoScroller's 100ms index throttle when changing slides, only moves when you advance the clock past it.

⚠️ **`userEvent.click` breaks once a MediaSlide is mounted.** userEvent defines `detail` on its click events as a non-configurable own property, and MediaSlide's use-gesture workaround redefines `detail` on every window click, so the click throws "Cannot redefine property: detail". Real browser clicks don't do this. In integration tests that click with the feed mounted, use `fireEvent.click` and say why in a comment (see `keyboard-shortcuts-help.test.tsx`).

⚠️ **jsdom's `document` outlives each `bootApp()`.** Inline state the app writes to `<html>`/`<body>` (e.g. modals set `--fixed-right-padding`, a bogus 649px under the stubbed VisualViewport, which react-spring then fails to parse when the next boot mounts the settings drawer) leaks into the next test, so the harness `afterEach` clears it the way a page reload would. Extend that reset if you find other document-level leakage. ⚠️ Vitest runs `afterEach` hooks in reverse registration order, so the global RTL `cleanup` in `setup.ts` runs *after* the harness's reset. The harness therefore calls `cleanup()` itself first. Otherwise a test that fails before `unmount()` leaves its app mounted through the reset, and the next test's boot crashes with react-spring's "Unexpected token 0px".

⚠️ **The app saves tvConfig to Stash without waiting for the write**, so a save can still be in flight when a test ends. The harness's `afterEach` waits for every boot's pending writes (`stashConfigWritesSettled()`) before resetting the server's config; without that, a write landing after the reset leaked into the next test's boot (it showed up on CI only, where the round trip is slower — the next boot came up with the previous test's info panel layout and timed out waiting for its ready text). To check a setting persists, wait on `savedTvConfig(integration)`.

⚠️ **Video.js (like Mousetrap) is one shared instance across boots, and so are the hooks registered on it.** tv-ui adds its hooks at module level, so every `bootApp()` used to add another set, and the previous apps' hooks still ran on the new app's players. They're now added under keys, which replace the earlier boots' copies (see [video player](video-player.md) § "Architecture"). `usePlayerManager`'s hooks dispatch to per-player callbacks keyed by player id, and ids restart with each boot (`player-scene-7-0`), so a stale callback once ran the previous test's source-selector wrapper on the new player. The symptom was a stream preference from one test playing in the next, with the new app's tvConfig showing no preference. Per-player callbacks are now removed on unmount. If something leaks between tests with no trace in the server or tvConfig, look for module-level state on a shared dependency.

⚠️ **Keep integration test files short, about 10 tests or 15s each.** Vitest runs files in parallel but a file's tests one after another, so a run takes as long as its slowest file: one 26-test file took 54s while the rest of the suite had finished. Split a long file by its `describe` blocks, moving the helpers they share into `test/integration/helpers/<feature>.ts`, with a `setup…Test()` for the hooks every file needs (e.g. `setupSceneActionButtonsTest()` in `helpers/scene-action-buttons.ts`).

⚠️ **Don't query a booted app's whole page by label.** `ByLabelText` works out the labels of every element it searches, and in jsdom each of those lookups scans the document, so its cost grows with the square of the page's size: `screen.getByLabelText("Channel on Startup")` took 5s with the feed and Settings tab rendered. Query within the dialog or form group the field is in (`ByText` is cheap enough to find that by, as `startupChannelSelect()` in `helpers/channel-settings.ts` does). One test spent 11s of a parallel run this way, which a busy machine pushed past the test timeout.

⚠️ **Timeouts are generous so a busy machine slows tests down rather than failing them.** Other work running alongside (e.g. another copy of the suite) makes everything several times slower; with the old limits (20s per test, 5s for `waitFor`) 2–5 tests failed in each such run, and none with these. The test and hook timeout is 60s (`vitest.config.ts`), RTL's async timeout is 15s in integration tests (`configure` in `harness.tsx`), and `bootApp()` waits 30s for the feed. The app and the mock server share one thread, so a round trip that takes ~200ms alone can take several times that when the whole suite runs in parallel; the 1s default made `create-marker-button` › "shows the new marker on the scene" flaky. A failing test still fails on its own waits, just later. To check a change holds up under load, run the suite while another copy runs.

⚠️ **jsdom never fires `loadstart`.** Media loading is stubbed, so after a stream switch (or on a newly current slide) nothing tells `useSceneStreamSelection` which stream is playing. Call `fireLoadStart(app)` the way a browser would fire it.

⚠️ **The side panel isn't a `dialog` to RTL.** It renders as `<dialog>` without `open`, so `getByRole("dialog")` doesn't find it. Use `sidePanel()`. Its outside-click backdrop is the element just before it, and a click on it closes the panel only if a `pointerdown` on it came first (`closeSidePanelByClickingOutside()` fires both).

⚠️ **Don't import `stash-ui/dist/src/core/StashService` at the top of an integration test.** That includes anything that imports `store/tvConfig` (e.g. `ActionButtonBase`, any button definition, the icon registry's users): tvConfig → `stash-config-storage` → `getApolloClient` → `StashService`. The symptom is an `ApolloError … 404` and the `graphql-ws` disposal `afterAll` timing out. Import app values with `await import(...)` inside the test, after `bootApp()`; type-only imports are fine. Importing it creates an Apollo client immediately (`createClient()` at module scope). At the top of a test file that happens before the harness points `VITE_APP_PLATFORM_URL` at the mock server, so the client retries against port 9999 forever and can make the `graphql-ws` disposal `afterAll` time out. Import it dynamically inside the test after `bootApp()`, which also returns the app's own instance (see `background-updates.test.tsx`).

⚠️ **Stash's form labels don't point at their react-select inputs.** In forms like `SceneMarkerForm`, `<label for="primary_tag_id">` has no matching input id, so `getByLabelText` fails. Find the field's `.form-group` from its label and take the combobox inside it (see `markerFormSelect` in `create-marker-button.test.tsx`). `MarkerTitleSuggest` is also disabled until its suggestions load, so wait for it to be enabled before typing.

⚠️ **jsdom never fires `timeupdate`, and its playback position stays at 0.** Anything MediaSlide recomputes on `timeupdate` (e.g. the "currently playing marker" label) only changes in a test if you fire the event on the slide's `<video>` yourself.

⚠️ **Known jsdom limitations:** no pointer capture (Radix drag tests are skipped with reasons inline), no Gamepad API (stubbed in `setup.ts`), `HTMLMediaElement.play` stubbed. Document skipped tests inline.

⚠️ **jsdom media stubs in `setup.ts`:** `MediaError` is polyfilled (Stash's source selector reads its codes to decide whether to fall back to the next stream), and `canPlayType` claims MP4 and WebM like a browser. Without the latter, Video.js rejects every source, so every player falls back through all its streams on boot. HLS/DASH stay unsupported (no Media Source Extensions), so choosing them errors as it would in a browser without MSE. To test a stream failing, use `failCurrentSource(app)`.

## Test-only exceptions to app-code rules

- `useStore.setState` — forbidden in app code (bypasses typed setters and persistence routing), permitted **only** inside the shared test helpers in `test/unit/support/stores.ts` for resetting to a known state. Never scatter raw `setState` through individual tests.
- Apollo client mocks prevent real connection attempts in unit tests; integration tests use the real client against `mock-stash` instead. The unit/integration split is a Vitest "projects" config (`tv-ui/vitest.config.ts`): the mock lives in `tv-ui/test/setup-unit-apollo.ts` and is only in the unit project's `setupFiles` — putting it in the shared `test/setup.ts` breaks integration tests.

## Known gaps & deferred improvements

From the 2026-09 test-suite review, not yet fixed.

### Known coverage holes (from the v8 report)

- `useViewportRotate` (~42%) — a whole advertised feature, barely tested
- `useMediaItemTags` (~27%), `useSceneUpdate` (~32%), `useStashTvConfig` (~48%)
- Media-modifier hooks `openModifier` (~36%) and `shuffleModifier` (~25%) — integration coverage exists for the modifier *pipeline*, not these implementations
- `popper-modifiers/setMaxSize.ts` (~15%) and the other popper modifiers
- `MediaSlide` (~63%) and `Feed` error/empty-state paths

### Test-quality debt

- **`EditTagsContents` unit tests mock `EditTagSelectionForm`** — a real-form integration test would cover the prop forwarding for free and exercise the actual editing flow.

### App-code smells surfaced by the review (fix in app code, not tests)


- **Scan-complete cache reset doesn't exist in tv-ui.** `resetStore()` on `ScanComplete` lives on stash-ui's `createClient()` client, which the app doesn't use for its queries — a finished scan won't refresh the feed. The original integration test asserted this fiction and was deleted. If the behaviour is wanted, wire the subscription in tv-ui and restore the test (the mock-server request counting added during the review is still available).
