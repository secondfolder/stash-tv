import { analogDeadzone } from "../seek-speed";
import type { ShortcutActionId } from "../shortcut-actions/actions";
import type { GamepadActionDetail } from "../shortcut-actions/input";
import { resolveControlPress, type GamepadBindings } from "./bindings";
import { CONTROL_IDS, getControl, type ControlId } from "./controls";

/**
 * Reading a gamepad, frame by frame: what's been pressed, released or moved since the last frame, as the actions to
 * send. Kept apart from the polling (`useGamepad`) so it can be tested without a gamepad.
 *
 * @see docs/gamepad.md § "Reading the gamepad"
 */

/** How far a stick direction has to be pushed to press it */
export const stickPressThreshold = 0.5;
/** How far back a pressed stick direction has to come to release it, less than it took to press, so it doesn't flicker */
export const stickReleaseThreshold = 0.3;
/** How much a control bound to seeking has to move before its new position is sent */
export const analogChangeThreshold = 0.02;

/** The parts of a `Gamepad` read */
export type GamepadSnapshot = {
  buttons: readonly { pressed: boolean, value?: number }[],
  axes: readonly number[],
};

/** What's known of a gamepad from the frames before */
export type GamepadReadState = {
  /** The controls held down, and the actions their press was sent with (so their release is sent with the same) */
  held: ReadonlyMap<ControlId, readonly ShortcutActionId[]>,
  /** The controls bound to seeking that are pushed or pressed, and how far */
  analog: ReadonlyMap<ControlId, number>,
  /** The seek last sent: how far, negative backwards (0 for none) */
  seek: number,
};

export const initialGamepadReadState: GamepadReadState = { held: new Map(), analog: new Map(), seek: 0 };

/** The other axis of the same stick (X for Y, Y for X) */
const otherAxisOfStick = (axis: number) => axis % 2 === 0 ? axis + 1 : axis - 1;

/** Whether a stick direction is on the same stick as another control */
const sameStick = (controlId: ControlId, other: ControlId) => {
  const control = getControl(controlId);
  const otherControl = getControl(other);
  return control.kind === "stick-direction" && otherControl.kind === "stick-direction"
    && (otherControl.axis === control.axis || otherControl.axis === otherAxisOfStick(control.axis));
};

/** How far a stick direction is pushed, or a trigger pressed, 0 to 1, as 0 within the deadzone */
function analogAmount(snapshot: GamepadSnapshot, controlId: ControlId): number {
  const control = getControl(controlId);
  const amount = control.kind === "stick-direction"
    ? Math.max(0, (snapshot.axes[control.axis] ?? 0) * control.sign)
    : snapshot.buttons[control.index]?.value ?? (snapshot.buttons[control.index]?.pressed ? 1 : 0);
  return amount < analogDeadzone ? 0 : amount;
}

/**
 * Whether a control is down. A stick direction is pressed once it's pushed past the press threshold, if that's the
 * way it's mostly pushed (so a diagonal can't press two directions) and the stick isn't being read for seeking, and
 * released once it's back within the release threshold. A control bound to seeking is never down: it's read instead.
 */
function isDown(
  snapshot: GamepadSnapshot,
  controlId: ControlId,
  wasDown: boolean,
  bindings: GamepadBindings,
  analog: ReadonlyMap<ControlId, number>,
): boolean {
  if (bindings.analog[controlId]) return false;
  const control = getControl(controlId);
  if (control.kind === "button") return snapshot.buttons[control.index]?.pressed ?? false;
  const value = (snapshot.axes[control.axis] ?? 0) * control.sign;
  if (wasDown) return value >= stickReleaseThreshold;
  const seekingStick = [...analog.keys()].some((other) => sameStick(controlId, other));
  return value >= stickPressThreshold && value >= Math.abs(snapshot.axes[otherAxisOfStick(control.axis)] ?? 0) && !seekingStick;
}

/**
 * What's happened since the last frame: the actions to send (releases first), and the state to read the next frame
 * with. A gamepad that's gone (null) has everything released.
 */
export function readGamepad(
  snapshot: GamepadSnapshot | null,
  previous: GamepadReadState,
  bindings: GamepadBindings,
): { state: GamepadReadState, events: GamepadActionDetail[] } {
  const current = snapshot ?? { buttons: [], axes: [] };
  const events: GamepadActionDetail[] = [];

  // Controls bound to seeking that are pushed or pressed. A stick direction isn't read while a direction of the same
  // stick is held as a button (pushing up for the previous media mustn't seek a little too).
  const analog = new Map<ControlId, number>();
  for (const controlId of CONTROL_IDS) {
    if (!bindings.analog[controlId]) continue;
    if ([...previous.held.keys()].some((held) => sameStick(controlId, held))) continue;
    const amount = analogAmount(current, controlId);
    if (amount) analog.set(controlId, amount);
  }
  // The one pushed or pressed furthest seeks: sent as it changes (enough), and as 0 once there's none
  const furthest = [...analog].sort(([, a], [, b]) => b - a)[0];
  const seek = furthest ? furthest[1] * (bindings.analog[furthest[0]] === "analog-seek-forwards" ? 1 : -1) : 0;
  let sentSeek = previous.seek;
  if (seek === 0) {
    if (previous.seek !== 0) events.push({ kind: "analog-seek", value: 0 });
    sentSeek = 0;
  } else if (previous.seek === 0 || Math.sign(seek) !== Math.sign(previous.seek)
    || Math.abs(seek - previous.seek) > analogChangeThreshold) {
    events.push({ kind: "analog-seek", value: seek });
    sentSeek = seek;
  }

  const held = new Map<ControlId, readonly ShortcutActionId[]>();
  const pressed: ControlId[] = [];
  for (const controlId of CONTROL_IDS) {
    const wasDown = previous.held.has(controlId);
    if (isDown(current, controlId, wasDown, bindings, analog)) {
      if (wasDown) held.set(controlId, previous.held.get(controlId)!);
      else pressed.push(controlId);
    } else if (wasDown) {
      const actionIds = previous.held.get(controlId)!;
      if (actionIds.length) events.push({ kind: "release", actionIds });
    }
  }
  // A control pressed while others are held may be for something else then (d-pad ↑ while ← is held speeds up the
  // rewind), but controls pressed in the same frame aren't held while each other is pressed
  const heldBefore = [...held.keys()];
  for (const controlId of pressed) {
    const actionIds = resolveControlPress(bindings, controlId, heldBefore);
    held.set(controlId, actionIds);
    if (actionIds.length) events.push({ kind: "press", actionIds });
  }

  return { state: { held, analog, seek: sentSeek }, events };
}

/** The controls held down, or (if bound to seeking) pushed or pressed, according to a read state */
export function controlsDown(state: GamepadReadState): ControlId[] {
  return [...state.held.keys(), ...state.analog.keys()];
}
