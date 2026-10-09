/**
 * `?` (or the key the user gives it) opens the keyboard shortcut list from anywhere in the feed, like Stash's `?` for
 * its manual.
 *
 * @see docs/keyboard-shortcuts.md § "Where shortcuts live"
 */

import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useShortcutListKey } from "../../../src/hooks/useShortcutListKey";
import { useGlobalState } from "../../../src/store/globalState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { resetStores } from "../helpers/stores";

function Feed() {
  useShortcutListKey();
  return <input aria-label="A text field" />;
}

beforeEach(() => {
  resetStores();
});

describe("useShortcutListKey", () => {
  it("opens the keyboard shortcut list when ? is pressed", async () => {
    render(<Feed />);

    await userEvent.keyboard("?");

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(true);
  });

  it("doesn't open it for a ? typed into a text field", async () => {
    render(<Feed />);

    await userEvent.type(screen.getByRole("textbox", { name: "A text field" }), "?");

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);
  });

  it("doesn't open it for ? with Ctrl, ⌘ or Alt held", async () => {
    render(<Feed />);

    for (const modifier of ["Control", "Meta", "Alt"]) {
      await userEvent.keyboard(`{${modifier}>}?{/${modifier}}`);
    }

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);
  });

  // @see docs/keyboard-shortcuts.md § "The registry"
  it("opens it with the key the user has given it instead", async () => {
    useTvConfig.getState().set("keyboardShortcuts", { "show-shortcuts": ["h"] });
    render(<Feed />);

    await userEvent.keyboard("?");
    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);

    await userEvent.keyboard("h");
    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(true);
  });

  // @see docs/keyboard-shortcuts.md § "Changing shortcuts"
  it("doesn't open it while a shortcut's key is being recorded", async () => {
    useGlobalState.getState().set("recordingShortcut", true);
    render(<Feed />);

    await userEvent.keyboard("?");

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);
  });

  it("stops listening once unmounted", async () => {
    render(<Feed />).unmount();

    await userEvent.keyboard("?");

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);
  });
});
