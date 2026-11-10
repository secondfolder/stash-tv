# E2E Tests

**Read this when:** writing or changing tv-ui's end-to-end tests (Playwright, in Chromium), or anything about how they're run. The tiers, standards and where files go are in [testing](testing.md).

E2E tests are for what the other tiers can't see: anything that depends on layout, CSS, real playback or real input (see the gotchas below on when a test needs to be E2E).

## Running E2E tests

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
- ⚠️ Both are addressed as `127.0.0.1`, not `localhost`, and the dev server is
  told to listen there (`DEV_HOST`). From Node (the tests' `request`
  fixture), every request to the dev server at `localhost` took ~300ms to
  connect, against ~4ms at `127.0.0.1`: a few such requests per test to set
  up config, and 60 in some, added ~9 minutes to the suite.

If either port is taken, the config prints a one-line note and uses the next
free port (`test/e2e/helpers/ports.ts`). Servers are never reused: a stale or
real-Stash-backed server on the default port can't leak into a run. The chosen
ports are cached in `E2E_MOCK_STASH_PORT` / `E2E_DEV_SERVER_PORT` because
Playwright re-evaluates its config in every worker. Run standalone,
`test:e2e-server` does the same fallback itself.

E2E tests run in parallel, 4 workers by default (`E2E_WORKERS=<n>` to change
it), each test file's tests spread across them (`fullyParallel`). They share
one mock-stash and one dev server, but each worker has mock-stash state of its
own: a *tenant*, named in a `mock-stash-tenant` cookie on the page's requests
and an `x-mock-stash-tenant` header on the `request` fixture's
(`test/e2e/helpers/test.ts`; mock-stash makes each tenant a store from fresh
fixtures the first time it's seen, see `packages/mock-stash/src/tenant.ts`).
So a test can change the server as it likes without another worker seeing it,
but tests in the same worker do, one after another: still undo what you change
in `afterEach`. ⚠️ The page names its tenant in a cookie, not a header: the
app's media comes straight from mock-stash, a different origin from the page,
and a custom header on those requests needs CORS, which stopped every video
playing. A cookie isn't tied to a port, so it reaches both servers.

E2E tests set up server-side state through `test/e2e/helpers/stash.ts`: `graphql(request, query, variables)` runs an operation against mock-stash, `setTvConfig(request, state)` replaces the persisted tvConfig with the given settings, and `setActionButtons(request, config)` replaces just the action button stack (`null` restores the defaults for either; call it in `afterEach`). `createTags(request, names)` / `destroyTags(request, ids)` add and remove tags, each in one request. `expectUsableOnScreen(locator)` (`test/e2e/helpers/layout.ts`) checks an element is on screen with nothing covering it. ⚠️ It hit-tests the element's corners, which aren't part of an element with rounded corners (e.g. a pill): check something inside it instead.

Every e2e test imports `test` and `expect` from `test/e2e/helpers/test.ts` rather than `@playwright/test`, for the fixtures every test needs (e.g. coverage, below). Things on the page are found with `test/e2e/helpers/feed.ts`: `currentSlide` / `slideAt` / `currentIndex`, `infoPanel(page)`, and `box(locator)` (its bounding box, failing if it isn't rendered).

Tests of playback and gestures use `test/e2e/helpers/gestures.ts`:
- `bootFeed(page, request, config)` sets tvConfig, loads the feed and waits for the first video to play. It starts videos from the beginning (see the gotcha below)
- `videoState(slide)` / `seekCurrentVideo` / `changeSlideWithKeyboard`: the current slide's video and moving about the feed
- `mousePointer(page)` / `touchPointer(page)`: one interface for both. A finger needs the context's `hasTouch`, and is driven with CDP touch events since Playwright's touchscreen can only tap. `areaPoint(page, area)` gives a point in a third of the current video, checking nothing covers it. `speedDrag(pointer, start, width)` drags a hold to a given speed change
- `expectFeedback(page, text, icon)` / `expectFeedbackGone(page)` / `feedbackShownDuring(page, action)`: the feedback overlay. A recorder logs every change to it from page load, so a test can tell if it ever flashed up, not just what it shows when checked. `expectFeedbackGone` also checks it stays gone (it once got stuck after gestures)
- `E2E_LOG_GESTURES=1` prints the app's gesture and seeking logs and where each video was played or paused from, to see what a failing test did
- `E2E_COVERAGE_DIR=<dir>` (any e2e test, through `helpers/test.ts`) writes each test's raw V8 coverage of the app's source there as JSON. Vitest's `ast-v8-to-istanbul` turns it into an istanbul report, using Vite's inline source maps to map it back to the source

⚠️ Don't background the servers from a shell script (`server & sleep && …`).
Nothing kills them when the script exits, and killing the `vitest` parent
leaves its worker (the one holding the port) running. Playwright avoids this by
killing the whole process group. ⚠️ The dev server's proxy settings come from
`packages/tv-ui/.env` *and* the command's env vars (command wins).

## Gotchas

⚠️ **Anything that depends on layout needs an e2e test.** jsdom has no layout, so positioning bugs (e.g. a dropdown menu inside an action button's side panel opening off screen or behind the panel's backdrop) pass every unit and integration test. In Playwright, `toBeVisible()` doesn't catch them either: an element off screen or covered by something else still counts as visible. Check `toBeInViewport()` and hit-test with `document.elementFromPoint` (see `expectUsableOnScreen` in `test/e2e/helpers/layout.ts`).

⚠️ **jsdom tests don't load stylesheets**, so anything CSS decides, such as which elements are hidden, also needs an e2e test (e.g. the folder preview's 4-icon limit in `test/e2e/action-button-stack.test.ts`).

⚠️ **Don't hard-code a window width a test's set up depends on.** Some scene info panel e2e tests need things to wrap a particular way (e.g. a row of unused fields with no room for another), which moves whenever the pills' contents or the panel's padding change, so a width that worked stops working. They step the window's width until what they need holds (`resizeUntil` in `test/e2e/scene-info-panel.test.ts`), checked in the page, and fail saying so if no width does.

⚠️ **Action buttons have no `data-testid`.** The per-type button components don't thread unknown props to the DOM, so e2e asserts on the `ActionButton` root class (the component's contract). If buttons ever gain a testid, prefer it (see "Known gaps").

⚠️ **A field's controls in the info panel editor take the pointer only while shown.** Its ×, + and options buttons show when the field's hovered over (or tapped), and until then the field underneath gets the pointer. Playwright checks what's under the pointer before moving the mouse there, so `button.click()` never hovers and waits until the test times out: hover over the field first (`clickFieldControl()` in `test/e2e/scene-info-panel.test.ts`), as a mouse user does.

⚠️ **Wait for an e2e animation to finish with `stoppedMoving(container)`, not a fixed time** (`test/e2e/helpers/layout.ts`). It waits until nothing in the container has moved, resized or faded for 10 frames in a row. A fixed wait is longer than needed when the machine's quiet, and too short when it's busy: several info panel tests failed once the suite ran in parallel. Watch the element that's actually animating: react-select's menu isn't in the panel it opens from, so waiting on the panel didn't wait for the menu's scroll. A fixed wait is still right for checking something *doesn't* happen for a while (e.g. that feedback stays hidden during a hold).

⚠️ **Don't count an e2e animation's frames to check it played.** A busy machine draws far fewer of them: a CI runner, with two browsers playing video, drew 7–10 frames of the info panel's 450ms morph, failing a test expecting over 10. Check something that doesn't depend on the frame rate instead: how long it was sampled for (`expectSampledMorph` in `test/e2e/scene-info-panel.test.ts`), or, for an animation too short for that, that any frame caught it part way (`isPartWay` in `test/e2e/action-button-stack.test.ts`; the folder's icons animate for only 100ms, and a busy machine drew 3 frames of it). To reproduce a slow machine locally, throttle the CPU through CDP: `(await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 6 })` (the folder icons' short animation needed a rate of 20).

⚠️ **Don't `expect.poll` for a state that lasts only a moment.** Its checks get a second apart, so it can step right over one. A looping marker's time is back below where it was for only about 0.4s after it loops, and a test polling for that missed it. Record it in the page every frame instead and poll the record (`watchForLoop` in `test/e2e/gesture-controls-markers.test.ts`).

⚠️ **Retry a check whose set-up can be undone by a re-render, with a short timeout inside `toPass`.** Checking every option of an open dropdown (`expectAllOptionsUsable` in `create-marker-button.test.ts`) scrolls the menu to each option and then hit-tests it. With the suite in parallel, a check now and then found the option just out of view, and stayed failing until scrolled to again. So each option is scrolled to and checked inside `expect(…).toPass()`. ⚠️ Give the check inside a shorter timeout than `toPass` (`expectUsableOnScreen(option, { timeout: 1_000 })`): its `toBeInViewport` waits the default 5s, which used up `toPass`'s whole budget, so it never actually retried. Find each option by its text within the open menu, not by its index on the page: the form's other selects have menus of their own.

⚠️ **Dropdown e2e tests need realistic data and timing.** The mock has only 5 tags, so a tag menu is much shorter than on a real library, and Stash's tag selects load their options asynchronously, so a menu opened straight away is just "Loading...". Bugs that depend on menu size, like react-select scrolling the page to reveal a menu, only show up with enough options and once they've loaded: create extra tags with `createTags` (and `destroyTags` them afterwards), and wait for the field's `.react-select__loading-indicator` to go before clicking (see the very-short-window test in `create-marker-button.test.ts`).

⚠️ **E2E tests leave scenes' play positions in mock-stash.** The app saves a scene's resume time as it plays, and each worker's mock-stash state outlives each test, so a later test's video starts where an earlier one left it. That broke looping tests, as a looping video's loop starts there, and info panel tests, whose video ended and moved the feed on to another scene. `setTvConfig` sets `startPosition: 'beginning'` unless told otherwise; set it too if you load the feed without it.

⚠️ **use-gesture ignores the first 3px of a drag** (its threshold for telling a drag from a tap), in the direction the drag first went, for the rest of the drag. `speedDrag` allows for it. Without that, drags landed just short of the speed aimed for. A drag can also pass through other speeds on the way, which matters at the end of a looping video, where any speed that plays it loops it round: pass `{ steps: 1 }` to jump straight there.

⚠️ **E2E tests that need non-default config set it through the API.** tvConfig lives in Stash's plugin config, so send a `configurePlugin` mutation to `/graphql` (proxied to mock-stash) before `page.goto`, and reset it to `{}` afterwards: the worker's later tests share its mock-stash state. Include `showGuideOverlay: false`, or the first-run guide overlay covers the page and swallows every click.

⚠️ **The iOS on-screen keyboard can only be reproduced in the iOS Simulator, with a person tapping.** Playwright's WebKit has no on-screen keyboard. What works:
- In the Simulator app, untick I/O ▸ Keyboard ▸ Connect Hardware Keyboard, or the on-screen keyboard never appears.
- Run the dev server (the simulator shares the Mac's network, so `localhost` works) and open the app in the simulator's Safari with `xcrun simctl openurl booted <url>`.
- Have someone tap through the steps, with a temporary dev-only script in the app that POSTs measurements (`visualViewport` size/offset, `scrollY`, focus, element rects) on each change to a small local HTTP server. Remove the script afterwards.
- `safaridriver` (with `safari:useSimulator`) can load pages and run scripts in the simulator, but not reproduce this: its taps arrive as a long press with no `touchend` or `click`, a focus it causes doesn't bring up the keyboard, and a person interacting by hand ends its session.

## Known gaps & deferred improvements

- **E2E is still mostly smoke-level outside playback**: gestures, keyboard seeking and moving between slides are covered, as are the create-marker side panel's dropdowns, but nothing yet covers opening settings.
