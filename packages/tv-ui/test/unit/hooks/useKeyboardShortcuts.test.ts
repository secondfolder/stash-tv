/**
 * Matching key presses against the user's shortcuts: single keys and sequences of them, typed one after another.
 *
 * @see docs/keyboard-shortcuts.md § "Matching"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { matchShortcut, shortcutDigits, trackHeldKeys } from "../../../src/hooks/useKeyboardShortcuts";
import type { ShortcutActionId } from "../../../src/helpers/keyboard-shortcuts/definitions";
import { useGlobalState } from "../../../src/store/globalState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { resetStores } from "../helpers/stores";

/** Press a key, giving which of the actions it's for */
function press(key: string, actionIds: ShortcutActionId[], init: KeyboardEventInit = {}) {
  return matchShortcut(new KeyboardEvent("keydown", { key, ...init }), actionIds);
}

beforeEach(() => {
  resetStores();
  // A key no shortcut has forgets any sequence an earlier test left part way through
  press("F24", []);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("matching shortcuts", () => {
  it("matches a sequence once its last key is pressed, and not before", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g m"] });

    expect(press("g", ["toggle-mute"])).toBeNull();
    expect(press("m", ["toggle-mute"])).toBe("toggle-mute");
  });

  it("starts afresh with a key that doesn't carry on the sequence typed", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g m"] });

    press("g", ["toggle-mute"]);

    expect(press("l", ["toggle-looping"])).toBe("toggle-looping");
    expect(press("m", ["toggle-mute"])).toBeNull();
  });

  it("forgets a sequence whose next key doesn't come within a second", () => {
    vi.useFakeTimers();
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g m"] });

    press("g", ["toggle-mute"]);
    vi.advanceTimersByTime(1001);

    expect(press("m", ["toggle-mute"])).toBeNull();
  });

  it("gives each key of a sequence a second of its own", () => {
    vi.useFakeTimers();
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g x m"] });

    press("g", ["toggle-mute"]);
    vi.advanceTimersByTime(900);
    press("x", ["toggle-mute"]);
    vi.advanceTimersByTime(900);

    expect(press("m", ["toggle-mute"])).toBe("toggle-mute");
  });

  it("keeps matching the last key of a sequence while it's held down", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "seek-forwards": ["g l"] });

    press("g", ["seek-forwards"]);
    expect(press("l", ["seek-forwards"])).toBe("seek-forwards");

    expect(press("l", ["seek-forwards"], { repeat: true })).toBe("seek-forwards");
    expect(press("l", ["seek-forwards"], { repeat: true })).toBe("seek-forwards");
  });

  it("turns arrow keys with the screen in forced landscape at every step", () => {
    // ← alone would seek backwards first
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["ArrowLeft ArrowDown"], "seek-backwards": [] });
    useTvConfig.getState().set("forceLandscape", true);

    // → and ↓ in landscape are ↓ and ← in portrait
    press("ArrowDown", ["toggle-mute"]);

    expect(press("ArrowRight", ["toggle-mute"])).toBe("toggle-mute");
  });

  it("gives every listener asking about a key press the same answer", () => {
    const event = new KeyboardEvent("keydown", { key: "m" });

    expect(matchShortcut(event, ["toggle-mute"])).toBe("toggle-mute");
    expect(matchShortcut(event, ["toggle-mute"])).toBe("toggle-mute");
  });

  describe("with keys held down", () => {
    let stopTracking: () => void;
    beforeEach(() => {
      stopTracking = trackHeldKeys();
    });
    afterEach(() => stopTracking());

    const hold = (key: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    const release = (key: string) => window.dispatchEvent(new KeyboardEvent("keyup", { key }));

    it("matches a key pressed while holding another as a chord with it, rather than the key alone", () => {
      hold("ArrowLeft");
      expect(press("ArrowUp", ["seek-faster", "previous"])).toBe("seek-faster");
      release("ArrowLeft");

      expect(press("ArrowUp", ["seek-faster", "previous"])).toBe("previous");
    });

    it("matches the key alone when no shortcut has the chord, as when typing quickly", () => {
      useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g m"] });

      press("g", ["toggle-mute"]);
      // m goes down before g comes up
      hold("g");

      expect(press("m", ["toggle-mute"])).toBe("toggle-mute");
    });

    it("forgets the keys held when the page loses focus, as their release never comes", () => {
      hold("ArrowLeft");
      window.dispatchEvent(new Event("blur"));

      expect(press("ArrowUp", ["seek-faster", "previous"])).toBe("previous");
    });
  });

  // @see docs/keyboard-shortcuts.md § "Changing shortcuts"
  it("matches nothing while a shortcut's key is being recorded", () => {
    useGlobalState.getState().set("recordingShortcut", true);

    expect(press("m", ["toggle-mute"])).toBeNull();
  });
});

// @see docs/keyboard-shortcuts.md § "Rating shortcuts"
describe("matching the rating shortcut", () => {
  function rate(keys: string[]) {
    let event = new KeyboardEvent("keydown");
    for (const key of keys) {
      event = new KeyboardEvent("keydown", { key });
      matchShortcut(event, ["rate"]);
    }
    return { action: matchShortcut(event, ["rate"]), digits: shortcutDigits(event) };
  }

  it("gives the star typed after the rating key", () => {
    expect(rate(["r", "4"])).toEqual({ action: "rate", digits: ["4"] });
  });

  it("gives both digits typed after the rating key for decimal ratings", () => {
    useGlobalState.getState().set("ratingSystem", RatingSystemType.Decimal);

    expect(rate(["r", "3"]).action).toBeNull();
    expect(rate(["6"])).toEqual({ action: "rate", digits: ["3", "6"] });
  });

  it("follows the rating key the user has given it, which may be a sequence", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "rate": ["g r"] });

    expect(rate(["g", "r", "5"])).toEqual({ action: "rate", digits: ["5"] });
  });
});
