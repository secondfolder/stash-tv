# Rewrite `useGestureControls` (and split seeking out of MediaSlide)

## Context

`MediaSlide/index.tsx` is ~1,580 lines, ~600 of them `useGestureControls()` plus ~100 of arrow-key seeking that drives it. The tests for this are in place (commit `b810f984`: 95 Playwright tests across `test/e2e/gesture-controls*.test.ts`, `keyboard-seeking.test.ts`, `feed.test.ts`), and the browser coverage review showed the hook carries a lot of dead or defensive code:
- the `TouchEvent` branch (only pointer events arrive)
- speed-0 branches in playback-rate mode (0 always goes to skip mode)
- the `desiredTimeDelta` accumulation (always reset to 0, so it never accumulates)
- the pause blocker's re-pause arm
- the pointerout target check
- the "Not setup correctly" / "already cleaned up" guards
- the `setupThumbnailUpdate` guard

It also calls `useRef` conditionally, which breaks the rules of hooks. The goal: the same behaviour (plus one agreed change) in three small, readable units, with MediaSlide much smaller.

Decided with the user:
- Arrow-key seeking moves out of MediaSlide too.
- A drag made before a hold registers now counts: the hold starts at the speed for where the pointer already is.

## Design

Three units, one direction of dependency: input hooks → seek engine → pure helpers.

### 1. Pure helpers: `src/helpers/seek-speed.ts`
- `toDiscreteSeekSpeed(speed)`: moved as-is (`{discrete, faster, slower}`).
- `holdSpeed(area, offsetX, width, duration)`: the area's base speed (-1.5 / 0 / 1.5) plus `((offsetX/width)*10)**6`, signed, clamped to ±duration/3 (from `handleDrag`).
- `gestureArea(x, width)`: `'left' | 'middle' | 'right'` (from `getClickArea`, PointerEvent only).
- `seekFeedback(discreteSpeed)`: `{ text, icon: 'play' | 'forward' | 'backward' | 'pause' }`. Text is `"1.5x"`, `"1m 30s"`, `"5s"`, or `""` for 0 (from `seek()`). Callers map the icon name to the FontAwesome icon. FontAwesome stays, as the tests read `data-icon`.
- `isPlayedSpeed(discrete)`: `0.1 <= discrete < 5`. Below 0.1 or from 5 up, the video is paused and its time skipped.
- `showsThumbnail(discrete)`: `> 5 || < -2`.
- New unit tests: `test/unit/helpers/seek-speed.test.ts` (every speed band and its faster/slower caps, formatting, clamping, areas).

### 2. Seek engine: `src/hooks/useSeeking.tsx`
`useSeeking({ isCurrentVideo, playerRef, looping, initialTimestamp, endTimestamp, logger })` returns `{ seek(speed | null), isSeeking() }`. One `sessionRef` holds `{ speed, initialPaused, initialRate, skipTimer?, showingThumbnail }`.
- `seek(speed)`: discretise, and return early if unchanged. On the first call, record the initial paused state and rate and set `scrubbing(true)`.
  - Played speeds: stop any skip timer, then set the rate and play.
  - Skipped speeds: set rate 1, pause, then start one `setInterval(100ms)` if none is running.
  - Then show the speed feedback (unless looping and already at the loop edge), and turn thumbnails on or off.
- Skip tick: `next = currentTime + speed * 0.1`. If looping and `next` passes the loop start or end (`getLoopEnd()` = end timestamp or duration), clamp there (end: `min(loopEnd, duration - 0.1)`) and show "Start/End of loop reached". If not looping and `next ≥ duration`, `trigger('ended')`. Otherwise set `currentTime(next)`.
- `seek(null)` / `end({ paused })`: clear the timer and thumbnails, restore the rate, `scrubbing(false)`, remove the feedback with `fade: false`, and set paused to `paused ?? initialPaused`. It does nothing if there's no session (no warning).
- Effect on `!isCurrentVideo`: `end({ paused: true })`.
- Thumbnails: a single `showThumbnail` handler on/off for `timeupdate`/`seeking`/`progress`/`durationchange`, using the plugin's private methods (the stub covers markers and previews).
- Play/pause through the **Video.js player** (`player.play()/pause()`) instead of the `<video>` element plus pause blocker plus `handleTechPlay_/Pause_`. That also goes through the pause-loading middleware. **Check:** take Playwright screenshots mid-rewind and mid-hold-middle before and after. If the big play button or poster now flashes during a hold, keep the element calls but drop the dead blocker arm.
  - *Deviation (2026-10-03, Claude): the check failed. Through the player, Video.js showed its big play button for as long as a hold paused the video, so seeking keeps playing/pausing the `<video>` element with its `pause` events hidden from Video.js, minus the dead re-pause arm.*

### 3. Pointer input: `src/hooks/useGestureControls.tsx`
`useGestureControls({ isCurrentVideo, videoRef, playerRef, seeking, seekForwards, seekBackwards, logger })` returns `{ gestureTargetElement }` (the iOS div, or null).
- One `pressRef`: `{ area, width, offsetX, held }`. `onPointerDown` records the area and starts the 250ms hold timer. `onDrag` always updates `offsetX`, and while `held` calls `seeking.seek(holdSpeed(...))`. When the timer fires it sets `held` and seeks from the current `offsetX` (the agreed change). `onPointerUp` before the timer counts as a tap (left → `seekBackwards`, middle → toggle play, right → `seekForwards`). The drag's `last` ends the press (`seek(null)` if held).
- Clear the press on scroll (as now, but dropping the whole press so nothing is left stale) and when `!isCurrentVideo`.
- Always create the ref; render the iOS div only on iOS (fixes the conditional `useRef`).
- Keep the `click.detail` workaround (use-gesture#593) and the use-gesture options. Drop `onPointerOut`: with pointer capture it only fires after release.

### 4. Arrow keys: `src/hooks/useKeyboardSeeking.ts`
Move MediaSlide's keydown/keyup effect (lines ~466–567) as-is in behaviour: the 300ms hold, repeat +1, ↑/↓ via `toDiscreteSeekSpeed`, Space play/pause, forced-landscape key mapping, ignoring inputs, textareas and sliders. Args: `{ isCurrentVideo, forceLandscape, playerRef, seeking, seekForwards, seekBackwards }`. Replace the `clearInterval` on timeouts with `clearTimeout`.

### 5. MediaSlide
- Call `useSeeking`, `useGestureControls` and `useKeyboardSeeking`. `handleVideojsPlayerCreated`'s ratechange check uses `seeking.isSeeking()`.
- Remove `seek(null)` from `goToItem`: the not-current effect ends a seek now.
- Keep `seek(null)` in the marker loop's `ended` handler, and check it with the marker tests below.
- Drop the `console.log("Seek called…")` (it goes with `seek()`'s rewrite).

## Tests to add first (before refactoring)
- **Markers** (`gesture-controls-markers.test.ts`, booting the "All Markers" saved filter, id 3):
  - holding the right plays at 1.5x and releases cleanly
  - a hold through a looping marker's end keeps going
  - fast keyboard rewind shows no thumbnail and clears on release

  Markers use the offset plugin, have no end timestamp, and have their own loop `ended` handler, none of which the current tests cover.
- **The agreed change**: press, drag right within 250ms, keep still → the hold starts at the dragged speed (e.g. "3x"). This fails before the change, as expected.

## Docs
- `docs/video-player.md` § "Gestures":
  - name the three hooks and the helpers file
  - replace "A drag that starts before the hold registers is ignored…" with the new behaviour
  - note play/pause goes through the player
- `docs/keyboard-shortcuts.md` § "Where shortcuts live": seeking and Space live in `useKeyboardSeeking()`.
- `AGENTS.md` Notable Features "Gestures" bullet: the new hook locations. Key Hooks: add `useSeeking()`.
- Save this plan as `docs/historical-plans/2026-10-03-gesture-controls-rewrite.md`.

## Verification
1. Before refactoring: the new marker and early-drag tests (the early-drag one fails as expected).
2. After each unit lands:
   ```
   yarn --cwd packages/tv-ui playwright test test/e2e/gesture-controls*.test.ts test/e2e/keyboard-seeking.test.ts test/e2e/feed.test.ts
   ```
   All must pass. Run any test that changed twice to catch flakiness.
3. `yarn typecheck`, `yarn test` (including the new unit tests and the docs validation).
4. Coverage: rerun with `E2E_COVERAGE_DIR` and convert with the scratchpad scripts (`e2e-coverage-report.mjs`, `uncovered.mjs`) over the new hook files. Expect near-total coverage, with anything left explained (e.g. defensive player-missing guards).
5. Screenshot check of the big play button during holds (see §2).
6. Full `yarn test:e2e`: only the 6 `scene-info-panel` failures already on `main` are allowed.
7. MediaSlide line count drops by roughly 700.
