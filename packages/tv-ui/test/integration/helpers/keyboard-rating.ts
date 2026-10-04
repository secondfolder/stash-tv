import { afterEach, beforeEach, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, type BootedApp } from "./harness";
import { bootWithTvConfig, displayedSideInfo, pinActionButtons, sceneIdOf, slides, setChannel } from "./feed";

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
  let realSetTimeout: typeof setTimeout;
  beforeEach(() => {
    realSetTimeout = recordRatingWindows();
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
    // Stash's keybinds leave the digit keys bound for 1s after `r` and then unbind them on a timer. Mousetrap is a
    // single (externalised) module shared by every boot, so end that window now rather than let a stale timer unbind
    // keys belonging to the next test's app.
    endRatingWindows();
    globalThis.setTimeout = realSetTimeout;
  });
  return integration;
}

// The server store outlives each test, so restore every scene's rating afterwards
export let initialRatings: Map<string, number | null>;

/**
 * Stash's rating windows that are still open: the timers its keybinds start on each `r` to end the sequence 1s later
 * (`endSequence`), so that a test can end them straight away rather than wait for them in real time.
 */
const openRatingWindows = new Map<ReturnType<typeof setTimeout>, () => void>();

/** Record the rating windows Stash's keybinds open from now on, returning the `setTimeout` to restore afterwards */
function recordRatingWindows() {
  const realSetTimeout = globalThis.setTimeout;
  function recordingSetTimeout(handler: TimerHandler, timeout?: number, ...args: unknown[]) {
    if (typeof handler !== "function" || handler.name !== "endSequence") {
      return realSetTimeout(handler, timeout, ...args);
    }
    const end = () => {
      openRatingWindows.delete(timer);
      handler(...args);
    };
    const timer = realSetTimeout(end, timeout);
    openRatingWindows.set(timer, end);
    return timer;
  }
  // Node's `setTimeout` type has extras (e.g. `__promisify__`) that Stash's keybinds never use
  globalThis.setTimeout = recordingSetTimeout as typeof setTimeout;
  return realSetTimeout;
}

/**
 * End every open rating window now, as Stash does once its 1s runs out, rather than waiting for it in real time.
 * Returns how many were open.
 */
export function endRatingWindows() {
  const open = [...openRatingWindows];
  for (const [timer, end] of open) {
    clearTimeout(timer);
    end();
  }
  return open.length;
}

/**
 * Freezes `setTimeout` so a test decides exactly when Stash's 1s rating window runs out, rather than racing
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

export async function bootMarkersFeed() {
  // Fixture filter "3" is "All Markers", sorted by scene
  return await bootWithTvConfig((tvConfig) => setChannel(tvConfig, "3"), "Intro");
}
