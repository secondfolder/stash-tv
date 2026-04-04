import { useEffect } from "react";
import { useGamepadState } from "../store/gamepadState";
import { objectEntries } from "ts-extras";

// Standard Gamepad API button indices for d-pad
const DPAD_BUTTON_MAP_PORTRAIT: Record<number, string> = {
  12: "ArrowUp",
  13: "ArrowDown",
  14: "ArrowLeft",
  15: "ArrowRight",
};

// 90° counter-clockwise rotation to match how forceLandscape remaps arrow keys
// in VideoScroller and MediaSlide: Up→Left, Down→Right, Left→Down, Right→Up
const DPAD_BUTTON_MAP_LANDSCAPE: Record<number, string> = {
  12: "ArrowLeft",
  13: "ArrowRight",
  14: "ArrowDown",
  15: "ArrowUp",
};

import { TOGGLE_VIDEO_EVENT, PAUSE_VIDEO_EVENT } from "../events";

// Button 8 is the Share/Select button — toggles play/pause on the current video
// Button 17 is the PS touchpad button — pauses the current video
const BUTTON_ACTION_MAP: Record<number, () => void> = {
  8: () => window.dispatchEvent(new CustomEvent(TOGGLE_VIDEO_EVENT)),
  17: () => window.dispatchEvent(new CustomEvent(PAUSE_VIDEO_EVENT)),
};

/**
 * Maps gamepad buttons to keyboard events or custom actions dispatched on window.
 * This allows existing keyboard event listeners to respond to gamepad input
 * without modification.
 *
 * When forceLandscape is true the d-pad mapping is rotated 90° to match the
 * rotated arrow key semantics used throughout the app in landscape mode.
 */
export function useGamepad({ forceLandscape }: { forceLandscape: boolean }) {
  const setConnected = useGamepadState((state) => state.setConnected);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () =>
      setConnected(Array.from(navigator.getGamepads()).some(Boolean));

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    // Sync initial state
    setConnected(Array.from(navigator.getGamepads()).some(Boolean));

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, [setConnected]);

  useEffect(() => {
    const dpadButtonMap = forceLandscape ? DPAD_BUTTON_MAP_LANDSCAPE : DPAD_BUTTON_MAP_PORTRAIT;
    const keyButtonMap = { ...dpadButtonMap };
    const previousButtonStates = new Map<number, boolean>();
    let animationFrameId: number;

    const dispatchKey = (key: string, type: "keydown" | "keyup") => {
      window.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code: key,
          bubbles: true,
          cancelable: true,
          capture: true,
        } as KeyboardEventInit)
      );
    };

    const poll = () => {
      const gamepads = navigator.getGamepads();
      for (const gamepad of gamepads) {
        if (!gamepad) continue;

        for (const [buttonIndex, key] of objectEntries(keyButtonMap)) {
          const index = Number(buttonIndex);
          const pressed = gamepad.buttons[index]?.pressed ?? false;
          const wasPressed = previousButtonStates.get(index) ?? false;
          if (pressed && !wasPressed) dispatchKey(key, "keydown");
          else if (!pressed && wasPressed) dispatchKey(key, "keyup");
          previousButtonStates.set(index, pressed);
        }

        for (const [buttonIndex, action] of objectEntries(BUTTON_ACTION_MAP)) {
          const index = Number(buttonIndex);
          const pressed = gamepad.buttons[index]?.pressed ?? false;
          const wasPressed = previousButtonStates.get(index) ?? false;
          if (pressed && !wasPressed) action();
          previousButtonStates.set(index, pressed);
        }
      }
      animationFrameId = requestAnimationFrame(poll);
    };

    const handleGamepadConnected = () => {
      // Restart polling loop on new connection (safe to call if already running)
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(poll);
    };

    window.addEventListener("gamepadconnected", handleGamepadConnected);
    // Start polling immediately in case a gamepad is already connected
    animationFrameId = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("gamepadconnected", handleGamepadConnected);
    };
  }, [forceLandscape]);
}
