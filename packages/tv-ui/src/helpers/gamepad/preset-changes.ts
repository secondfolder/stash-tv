import type { GamepadBindings, GamepadMapping } from "./bindings";
import type { GamepadPresetId } from "./presets";

/**
 * For a tvConfig migration step that changes a preset's bindings in a way that would upset someone used to them (moving
 * an action to another control, say): anyone who's used a gamepad and has that preset chosen is moved onto a custom
 * mapping of its bindings as they were, so their gamepad keeps doing what it did. Someone who's never used one just
 * gets the new preset. A custom mapping they had saved (from trying Custom before) is replaced, as it wasn't in use.
 *
 * Changes that only add (an action for a control that had none) don't need this, so everyone gets them.
 *
 * @see docs/gamepad.md § "Changing a preset"
 */
export function keepOldPreset(state: Record<string, unknown>, presetId: GamepadPresetId, oldBindings: GamepadBindings) {
  const mapping = state.gamepadMapping as GamepadMapping | undefined;
  if (!state.gamepadUsed || mapping?.preset !== presetId) return;
  state.gamepadMapping = { preset: "custom", custom: oldBindings } satisfies GamepadMapping;
}
