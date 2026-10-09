/**
 * Keys changed in the settings work in the feed straight away, in place of the old ones, and sequences of keys work
 * in the feed. (The settings themselves are
 * unit tested, in test/unit/components/keyboardShortcutSettings.test.tsx.)
 *
 * @see docs/keyboard-shortcuts.md § "Changing shortcuts"
 * @see docs/keyboard-shortcuts.md § "Matching"
 */

import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp } from "./helpers/harness";
import { bootWithTvConfig, click, tvConfig } from "./helpers/feed";

setupIntegrationTest();

/** The keyboard shortcut settings' row for muting */
function muteSettingRow() {
  const row = screen.getByText("Mute/unmute", { selector: ".shortcut-title" }).closest("li");
  if (!row) throw new Error("No settings row for muting");
  return row;
}

describe("Changing keyboard shortcuts", () => {
  it("mutes with a key given in the settings, and not with the key taken away", async () => {
    const app = await bootApp();
    expect((await tvConfig()).volume).toBe(0);

    click(screen.getByText("Keyboard Shortcuts", { selector: "h3 span" }));
    // Queried within the shortcut's row: role queries over the whole app are slow
    const muteRow = muteSettingRow();
    click(within(muteRow).getByRole("button", { name: 'Remove m from "Mute/unmute"' }));
    click(within(muteRow).getByRole("button", { name: 'Add a key for "Mute/unmute"' }));
    const palette = await screen.findByRole("dialog", { name: 'Shortcut for "Mute/unmute"' });
    await waitFor(() => expect(within(palette).getByRole("textbox")).toHaveFocus());
    await userEvent.keyboard("{Shift>}M{/Shift}");
    click(within(palette).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(palette).not.toBeInTheDocument());
    // The settings' buttons would otherwise have focus, which is fine for shortcuts but not like using the feed
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    await userEvent.keyboard("m");
    expect((await tvConfig()).volume).toBe(0);

    await userEvent.keyboard("{Shift>}M{/Shift}");
    await waitFor(async () => expect((await tvConfig()).volume).toBe(1));

    await app.unmount();
  });

  // @see docs/keyboard-shortcuts.md § "Key sequences"
  it("mutes with a sequence of keys, and not with its first key alone", async () => {
    const app = await bootWithTvConfig((tvConfig) => tvConfig.set("keyboardShortcuts", { "toggle-mute": ["g m"] }));

    await userEvent.keyboard("m");
    await userEvent.keyboard("g");
    expect((await tvConfig()).volume).toBe(0);

    await userEvent.keyboard("m");
    await waitFor(async () => expect((await tvConfig()).volume).toBe(1));

    await app.unmount();
  });

  it("opens the settings at the keyboard shortcuts from the shortcut list", async () => {
    const app = await bootApp();

    await userEvent.keyboard("?");
    const dialog = await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });
    click(within(dialog).getByRole("button", { name: "Edit shortcuts" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Keyboard Shortcuts" })).not.toBeInTheDocument());
    const { useGlobalState } = await import("../../src/store/globalState");
    expect(useGlobalState.getState().showSettings).toBe(true);
    expect(screen.getByRole("button", { name: "Keyboard Shortcuts" })).toHaveAttribute("aria-expanded", "true");

    await app.unmount();
  });
});
