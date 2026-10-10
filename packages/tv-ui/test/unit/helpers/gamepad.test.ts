import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveControlPress,
  resolveGamepadBindings,
  withAnalogAction,
  withControlAction,
  type GamepadBindings,
} from "../../../src/helpers/gamepad/bindings";
import { controllerLayout, controlLabel, controlShortLabel, directionArrow, isAnalogControl } from "../../../src/helpers/gamepad/controls";
import { GAMEPAD_PRESETS } from "../../../src/helpers/gamepad/presets";
import {
  controlsDown,
  initialGamepadReadState,
  readGamepad,
  type GamepadReadState,
  type GamepadSnapshot,
} from "../../../src/helpers/gamepad/reader";
import { dispatchGamepadAction, onAnalogSeek, onShortcut, type ShortcutTrigger } from "../../../src/helpers/shortcut-actions/input";
import { useGlobalState } from "../../../src/store/globalState";

/**
 * Gamepads: what their controls are bound to, how each frame read from one becomes shortcut actions, and how those
 * reach listeners alongside the keyboard's.
 *
 * @see docs/gamepad.md
 */

const standard = GAMEPAD_PRESETS.standard.bindings as GamepadBindings;
const sticks = GAMEPAD_PRESETS.sticks.bindings as GamepadBindings;

/** A frame of a gamepad with the given buttons held (or pressed so far: the triggers), and sticks pushed */
function snapshot(
  { pressed = [], values = {}, axes = [] }: { pressed?: number[], values?: Record<number, number>, axes?: number[] } = {},
): GamepadSnapshot {
  return {
    buttons: Array.from({ length: 18 }, (_, index) => {
      const value = values[index] ?? (pressed.includes(index) ? 1 : 0);
      return { pressed: value > 0.1, value };
    }),
    axes: [0, 1, 2, 3].map((index) => axes[index] ?? 0),
  };
}

/** Reads frames one after another, giving every frame's events */
function readFrames(bindings: GamepadBindings, frames: (GamepadSnapshot | null)[]) {
  let state: GamepadReadState = initialGamepadReadState;
  return frames.map((frame) => {
    const result = readGamepad(frame, state, bindings);
    state = result.state;
    return result.events;
  });
}

/** @see docs/gamepad.md § "Bindings" */
describe("gamepad bindings", () => {
  it("uses the chosen preset, or the user's own", () => {
    expect(resolveGamepadBindings({ preset: "sticks", custom: null })).toEqual(sticks);
    const custom = { buttons: { south: ["toggle-mute" as const] }, analog: { rt: "analog-seek-forwards" as const } };
    expect(resolveGamepadBindings({ preset: "custom", custom })).toEqual(custom);
    expect(resolveGamepadBindings({ preset: "standard", custom })).toEqual(standard);
  });

  it("leaves out actions and controls the app doesn't have (from another version)", () => {
    const custom = {
      // A gamepad can't rate (it can't type the digits)
      buttons: { south: ["no-such-action", "play-pause"], "no-such-control": ["next"], north: ["rate"] },
      // A face button can't be read for how far it's pressed
      analog: { "left-stick-left": "analog-seek-backwards", "no-such-control": "analog-seek-forwards", east: "analog-seek-forwards" },
    } as unknown as GamepadBindings;
    expect(resolveGamepadBindings({ preset: "custom", custom })).toEqual({
      buttons: { south: ["play-pause"] },
      analog: { "left-stick-left": "analog-seek-backwards" },
    });
  });

  it("does a control's held-with action while a control for what it's held with is held, otherwise its own", () => {
    expect(resolveControlPress(standard, "dpad-up", [])).toEqual(["previous"]);
    expect(resolveControlPress(standard, "dpad-up", ["dpad-left"])).toEqual(["seek-faster"]);
    // The triggers seek too
    expect(resolveControlPress(standard, "dpad-down", ["rt"])).toEqual(["seek-slower"]);
    // Held controls that aren't for seeking make no difference
    expect(resolveControlPress(standard, "dpad-up", ["south"])).toEqual(["previous"]);
  });

  it("gives a control seeking or an action, each in place of the other, and presses nothing for one seeking", () => {
    const seeking = withAnalogAction(standard, "rt", "analog-seek-forwards");
    expect(seeking.buttons.rt).toBeUndefined();
    expect(resolveControlPress(seeking, "rt", [])).toEqual([]);
    const pressing = withControlAction(seeking, "rt", "next");
    expect(pressing.analog.rt).toBeUndefined();
    expect(resolveControlPress(pressing, "rt", [])).toEqual(["next"]);
  });

  it("gives a control one action in place of whatever it had, leaving out a control with none", () => {
    // Previous, or speed up while seeking
    let bindings = withControlAction(standard, "dpad-up", "toggle-mute");
    expect(bindings.buttons["dpad-up"]).toEqual(["toggle-mute"]);
    bindings = withControlAction(bindings, "dpad-up", null);
    expect(bindings.buttons["dpad-up"]).toBeUndefined();
  });

  it("only does a held-with action given on its own while a seek control is held", () => {
    const bindings = withControlAction(standard, "east", "seek-faster");
    expect(resolveControlPress(bindings, "east", [])).toEqual([]);
    expect(resolveControlPress(bindings, "east", ["dpad-right"])).toEqual(["seek-faster"]);
  });
});

/** @see docs/gamepad.md § "Controls" */
describe("gamepad controls", () => {
  it("are named as the controller names them", () => {
    expect(controllerLayout("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toBe("xbox");
    expect(controllerLayout("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")).toBe("playstation");
    expect(controllerLayout("Some other controller")).toBe("xbox");
    expect(controlLabel("south", "xbox")).toBe("A");
    expect(controlLabel("south", "playstation")).toBe("✕");
    expect(controlLabel("dpad-up", "playstation")).toBe("D-pad ↑");
    expect(directionArrow("dpad-up")).toBe("↑");
    expect(directionArrow("right-stick-left")).toBe("←");
    expect(directionArrow("south")).toBeNull();
    expect(controlShortLabel("l3", "playstation")).toBe("Press (L3)");
    expect(controlShortLabel("r3", "xbox")).toBe("Press (RS)");
    expect(controlShortLabel("dpad-left", "xbox")).toBe("←");
    expect(controlShortLabel("lb", "playstation")).toBe("L1");
  });

  it("can be read for how far they're pushed or pressed if they're stick directions or triggers", () => {
    expect(isAnalogControl("left-stick-up")).toBe(true);
    expect(isAnalogControl("lt")).toBe(true);
    expect(isAnalogControl("lb")).toBe(false);
    expect(isAnalogControl("dpad-up")).toBe(false);
  });
});

/** @see docs/gamepad.md § "Reading the gamepad" */
describe("readGamepad", () => {
  it("sends a button's actions as it's pressed and released, and nothing while it's held", () => {
    expect(readFrames(standard, [snapshot({ pressed: [0] }), snapshot({ pressed: [0] }), snapshot()])).toEqual([
      [{ kind: "press", actionIds: ["play-pause"] }],
      [],
      [{ kind: "release", actionIds: ["play-pause"] }],
    ]);
  });

  it("releases a control with the actions it was pressed with, even if what it's for has changed since", () => {
    const [, , release] = readFrames(standard, [
      snapshot({ pressed: [14] }),
      snapshot({ pressed: [14, 12] }),
      snapshot({ pressed: [14] }),
    ]);
    expect(release).toEqual([{ kind: "release", actionIds: ["seek-faster"] }]);
  });

  it("sends nothing for a control with no actions", () => {
    expect(readFrames(standard, [snapshot({ pressed: [16] }), snapshot()])).toEqual([[], []]);
  });

  it("presses a stick direction past halfway, and releases it once it's back within 0.3", () => {
    expect(readFrames(sticks, [
      snapshot({ axes: [0, 0.45] }),
      snapshot({ axes: [0, 0.6] }),
      snapshot({ axes: [0, 0.35] }),
      snapshot({ axes: [0, 0.25] }),
    ])).toEqual([[], [{ kind: "press", actionIds: ["next"] }], [], [{ kind: "release", actionIds: ["next"] }]]);
  });

  it("presses only the way a stick's mostly pushed", () => {
    const bindings = { buttons: { "right-stick-up": ["previous" as const], "right-stick-right": ["next" as const] }, analog: {} };
    expect(readFrames(bindings, [snapshot({ axes: [0, 0, 0.8, -0.6] })])).toEqual([[{ kind: "press", actionIds: ["next"] }]]);
  });

  it("sends how far a stick direction bound to seeking is pushed as it moves, and 0 once it's back in the deadzone", () => {
    expect(readFrames(sticks, [
      snapshot({ axes: [0.1] }),
      snapshot({ axes: [0.5] }),
      snapshot({ axes: [0.51] }),
      snapshot({ axes: [-0.7] }),
      snapshot({ axes: [0.05] }),
    ])).toEqual([
      [],
      [{ kind: "analog-seek", value: 0.5 }],
      // Too small a move to send
      [],
      [{ kind: "analog-seek", value: -0.7 }],
      [{ kind: "analog-seek", value: 0 }],
    ]);
  });

  it("sends how hard a trigger bound to seeking is pressed", () => {
    const bindings = withAnalogAction(standard, "lt", "analog-seek-backwards");
    expect(readFrames(bindings, [
      snapshot({ values: { 6: 0.1 } }),
      snapshot({ values: { 6: 0.6 } }),
      snapshot(),
    ])).toEqual([[], [{ kind: "analog-seek", value: -0.6 }], [{ kind: "analog-seek", value: 0 }]]);
  });

  it("seeks with whichever control bound to seeking is pushed or pressed furthest", () => {
    const bindings = withAnalogAction(sticks, "rt", "analog-seek-forwards");
    expect(readFrames(bindings, [snapshot({ values: { 7: 0.9 }, axes: [-0.5] })])).toEqual([
      [{ kind: "analog-seek", value: 0.9 }],
    ]);
  });

  it("doesn't seek with a stick direction while a direction of the same stick is held as a button", () => {
    // Pushed down for the next media, then a little to the left (which seeks backwards)
    expect(readFrames(sticks, [snapshot({ axes: [0, 0.8] }), snapshot({ axes: [-0.4, 0.8] })])).toEqual([
      [{ kind: "press", actionIds: ["next"] }],
      [],
    ]);
  });

  it("doesn't press a stick's directions across the way it's seeking", () => {
    // Seeking along X, then pushed further down than across: still seeking, not moving to the next media
    expect(readFrames(sticks, [snapshot({ axes: [0.6] }), snapshot({ axes: [0.4, 0.8] })])[1]).toEqual([
      { kind: "analog-seek", value: 0.4 },
    ]);
  });

  it("releases everything held when the gamepad's gone", () => {
    const events = readFrames(sticks, [snapshot({ pressed: [0], axes: [0.9] }), null]);
    expect(events[1]).toEqual([
      { kind: "analog-seek", value: 0 },
      { kind: "release", actionIds: ["play-pause"] },
    ]);
  });

  it("gives the controls held down, for the settings to light up", () => {
    const { state } = readGamepad(snapshot({ pressed: [0, 16], axes: [0.9] }), initialGamepadReadState, sticks);
    expect(controlsDown(state).sort()).toEqual(["home", "left-stick-right", "south"]);
  });
});

/** @see docs/keyboard-shortcuts.md § "Where shortcuts live" */
describe("onShortcut", () => {
  const stops: (() => void)[] = [];
  const listen = (phase: "press" | "release") => {
    const triggers: ShortcutTrigger[] = [];
    stops.push(onShortcut(phase, (trigger) => triggers.push(trigger)));
    return triggers;
  };
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    useGlobalState.getState().set("recordingShortcut", false);
  });

  it("hands listeners a gamepad's presses and releases, matched by action", () => {
    const presses = listen("press");
    const releases = listen("release");

    dispatchGamepadAction({ kind: "press", actionIds: ["seek-faster"] });
    dispatchGamepadAction({ kind: "release", actionIds: ["seek-faster"] });

    expect(presses).toHaveLength(1);
    expect(presses[0].source).toBe("gamepad");
    expect(presses[0].match(["previous", "seek-faster"])).toBe("seek-faster");
    expect(presses[0].match(["next"])).toBeNull();
    expect(presses[0].digits()).toEqual([]);
    expect(releases).toHaveLength(1);
  });

  it("hands listeners key presses, matched against the user's keys", () => {
    const presses = listen("press");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));

    expect(presses).toHaveLength(1);
    expect(presses[0].source).toBe("keyboard");
    expect(presses[0].match(["toggle-mute", "next"])).toBe("toggle-mute");
  });

  it("ignores a gamepad's presses while a shortcut's keys are being typed into the settings", () => {
    const presses = listen("press");
    useGlobalState.getState().set("recordingShortcut", true);

    dispatchGamepadAction({ kind: "press", actionIds: ["toggle-mute"] });

    expect(presses).toHaveLength(0);
  });

  it("hands analog seeking to its own listeners", () => {
    const handler = vi.fn();
    stops.push(onAnalogSeek(handler));

    dispatchGamepadAction({ kind: "analog-seek", value: 0.5 });
    dispatchGamepadAction({ kind: "press", actionIds: ["next"] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(0.5);
  });
});
