import type { GamepadBindings } from "./bindings";

/**
 * The gamepad mappings to pick from. A user wanting their own starts from one of these.
 *
 * @see docs/gamepad.md § "Presets"
 */

/** What both presets' face, shoulder and menu buttons do */
const sharedButtons: GamepadBindings["buttons"] = {
  "south": ["play-pause"],
  "east": ["toggle-scene-info"],
  "west": ["edit-tags"],
  "north": ["toggle-looping"],
  "select": ["play-pause"],
  "start": ["toggle-fullscreen"],
  "touchpad": ["play-pause"],
};

export const GAMEPAD_PRESETS = {
  standard: {
    title: "Standard",
    description: "The d-pad moves between media and seeks, like the arrow keys",
    bindings: {
      buttons: {
        ...sharedButtons,
        // Like ↑ and ↓ on a keyboard: speeding up or slowing down while ← or → is held, otherwise previous/next
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
  },
  sticks: {
    title: "Sticks",
    description: "The left stick moves between media and seeks, faster the further it's pushed",
    bindings: {
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
  },
} as const satisfies Record<string, { title: string, description: string, bindings: GamepadBindings }>;

export type GamepadPresetId = keyof typeof GAMEPAD_PRESETS;
export const GAMEPAD_PRESET_IDS = Object.keys(GAMEPAD_PRESETS) as GamepadPresetId[];
