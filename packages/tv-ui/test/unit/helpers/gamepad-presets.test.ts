import { describe, expect, it } from "vitest";
import { GAMEPAD_PRESETS } from "../../../src/helpers/gamepad/presets";
import { keepOldPreset } from "../../../src/helpers/gamepad/preset-changes";
import type { GamepadBindings } from "../../../src/helpers/gamepad/bindings";

/**
 * The gamepad presets, as users have them. Changing a preset can change what someone's gamepad does under their thumbs,
 * so a change has to be deliberate: these copies (not snapshots, which `-u` would quietly rewrite) fail until they're
 * updated by hand, as a reminder to decide whether people used to the old preset should keep it.
 *
 * @see docs/gamepad.md § "Changing a preset"
 */

const sharedButtons = {
  "south": ["play-pause"],
  "east": ["toggle-scene-info"],
  "west": ["edit-tags"],
  "north": ["toggle-looping"],
  "select": ["play-pause"],
  "start": ["toggle-fullscreen"],
  "touchpad": ["play-pause"],
};

/**
 * ⚠️ If this fails, you've changed a preset. If the change could upset someone used to the old one (an action moved or
 * removed, not just one added to a control that had none), add a tvConfig migration step calling `keepOldPreset()`
 * with the old bindings (see docs/gamepad.md § "Changing a preset"). Then update this copy to match.
 */
const PRESETS_AS_RELEASED = {
  standard: {
    buttons: {
      ...sharedButtons,
      "dpad-up": ["previous", "seek-faster"],
      "dpad-down": ["next", "seek-slower"],
      "dpad-left": ["seek-backwards"],
      "dpad-right": ["seek-forwards"],
      "lb": ["toggle-mute"],
      "rb": ["toggle-looping"],
      "lt": ["seek-backwards"],
      "rt": ["seek-forwards"],
    },
    analog: {},
  },
  sticks: {
    buttons: {
      ...sharedButtons,
      "left-stick-up": ["previous"],
      "left-stick-down": ["next"],
      "dpad-up": ["toggle-scene-info"],
      "dpad-down": ["toggle-subtitles"],
      "dpad-left": ["toggle-mute"],
      "dpad-right": ["toggle-looping"],
      "lb": ["seek-backwards"],
      "rb": ["seek-forwards"],
    },
    analog: { "left-stick-left": "analog-seek-backwards", "left-stick-right": "analog-seek-forwards" },
  },
};

describe("gamepad presets", () => {
  it("are as released (see the note on PRESETS_AS_RELEASED if this fails)", () => {
    const bindings = Object.fromEntries(
      Object.entries(GAMEPAD_PRESETS).map(([presetId, preset]) => [presetId, preset.bindings]),
    );
    expect(bindings).toEqual(PRESETS_AS_RELEASED);
  });
});

describe("keepOldPreset", () => {
  const oldStandard = PRESETS_AS_RELEASED.standard as GamepadBindings;

  it("moves someone who's used a gamepad with the changed preset onto a custom mapping of its old bindings", () => {
    const state: Record<string, unknown> = { gamepadUsed: true, gamepadMapping: { preset: "standard", custom: null } };
    keepOldPreset(state, "standard", oldStandard);
    expect(state.gamepadMapping).toEqual({ preset: "custom", custom: oldStandard });
  });

  it("leaves someone who's never used a gamepad on the preset, so they get the new one", () => {
    const state: Record<string, unknown> = { gamepadUsed: false, gamepadMapping: { preset: "standard", custom: null } };
    keepOldPreset(state, "standard", oldStandard);
    expect(state.gamepadMapping).toEqual({ preset: "standard", custom: null });
  });

  it("leaves someone on another preset, or their own mapping, alone", () => {
    const sticks: Record<string, unknown> = { gamepadUsed: true, gamepadMapping: { preset: "sticks", custom: null } };
    keepOldPreset(sticks, "standard", oldStandard);
    expect(sticks.gamepadMapping).toEqual({ preset: "sticks", custom: null });

    const custom = { buttons: { south: ["toggle-mute"] }, analog: {} };
    const own: Record<string, unknown> = { gamepadUsed: true, gamepadMapping: { preset: "custom", custom } };
    keepOldPreset(own, "standard", oldStandard);
    expect(own.gamepadMapping).toEqual({ preset: "custom", custom });
  });

  it("does nothing for config saved before gamepads could be mapped", () => {
    const state: Record<string, unknown> = { volume: 1 };
    keepOldPreset(state, "standard", oldStandard);
    expect(state).toEqual({ volume: 1 });
  });
});
