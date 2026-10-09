/**
 * Turning key presses into shortcut combos and sequences, the bindings worked out from the user's changes, and which
 * bindings clash.
 *
 * @see docs/keyboard-shortcuts.md § "Key sequences"
 * @see docs/keyboard-shortcuts.md § "The registry"
 */

import { describe, expect, it } from "vitest";
import { comboFromEvent, formatKeyCombo, keyOfCombo, withoutHeldKeys } from "../../../src/helpers/keyboard-shortcuts/key-combos";
import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import {
  findClashingBindings,
  resolveShortcutBindings,
  withActionBindings,
} from "../../../src/helpers/keyboard-shortcuts/definitions";
import { formatKeySequence, lastKeyOfSequence } from "../../../src/helpers/keyboard-shortcuts/key-sequences";

const press = (key: string, modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey" | "shiftKey">> = {}) =>
  ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...modifiers });

describe("comboFromEvent", () => {
  it("writes a letter in lower case, with Shift when it's held", () => {
    expect(comboFromEvent(press("d"))).toBe("d");
    expect(comboFromEvent(press("D", { shiftKey: true }))).toBe("Shift+d");
  });

  it("leaves Shift out of a character that already shows it was held", () => {
    expect(comboFromEvent(press("?", { shiftKey: true }))).toBe("?");
  });

  it("writes Shift for a named key", () => {
    expect(comboFromEvent(press("ArrowUp", { shiftKey: true }))).toBe("Shift+ArrowUp");
  });

  it("writes modifiers in a fixed order", () => {
    expect(comboFromEvent(press("k", { shiftKey: true, metaKey: true, altKey: true, ctrlKey: true }))).toBe("Ctrl+Alt+Meta+Shift+k");
  });

  it("calls the space bar Space", () => {
    expect(comboFromEvent(press(" "))).toBe("Space");
  });

  it("gives no combo for a modifier pressed on its own", () => {
    expect(comboFromEvent(press("Shift", { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(press("Control", { ctrlKey: true }))).toBeNull();
  });

  // @see docs/keyboard-shortcuts.md § "Matching"
  it("turns arrow keys pressed in forced landscape back into their portrait direction", () => {
    expect(comboFromEvent(press("ArrowRight"), { forceLandscape: true })).toBe("ArrowDown");
    expect(comboFromEvent(press("ArrowLeft"), { forceLandscape: true })).toBe("ArrowUp");
    expect(comboFromEvent(press("ArrowUp"), { forceLandscape: true })).toBe("ArrowRight");
    expect(comboFromEvent(press("ArrowDown"), { forceLandscape: true })).toBe("ArrowLeft");
    expect(comboFromEvent(press("d"), { forceLandscape: true })).toBe("d");
  });
});

// @see docs/keyboard-shortcuts.md § "Key combos"
describe("chords", () => {
  it("writes the other keys held down before the key pressed, in order, leaving out modifiers and the key itself", () => {
    expect(comboFromEvent(press("ArrowUp"), { heldKeys: ["ArrowRight", "ArrowUp", "Shift", "g"] }))
      .toBe("ArrowRight+g+ArrowUp");
    expect(comboFromEvent(press("D", { shiftKey: true }), { heldKeys: ["g"] })).toBe("Shift+g+d");
  });

  it("turns held arrow keys with the screen in forced landscape too", () => {
    expect(comboFromEvent(press("ArrowLeft"), { forceLandscape: true, heldKeys: ["ArrowUp"] })).toBe("ArrowRight+ArrowUp");
  });

  it("shows a chord's keys joined with +, and can leave its held keys out", () => {
    expect(formatKeyCombo("ArrowLeft+ArrowUp")).toBe("← + ↑");
    expect(withoutHeldKeys("Shift+g+d")).toBe("Shift+d");
    expect(keyOfCombo("Shift+g+d")).toBe("d");
  });
});

describe("keyOfCombo", () => {
  it("gives the + key of a combo with modifiers", () => {
    expect(keyOfCombo("Ctrl++")).toBe("+");
    expect(keyOfCombo("+")).toBe("+");
  });
});

describe("formatKeyCombo", () => {
  it("shows arrows as arrows and letters in lower case", () => {
    expect(formatKeyCombo("ArrowLeft")).toBe("←");
    expect(formatKeyCombo("Shift+d")).toBe("Shift + d");
  });
});

describe("key sequences", () => {
  it("shows each combo of a sequence, separated by spaces", () => {
    expect(formatKeySequence("Shift+g ArrowDown")).toBe("Shift + g ↓");
  });

  it("gives the key held down at the end of a sequence", () => {
    expect(lastKeyOfSequence("g Shift+l")).toBe("l");
  });
});

describe("shortcut bindings", () => {
  it("uses an action's defaults until the user changes it", () => {
    const bindings = resolveShortcutBindings({ "toggle-mute": ["Shift+m"] }, RatingSystemType.Stars);

    expect(bindings["toggle-mute"]).toEqual(["Shift+m"]);
    expect(bindings["toggle-looping"]).toEqual(["l"]);
  });

  // @see docs/keyboard-shortcuts.md § "Rating shortcuts"
  it("unsets the rating with r 0 for stars, but r ` for decimal, where r 0 starts a rating", () => {
    expect(resolveShortcutBindings({}, RatingSystemType.Stars)["unset-rating"]).toEqual(["r 0"]);
    expect(resolveShortcutBindings({}, RatingSystemType.Decimal)["unset-rating"]).toEqual(["r `"]);
  });

  it("forgets an action's change once it's given its defaults again", () => {
    const changed = withActionBindings({}, "toggle-mute", ["Shift+m"], RatingSystemType.Stars);

    expect(withActionBindings(changed, "toggle-mute", ["m"], RatingSystemType.Stars)).toEqual({});
  });

  it("keeps an action with no keys as a change, turning it off", () => {
    const overrides = withActionBindings({}, "delete", [], RatingSystemType.Stars);

    expect(resolveShortcutBindings(overrides, RatingSystemType.Stars)["delete"]).toEqual([]);
  });
});

// @see docs/keyboard-shortcuts.md § "Matching"
describe("clashing bindings", () => {
  const clashes = (
    overrides: Parameters<typeof resolveShortcutBindings>[0],
    actionId: Parameters<typeof findClashingBindings>[2],
    sequence: string,
    ratingSystem = RatingSystemType.Stars,
  ) => findClashingBindings(resolveShortcutBindings(overrides, ratingSystem), ratingSystem, actionId, sequence)
    .map(({ actionId, sequence, clash }) => [actionId, sequence, clash]);

  it("finds another action with the same keys", () => {
    expect(clashes({}, "delete", "m")).toEqual([["toggle-mute", "m", "same"]]);
  });

  it("finds a sequence the keys start, and one that starts them", () => {
    expect(clashes({ "toggle-mute": ["g m"] }, "delete", "g")).toEqual([["toggle-mute", "g m", "starts"]]);
    expect(clashes({ "toggle-mute": ["g"] }, "delete", "g d")).toEqual([["toggle-mute", "g", "started-by"]]);
  });

  // ↑ goes to the previous media, but ↑ pressed while holding ← or → speeds up seeking
  it("doesn't count a key pressed while holding another as the same as the key alone", () => {
    expect(clashes({}, "toggle-mute", "ArrowUp")).toEqual([["previous", "ArrowUp", "same"]]);
    expect(clashes({}, "toggle-mute", "ArrowLeft+ArrowUp")).toEqual([["seek-faster", "ArrowUp", "same"]]);
  });

  it("counts the seek speed's keys as pressed while holding whatever the seek keys are", () => {
    const seekOnJAndL = { "seek-backwards": ["j"], "seek-forwards": ["l"] };

    expect(clashes(seekOnJAndL, "toggle-mute", "l+ArrowUp")).toEqual([["seek-faster", "ArrowUp", "same"]]);
    expect(clashes(seekOnJAndL, "toggle-mute", "ArrowLeft+ArrowUp")).toEqual([]);
  });

  it("counts a sequence starting another as clashing", () => {
    expect(clashes({ "toggle-mute": ["ArrowUp j"] }, "previous", "ArrowUp"))
      .toEqual([["toggle-mute", "ArrowUp j", "starts"]]);
  });

  it("counts the rating's digits as part of its keys", () => {
    // Stars ratings are 1–5, so r 0 is free to unset; with decimal, r 0 starts r 0 0
    expect(clashes({}, "toggle-mute", "r 4")).toEqual([["rate", "r", "same"]]);
    expect(clashes({}, "toggle-mute", "r 0")).toEqual([["unset-rating", "r 0", "same"]]);
    expect(clashes({}, "toggle-mute", "r 0", RatingSystemType.Decimal)).toEqual([["rate", "r", "starts"]]);
  });
});
