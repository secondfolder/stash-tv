import { useEffect } from "react";
import { useGamepadState } from "../store/gamepadState";
import { useTvConfig } from "../store/tvConfig";
import { useGlobalState } from "../store/globalState";
import { resolveGamepadBindings } from "../helpers/gamepad/bindings";
import { controllerLayout, type ControlId } from "../helpers/gamepad/controls";
import {
  controlsDown,
  initialGamepadReadState,
  readGamepad,
  type GamepadReadState,
} from "../helpers/gamepad/reader";
import { dispatchGamepadAction } from "../helpers/shortcut-actions/input";

const connectedGamepads = () => navigator.getGamepads().filter((gamepad): gamepad is Gamepad => Boolean(gamepad));

const sameControls = (a: ReadonlySet<ControlId>, b: ReadonlySet<ControlId>) =>
  a.size === b.size && [...a].every((control) => b.has(control));

/**
 * Turns gamepads' buttons and sticks into shortcut actions, as the user's gamepad mapping says (tvConfig's
 * `gamepadMapping`), and keeps `gamepadState` up to date: whether one's connected, what kind it is, and which controls
 * are held down. It also remembers (tvConfig's `gamepadUsed`) that one's been used. Called once, by `App`.
 *
 * Gamepads can only be polled, so they're read every frame while one's connected. The mapping is read every frame
 * too, so a change in the settings applies at once.
 *
 * @see docs/gamepad.md
 */
export function useGamepad() {
  // Remember that a gamepad's been used, once the config's loaded so it can be saved: a preset changed later then stays
  // as it was for this user (see docs/gamepad.md § "Changing a preset"). A fake one doesn't count.
  const isConnected = useGamepadState((state) => state.isConnected);
  const tvConfigLoaded = useGlobalState((state) => state.tvConfigLoaded);
  const gamepadUsed = useTvConfig((state) => state.gamepadUsed);
  const fakeGamepad = useTvConfig((state) => state.fakeGamepad);
  useEffect(() => {
    if (isConnected && tvConfigLoaded && !gamepadUsed && !fakeGamepad) useTvConfig.getState().set("gamepadUsed", true);
  }, [isConnected, tvConfigLoaded, gamepadUsed, fakeGamepad]);

  useEffect(() => {
    const { setConnected, setLayout, setPressedControls } = useGamepadState.getState();
    // What's known of each gamepad (by its index) from the frames before
    const readStates = new Map<number, GamepadReadState>();
    let animationFrameId: number | undefined;

    const poll = () => {
      const bindings = resolveGamepadBindings(useTvConfig.getState().gamepadMapping);
      const gamepads = connectedGamepads();
      const pressed = new Set<ControlId>();
      // Gamepads that have gone have everything released, so nothing's left held (seeking forever)
      const indexes = new Set([...readStates.keys(), ...gamepads.map((gamepad) => gamepad.index)]);
      for (const index of indexes) {
        const gamepad = gamepads.find((gamepad) => gamepad.index === index) ?? null;
        const { state, events } = readGamepad(gamepad, readStates.get(index) ?? initialGamepadReadState, bindings);
        events.forEach(dispatchGamepadAction);
        if (gamepad) readStates.set(index, state);
        else readStates.delete(index);
        controlsDown(state).forEach((control) => pressed.add(control));
      }
      if (!sameControls(pressed, useGamepadState.getState().pressedControls)) setPressedControls(pressed);
      animationFrameId = gamepads.length ? requestAnimationFrame(poll) : undefined;
    };

    const update = () => {
      const gamepads = connectedGamepads();
      setConnected(gamepads.length > 0);
      if (gamepads.length) setLayout(controllerLayout(gamepads[0].id));
      // Polls until there are no gamepads left (once more after the last goes, releasing what it held)
      animationFrameId ??= requestAnimationFrame(poll);
    };

    window.addEventListener("gamepadconnected", update);
    window.addEventListener("gamepaddisconnected", update);
    // One may be connected already
    update();

    return () => {
      window.removeEventListener("gamepadconnected", update);
      window.removeEventListener("gamepaddisconnected", update);
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
    };
  }, []);
}
