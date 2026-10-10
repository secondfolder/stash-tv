/**
 * `useGamepad` reads connected gamepads every frame, sending their controls' actions (as the user's mapping says) and
 * keeping the gamepad state the settings use up to date.
 *
 * @see docs/gamepad.md § "Reading the gamepad"
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useGamepad } from "../../../src/hooks/useGamepad";
import { useGamepadState } from "../../../src/store/gamepadState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { GAMEPAD_ACTION_EVENT, type GamepadActionDetail } from "../../../src/helpers/shortcut-actions/input";
import { resetStores } from "../helpers/stores";

const gamepad = {
  id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
  index: 0,
  buttons: Array.from({ length: 18 }, () => ({ pressed: false })),
  axes: [0, 0, 0, 0],
};

function App() {
  useGamepad();
  return null;
}

let connected = false;
let frames: FrameRequestCallback[] = [];
let sent: GamepadActionDetail[] = [];
const record = (event: Event) => sent.push((event as CustomEvent<GamepadActionDetail>).detail);

/** Runs the frames asked for since the last */
function nextFrame() {
  const callbacks = frames;
  frames = [];
  act(() => callbacks.forEach((callback) => callback(performance.now())));
}

function connect() {
  connected = true;
  act(() => { window.dispatchEvent(new Event("gamepadconnected")); });
}

beforeEach(() => {
  resetStores();
  connected = false;
  frames = [];
  sent = [];
  gamepad.buttons.forEach((button) => { button.pressed = false; });
  vi.spyOn(navigator, "getGamepads").mockImplementation(() => [connected ? gamepad as unknown as Gamepad : null]);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => { frames = []; });
  window.addEventListener(GAMEPAD_ACTION_EVENT, record);
  useGamepadState.setState({ isConnected: false, connectedAt: null, layout: "xbox", pressedControls: new Set() });
});

afterEach(() => {
  window.removeEventListener(GAMEPAD_ACTION_EVENT, record);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useGamepad", () => {
  it("knows when a gamepad's connected and what kind it is", () => {
    render(<App />);
    expect(useGamepadState.getState().isConnected).toBe(false);

    connect();

    expect(useGamepadState.getState().isConnected).toBe(true);
    expect(useGamepadState.getState().layout).toBe("playstation");
  });

  it("sends a button's actions as it's pressed and released, following the mapping as it changes", () => {
    render(<App />);
    connect();

    gamepad.buttons[0].pressed = true;
    nextFrame();
    gamepad.buttons[0].pressed = false;
    nextFrame();
    expect(sent).toEqual([
      { kind: "press", actionIds: ["play-pause"] },
      { kind: "release", actionIds: ["play-pause"] },
    ]);

    sent = [];
    act(() => useTvConfig.getState().set("gamepadMapping", {
      preset: "custom",
      custom: { buttons: { south: ["toggle-mute"] }, analog: {} },
    }));
    gamepad.buttons[0].pressed = true;
    nextFrame();
    expect(sent).toEqual([{ kind: "press", actionIds: ["toggle-mute"] }]);
  });

  it("remembers that a gamepad's been used, once the config's loaded", () => {
    render(<App />);
    expect(useTvConfig.getState().gamepadUsed).toBe(false);

    connect();

    expect(useTvConfig.getState().gamepadUsed).toBe(true);
  });

  it("keeps track of the controls held down", () => {
    render(<App />);
    connect();

    gamepad.buttons[12].pressed = true;
    nextFrame();

    expect([...useGamepadState.getState().pressedControls]).toEqual(["dpad-up"]);
  });

  it("stops reading once the gamepad's gone, releasing what was held", () => {
    render(<App />);
    connect();
    gamepad.buttons[0].pressed = true;
    nextFrame();

    connected = false;
    act(() => { window.dispatchEvent(new Event("gamepaddisconnected")); });
    nextFrame();

    expect(sent.at(-1)).toEqual({ kind: "release", actionIds: ["play-pause"] });
    expect(useGamepadState.getState().isConnected).toBe(false);
    expect(frames).toEqual([]);
  });
});
