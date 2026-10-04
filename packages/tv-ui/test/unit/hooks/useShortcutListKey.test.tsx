/**
 * `?` opens the keyboard shortcut list from anywhere in the feed, like Stash's `?` for its manual.
 *
 * @see docs/keyboard-shortcuts.md § "Where shortcuts live"
 */

import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useShortcutListKey } from "../../../src/hooks/useShortcutListKey";
import { useGlobalState } from "../../../src/store/globalState";
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

  it("stops listening once unmounted", async () => {
    render(<Feed />).unmount();

    await userEvent.keyboard("?");

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);
  });
});
