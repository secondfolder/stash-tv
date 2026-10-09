import { afterEach, beforeEach, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, type BootedApp } from "./harness";
import { displayedSideInfo, pinActionButtons, sceneIdOf, slides } from "./feed";

/**
 * Helpers for the keyboard rating shortcut tests, which are split across files so they run in parallel. Each test's
 * ratings on the server are undone after it.
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a test file for these tests against the mock server (call it at the top of the file) */
export function setupKeyboardRatingTest() {
  integration = setupIntegrationTest();
  let realTimers: ReturnType<typeof holdRatingWindows>;
  beforeEach(() => {
    realTimers = holdRatingWindows();
    initialRatings = new Map(
      [...integration.server.store.scenes.values()].map((scene) => [scene.id, scene.rating100])
    );
  });
  afterEach(async () => {
    // Before anything below waits on a timer
    vi.useRealTimers();
    for (const [id, rating] of initialRatings) {
      const scene = integration.server.store.scenes.get(id);
      if (scene) scene.rating100 = rating;
    }
    // The sequence typed so far is module state that can outlive a boot, so end any window this test's app left open,
    // rather than leave it to end a sequence belonging to the next test's app.
    endRatingWindows();
    globalThis.setTimeout = realTimers.setTimeout;
    globalThis.clearTimeout = realTimers.clearTimeout;
  });
  return integration;
}

// The server store outlives each test, so restore every scene's rating afterwards
export let initialRatings: Map<string, number | null>;

/**
 * The open rating windows: after a key starting a shortcut's sequence, such as `r`, the next key must come before a
 * 1s timer forgets the sequence (`endSequence`). In these tests a window stays open until the test ends it (`endRatingWindows()`), or
 * teardown does, rather than running out in real time: on a busy machine the digits typed after `r` could otherwise
 * arrive after it had, and a test spent a second waiting for one to close. Tests of a window running out freeze the
 * clock instead (`freezeClock()`), whose fake timers stand in for these while it's frozen.
 */
const openRatingWindows = new Map<object, () => void>();

/** Hold rating windows open from now on, returning the timer functions to restore afterwards */
function holdRatingWindows() {
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  function holdingSetTimeout(handler: TimerHandler, timeout?: number, ...args: unknown[]) {
    if (typeof handler !== "function" || handler.name !== "endSequence") {
      return real.setTimeout(handler, timeout, ...args);
    }
    const ratingWindow = {};
    openRatingWindows.set(ratingWindow, () => handler(...args));
    return ratingWindow;
  }
  // The open window's timer is cleared when the next key comes, or the sequence completes
  function holdingClearTimeout(timer: Parameters<typeof clearTimeout>[0]) {
    if (typeof timer === "object" && timer !== null && openRatingWindows.delete(timer)) return;
    real.clearTimeout(timer);
  }
  // Node's timer types have extras (e.g. `__promisify__`) that the keybinds never use
  globalThis.setTimeout = holdingSetTimeout as typeof setTimeout;
  globalThis.clearTimeout = holdingClearTimeout as typeof clearTimeout;
  return real;
}

/** End every open rating window now, as happens once its 1s runs out. Returns how many were open. */
export function endRatingWindows() {
  const open = [...openRatingWindows.values()];
  openRatingWindows.clear();
  for (const end of open) end();
  return open.length;
}

/**
 * Freezes `setTimeout` so a test decides exactly when the 1s rating window runs out, rather than racing
 * wall-clock time: under a loaded test run the server round trip alone can outlast the window. Returns a userEvent
 * instance that advances the frozen clock as it types (the default one waits on a real `setTimeout` between keys,
 * which would never fire). Call `vi.useRealTimers()` once the sequences are typed.
 *
 * ⚠️ While frozen, RTL's `waitFor` still polls (on `setInterval`, which isn't faked) but its timeout never fires, so
 * a wait that never succeeds shows up as the 20s test timeout. Don't reach for `vi.waitFor` instead: it advances the
 * frozen clock on every check, so real time spent waiting would eat into the window again.
 */
export function freezeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

/** Every rating the app has sent the server for the given scene, in order. */
export function ratingsSent(sceneId: string) {
  return integration.server
    .getRequests()
    .filter((request) => request.operationName === "SceneUpdate")
    .map((request) => request.variables.input)
    .filter((input): input is { id: string; rating100: number | null } =>
      typeof input === "object" && input !== null && "id" in input && input.id === sceneId)
    .map((input) => input.rating100);
}

export function serverRating(sceneId: string) {
  return integration.server.store.scenes.get(sceneId)?.rating100;
}

/** Scene ids of every rendered slide other than the current one, which must not change rating. */
export function otherRenderedSceneIds(app: BootedApp, currentSceneId: string) {
  const others = [...new Set(slides(app).map(sceneIdOf))].filter((id) => id !== currentSceneId);
  // The test is only meaningful when other slides (and other scenes) are mounted alongside the current one
  expect(others.length).toBeGreaterThan(0);
  return others;
}

export async function bootWithRateButtonPinned() {
  const app = await bootApp();
  await pinActionButtons(["rate-scene"]);
  return app;
}

/** The rating the current slide's rate button displays, or null when it shows none. */
export function displayedRating(app: BootedApp) {
  return displayedSideInfo(app, "rate-scene");
}
