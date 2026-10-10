import { useGlobalState } from "../../store/globalState";
import { matchShortcut, matchShortcutKey, shortcutDigits } from "../../hooks/useKeyboardShortcuts";
import { isTypingTarget } from "../keyboard-shortcuts/key-combos";
import type { ShortcutActionId } from "./actions";

/**
 * Shortcut actions as they're pressed and released, whatever they're pressed with: the keyboard (matched against the
 * user's keys) or a gamepad (`useGamepad()` works out which actions a control is for and sends them here). Listeners
 * handle the actions without caring which.
 *
 * @see docs/keyboard-shortcuts.md § "Where shortcuts live"
 */

/** What a press or release of a key or gamepad control is for */
export type ShortcutTrigger = {
  /** Which of the given actions it's for, or null for none */
  match<Id extends ShortcutActionId>(actionIds: readonly Id[]): Id | null;
  source: "keyboard" | "gamepad";
  /** Whether it's a key repeat of a key held down (never, for a gamepad) */
  repeat: boolean;
  /** For a press completing the rating's keys, the digits typed after them (never any, for a gamepad) */
  digits(): string[];
  /** Stops the browser's default for the key (scrolling with the arrows or Space) */
  preventDefault(): void;
  /** Stops anything else (Video.js) handling the key as well */
  handled(): void;
};

/** A gamepad's actions, sent by `useGamepad()` */
export const GAMEPAD_ACTION_EVENT = "stash-tv-gamepad-action";

export type GamepadActionDetail =
  /** A control pressed or released, with the actions it's for */
  | { kind: "press" | "release", actionIds: readonly ShortcutActionId[] }
  /** How far a stick bound to seeking is pushed, -1 (all the way back) to 1 (all the way forwards), 0 when let go */
  | { kind: "analog-seek", value: number };

export function dispatchGamepadAction(detail: GamepadActionDetail) {
  window.dispatchEvent(new CustomEvent<GamepadActionDetail>(GAMEPAD_ACTION_EVENT, { detail }));
}

function onGamepadAction(handler: (detail: GamepadActionDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<GamepadActionDetail>).detail);
  window.addEventListener(GAMEPAD_ACTION_EVENT, listener);
  return () => window.removeEventListener(GAMEPAD_ACTION_EVENT, listener);
}

/**
 * Calls the handler for every press (or release) of a key or gamepad control, until the function returned is called.
 * `capture` listens for keys in the capture phase, so they can be stopped before reaching the video player.
 */
export function onShortcut(
  phase: "press" | "release",
  handler: (trigger: ShortcutTrigger) => void,
  { capture = false }: { capture?: boolean } = {},
): () => void {
  const keyboardEventType = phase === "press" ? "keydown" : "keyup";
  const handleKey = (event: KeyboardEvent) => {
    // A press is never matched while typing in a text field (see `matchShortcut`), but a release has to be checked
    if (phase === "release" && isTypingTarget(event)) return;
    handler({
      match: (actionIds) => phase === "press" ? matchShortcut(event, actionIds) : matchShortcutKey(event, actionIds),
      source: "keyboard",
      repeat: event.repeat,
      digits: () => shortcutDigits(event),
      preventDefault: () => event.preventDefault(),
      handled: () => {
        event.preventDefault();
        event.stopPropagation();
      },
    });
  };
  window.addEventListener(keyboardEventType, handleKey, { capture });

  const stopGamepad = onGamepadAction((detail) => {
    if (detail.kind !== phase) return;
    // Nothing fires while a shortcut's keys are being typed in the settings, as for the keyboard (a release still
    // does, so a hold started before then ends)
    if (phase === "press" && useGlobalState.getState().recordingShortcut) return;
    handler({
      match: (actionIds) => actionIds.find((actionId) => detail.actionIds.includes(actionId)) ?? null,
      source: "gamepad",
      repeat: false,
      digits: () => [],
      preventDefault: () => {},
      handled: () => {},
    });
  });

  return () => {
    window.removeEventListener(keyboardEventType, handleKey, { capture });
    stopGamepad();
  };
}

/** Calls the handler whenever a stick bound to seeking moves, until the function returned is called */
export function onAnalogSeek(handler: (value: number) => void): () => void {
  return onGamepadAction((detail) => {
    if (detail.kind === "analog-seek") handler(detail.value);
  });
}
