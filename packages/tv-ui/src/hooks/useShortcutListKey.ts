import { useEffect } from "react";
import { useGlobalState } from "../store/globalState";
import { isTypingTarget } from "../helpers/keyboard-shortcuts/key-combos";
import { matchShortcut } from "./useKeyboardShortcuts";

/**
 * Open the keyboard shortcut list when its shortcut (`?` by default, like Stash's `?` for its manual) is pressed. Not
 * while typing in a text field.
 */
export function useShortcutListKey() {
  const { set: setGlobalState } = useGlobalState();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || !matchShortcut(e, ["show-shortcuts"])) return;
      setGlobalState("keyboardShortcutsOpen", true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setGlobalState]);
}
