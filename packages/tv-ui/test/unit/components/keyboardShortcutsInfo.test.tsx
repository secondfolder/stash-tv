/**
 * The keyboard shortcut list shows the user's own keys, only for Stash's configured rating system, and links to the
 * settings for changing them.
 *
 * @see docs/keyboard-shortcuts.md § "Help text"
 */

import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingStarPrecision, RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { KeyboardShortcutsInfo } from "../../../src/components/settings/KeyboardShortcutsInfo";
import { shortcutHelpMarkdown } from "../../../src/components/settings/KeyboardShortcutsInfo/help-text";
import { resolveShortcutBindings } from "../../../src/helpers/keyboard-shortcuts/definitions";
import { useGlobalState } from "../../../src/store/globalState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { useSyncRatingSystem } from "../../../src/hooks/useKeyboardShortcuts";
import { freshStashConfiguration, WithStashConfiguration } from "../helpers/render";
import { resetStores } from "../helpers/stores";

// Assertions key off the shortcut sequences (each row's first cell) so rewording a description doesn't break them
const STAR_ROWS = ["| `r {1-5}` |", "| `r 0` |"];
const DECIMAL_ROWS = ["| `r {0-9} {0-9}` |", "| `` r ` `` |"];

beforeEach(() => {
  resetStores();
});

/** The shortcut list, with Stash's rating system kept in step as the feed does */
function ShortcutList() {
  useSyncRatingSystem();
  return <KeyboardShortcutsInfo show onHide={() => {}} />;
}

describe("keyboard shortcut help text", () => {
  it("shows only star rating shortcuts when Stash uses stars", () => {
    const help = shortcutHelpMarkdown(resolveShortcutBindings({}, RatingSystemType.Stars), RatingSystemType.Stars);
    for (const row of STAR_ROWS) expect(help).toContain(row);
    for (const row of DECIMAL_ROWS) expect(help).not.toContain(row);
  });

  it("shows only decimal rating shortcuts when Stash uses decimal", () => {
    const help = shortcutHelpMarkdown(resolveShortcutBindings({}, RatingSystemType.Decimal), RatingSystemType.Decimal);
    for (const row of DECIMAL_ROWS) expect(help).toContain(row);
    for (const row of STAR_ROWS) expect(help).not.toContain(row);
  });

  it("shows the user's keys", () => {
    const help = shortcutHelpMarkdown(
      resolveShortcutBindings({ "toggle-mute": ["Shift+m", "g u"], "rate": ["g r"] }, RatingSystemType.Stars),
      RatingSystemType.Stars,
    );

    expect(help).toContain("| `Shift + m` or `g u` | Mute/unmute |");
    expect(help).toContain("| `g r {1-5}` |");
  });

  it("leaves out a shortcut with no keys", () => {
    const help = shortcutHelpMarkdown(resolveShortcutBindings({ "toggle-mute": [] }, RatingSystemType.Stars), RatingSystemType.Stars);

    expect(help).not.toContain("Mute/unmute");
  });
});

describe("KeyboardShortcutsInfo", () => {
  it("renders the help text, defaulting to star ratings when Stash has no rating config", async () => {
    // A fresh install has no rating config
    render(<ShortcutList />, { wrapper: WithStashConfiguration });

    expect(await screen.findByText("r {1-5}")).toBeInTheDocument();
    expect(screen.queryByText("r {0-9} {0-9}")).not.toBeInTheDocument();
  });

  it("shows decimal rating shortcuts when Stash uses decimal ratings", async () => {
    const configuration = {
      ...freshStashConfiguration,
      ui: { ...freshStashConfiguration.ui, ratingSystemOptions: { type: RatingSystemType.Decimal, starPrecision: RatingStarPrecision.Full } },
    };
    render(<ShortcutList />, {
      wrapper: ({ children }) => <WithStashConfiguration configuration={configuration}>{children}</WithStashConfiguration>,
    });

    expect(await screen.findByText("r {0-9} {0-9}")).toBeInTheDocument();
    expect(screen.queryByText("r {1-5}")).not.toBeInTheDocument();
  });

  it("shows a key the user changes while it's open", async () => {
    render(<KeyboardShortcutsInfo show onHide={() => {}} />, { wrapper: WithStashConfiguration });
    await screen.findByText("r {1-5}");

    useTvConfig.getState().set("keyboardShortcuts", { "rate": ["g"] });

    expect(await screen.findByText("g {1-5}")).toBeInTheDocument();
  });

  // @see docs/keyboard-shortcuts.md § "Changing shortcuts"
  it("opens the settings at the keyboard shortcuts when Edit shortcuts is pressed", async () => {
    useGlobalState.getState().set("keyboardShortcutsOpen", true);
    render(
      <KeyboardShortcutsInfo show onHide={() => useGlobalState.getState().set("keyboardShortcutsOpen", false)} />,
      { wrapper: WithStashConfiguration },
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit shortcuts" }));

    const state = useGlobalState.getState();
    expect(state.keyboardShortcutsOpen).toBe(false);
    expect(state.showSettings).toBe(true);
    expect(state.settingsSection).toBe("keyboard-shortcuts");
  });
});
