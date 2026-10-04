import { useEffect } from "react";
import { useGlobalState } from "../store/globalState";

/**
 * Open the keyboard shortcut list when `?` is pressed, like Stash's `?` for its manual. Not while typing in a text field,
 * or with Ctrl, ⌘ or Alt held.
 */
export function useShortcutListKey() {
  const { set: setGlobalState } = useGlobalState();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "?"
        || e.ctrlKey || e.metaKey || e.altKey
        || e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
      ) return;
      setGlobalState("keyboardShortcutsOpen", true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setGlobalState]);
}
