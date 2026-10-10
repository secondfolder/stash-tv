import { getShortcutAction, SHORTCUT_ACTION_IDS, type ShortcutActionId } from "../shortcut-actions/actions";
import { CONTROL_IDS, isAnalogControl, type ControlId } from "./controls";
import { GAMEPAD_PRESETS, type GamepadPresetId } from "./presets";

/**
 * What a gamepad's controls do: shortcut actions, or, for a control whose range can be read (a stick direction or a
 * trigger), seeking at a speed set by how far it's pushed or pressed.
 *
 * @see docs/gamepad.md § "Bindings"
 */

/**
 * The shortcut actions a control can be given: all but rating, which is the rating key followed by the rating's digits,
 * which a gamepad can't type
 */
export const GAMEPAD_ACTION_IDS: readonly ShortcutActionId[] = SHORTCUT_ACTION_IDS.filter((actionId) => actionId !== "rate");

/** What a control whose range can be read can do with it */
export type AnalogAction = "analog-seek-forwards" | "analog-seek-backwards";
export const ANALOG_ACTIONS: readonly AnalogAction[] = ["analog-seek-forwards", "analog-seek-backwards"];

export type GamepadBindings = {
  /**
   * Each control's actions: at most one plain one, and at most one with `heldWith` (done instead while a control for
   * one of those actions is held, as a key pressed while holding another is a chord)
   */
  buttons: Partial<Record<ControlId, readonly ShortcutActionId[]>>;
  /** Controls read as how far they're pushed or pressed, for seeking. They're not buttons then. */
  analog: Partial<Record<ControlId, AnalogAction>>;
};

/** The user's choice: one of the presets, or their own (kept when they go back to a preset, in case they return) */
export type GamepadMapping = {
  preset: GamepadPresetId | "custom";
  custom: GamepadBindings | null;
};

/**
 * The bindings to use. Anything the app no longer has, or a gamepad can't do (an action or control from another version,
 * as the mapping is synced), is left out.
 */
export function resolveGamepadBindings(mapping: GamepadMapping): GamepadBindings {
  const bindings: GamepadBindings = mapping.preset === "custom"
    ? mapping.custom ?? GAMEPAD_PRESETS.standard.bindings
    : (GAMEPAD_PRESETS[mapping.preset] ?? GAMEPAD_PRESETS.standard).bindings;
  const buttons: GamepadBindings["buttons"] = {};
  const analog: GamepadBindings["analog"] = {};
  for (const controlId of CONTROL_IDS) {
    const analogAction = bindings.analog?.[controlId];
    if (analogAction && isAnalogControl(controlId) && ANALOG_ACTIONS.includes(analogAction)) {
      analog[controlId] = analogAction;
      continue;
    }
    const actions = bindings.buttons?.[controlId]?.filter((actionId) => GAMEPAD_ACTION_IDS.includes(actionId));
    if (actions?.length) buttons[controlId] = actions;
  }
  return { buttons, analog };
}

const isHeldWithAction = (actionId: ShortcutActionId) => Boolean(getShortcutAction(actionId).heldWith);

/** A control's plain action, and the one it has for while a `heldWith` action's control is held */
export function controlActions(bindings: GamepadBindings, controlId: ControlId): {
  plain: ShortcutActionId | null,
  heldWith: ShortcutActionId | null,
} {
  const actions = bindings.buttons[controlId] ?? [];
  return {
    plain: actions.find((actionId) => !isHeldWithAction(actionId)) ?? null,
    heldWith: actions.find(isHeldWithAction) ?? null,
  };
}

/** The bindings with a control given just one action (or none), in place of whatever it had */
export function withControlAction(
  bindings: GamepadBindings,
  controlId: ControlId,
  actionId: ShortcutActionId | null,
): GamepadBindings {
  const { [controlId]: _previous, ...buttons } = bindings.buttons;
  const { [controlId]: _previousAnalog, ...analog } = bindings.analog;
  return { buttons: actionId ? { ...buttons, [controlId]: [actionId] } : buttons, analog };
}

/** The bindings with a control (one whose range can be read) seeking, in place of whatever it had */
export function withAnalogAction(bindings: GamepadBindings, controlId: ControlId, action: AnalogAction): GamepadBindings {
  const { [controlId]: _previous, ...buttons } = bindings.buttons;
  return { buttons, analog: { ...bindings.analog, [controlId]: action } };
}

/**
 * The actions a control's press is for, given the other controls held down: its `heldWith` action if a control for
 * one of the actions it's held with is held (d-pad ↑ while holding d-pad ← speeds up the rewind), otherwise its plain
 * action. Nothing for a control read for seeking.
 */
export function resolveControlPress(
  bindings: GamepadBindings,
  controlId: ControlId,
  heldControls: Iterable<ControlId>,
): ShortcutActionId[] {
  if (bindings.analog[controlId]) return [];
  const { plain, heldWith } = controlActions(bindings, controlId);
  if (heldWith) {
    const heldActions = new Set<ShortcutActionId>();
    for (const held of heldControls) {
      if (held !== controlId) bindings.buttons[held]?.forEach((actionId) => heldActions.add(actionId));
    }
    if (getShortcutAction(heldWith).heldWith?.some((actionId) => heldActions.has(actionId))) return [heldWith];
  }
  return plain ? [plain] : [];
}
