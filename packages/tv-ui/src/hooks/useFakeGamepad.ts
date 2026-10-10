import { useEffect } from "react";
import { useTvConfig } from "../store/tvConfig";
import { CONTROLS, type ControllerLayout, type ControlId } from "../helpers/gamepad/controls";

/**
 * A pretend gamepad for trying gamepad support without one: chosen in Settings → Developer Options (tvConfig's
 * `fakeGamepad`, kept on the device rather than in Stash), it's connected until it's chosen not to be, so the Gamepad
 * settings show. Its controls can then be worked from the browser's console:
 *
 * ```js
 * fakeGamepad.press("south")                 // press and let go of a button
 * fakeGamepad.hold("dpad-right", true)       // hold one down (false lets go)
 * fakeGamepad.push("left-stick-right", 0.8)  // push a stick that way, or press a trigger, 0 to 1 of the way
 * ```
 *
 * Browsers only report a real gamepad once it's been used, so it's also the only way to see the settings without one
 * to hand. @see docs/gamepad.md § "Trying it without a gamepad"
 */

type FakeGamepadControls = {
  press(controlId: ControlId): void;
  hold(controlId: ControlId, held: boolean): void;
  push(controlId: ControlId, amount: number): void;
};

declare global {
  interface Window {
    fakeGamepad?: FakeGamepadControls;
  }
}

/** How long a press made from the console is held, long enough for a frame or two to see it */
const pressDuration = 100;

/** Connects a fake gamepad, until the function returned is called */
function connectFakeGamepad(kind: ControllerLayout): { controls: FakeGamepadControls, disconnect: () => void } {
  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  const gamepad = {
    id: kind === "playstation"
      ? "Fake DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)"
      : "Fake Xbox Wireless Controller (STANDARD GAMEPAD)",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    buttons,
    axes,
  } as unknown as Gamepad;
  const getRealGamepads = navigator.getGamepads;
  // In the first slot, with any real ones after it
  navigator.getGamepads = () => [gamepad, ...getRealGamepads.call(navigator).slice(1)];
  window.dispatchEvent(new Event("gamepadconnected"));

  const controls: FakeGamepadControls = {
    press(controlId) {
      controls.hold(controlId, true);
      setTimeout(() => controls.hold(controlId, false), pressDuration);
    },
    hold(controlId, held) {
      controls.push(controlId, held ? 1 : 0);
    },
    push(controlId, amount) {
      const control = CONTROLS[controlId];
      if (control.kind === "button") {
        buttons[control.index].value = amount;
        buttons[control.index].pressed = amount > 0.1;
      } else {
        axes[control.axis] = amount * control.sign;
      }
    },
  };
  return {
    controls,
    disconnect: () => {
      navigator.getGamepads = getRealGamepads;
      window.dispatchEvent(new Event("gamepaddisconnected"));
    },
  };
}

/** Connects the fake gamepad chosen in the developer options (if one is), and disconnects it when it's not chosen */
export function useFakeGamepad() {
  const kind = useTvConfig((state) => state.fakeGamepad);
  useEffect(() => {
    if (!kind) return;
    const { controls, disconnect } = connectFakeGamepad(kind);
    window.fakeGamepad = controls;
    return () => {
      delete window.fakeGamepad;
      disconnect();
    };
  }, [kind]);
}
