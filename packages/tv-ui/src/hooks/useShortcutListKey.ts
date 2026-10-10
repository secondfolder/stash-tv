import { useEffect } from "react";
import { useGlobalState } from "../store/globalState";
import { onShortcut } from "../helpers/shortcut-actions/input";

/**
 * Open the keyboard shortcut list when its shortcut (`?` by default, like Stash's `?` for its manual) is pressed. Not
 * while typing in a text field.
 */
export function useShortcutListKey() {
  const { set: setGlobalState } = useGlobalState();
  useEffect(() => {
    return onShortcut("press", (trigger) => {
      if (trigger.match(["show-shortcuts"])) setGlobalState("keyboardShortcutsOpen", true);
    });
  }, [setGlobalState]);
}
