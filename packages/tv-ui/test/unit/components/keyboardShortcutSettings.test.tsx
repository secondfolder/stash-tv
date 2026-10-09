/**
 * The keyboard shortcut settings: adding and changing an action's keys by typing them into a command palette (one
 * after another for a sequence), removing them and resetting them.
 *
 * @see docs/keyboard-shortcuts.md § "Changing shortcuts"
 */

import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { KeyboardShortcutSettings } from "../../../src/components/settings/KeyboardShortcutSettings";
import { useShortcutListKey } from "../../../src/hooks/useShortcutListKey";
import { useGlobalState } from "../../../src/store/globalState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { WithStashConfiguration } from "../helpers/render";
import { resetStores } from "../helpers/stores";

beforeEach(() => {
  resetStores();
});

/** The settings, with the shortcut list's key listening as it does in the feed */
function Settings() {
  useShortcutListKey();
  return <KeyboardShortcutSettings />;
}

function renderSettings() {
  render(<Settings />, { wrapper: WithStashConfiguration });
}

/** The settings' row for an action, by its title */
function row(title: string) {
  const item = screen.getAllByRole("listitem").find((listItem) => within(listItem).queryByText(title));
  if (!item) throw new Error(`No shortcut row "${title}"`);
  return item;
}

const keys = (title: string) => within(row(title)).queryAllByRole("button", { name: /^Remove / })
  .map((button) => button.getAttribute("aria-label")?.match(/^Remove (.*) from /)?.[1]);

/** The palette typing an action's keys, once it's open and taking keys */
async function palette(title: string) {
  const dialog = await screen.findByRole("dialog", { name: `Shortcut for "${title}"` });
  await waitFor(() => expect(within(dialog).getByRole("textbox")).toHaveFocus());
  return dialog;
}

async function openToAdd(title: string) {
  await userEvent.click(within(row(title)).getByRole("button", { name: `Add a key for "${title}"` }));
  return palette(title);
}

async function done(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("Keyboard shortcut settings", () => {
  it("opens a palette to type the keys in with +", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");

    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^Type shortcut to mute\/unmute$/);
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeDisabled();
  });

  it("keeps an action's acronym in capitals in the placeholder", async () => {
    renderSettings();

    const dialog = await openToAdd("Toggle CRT effect");

    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^Type shortcut to toggle CRT effect$/);
  });

  it("gives an action every key typed, with its modifiers, as a sequence", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");
    await userEvent.keyboard("{Shift>}G{/Shift}u");
    expect(within(dialog).getByRole("textbox")).toHaveTextContent("Shift + g then u");
    await done(dialog);

    expect(keys("Mute/unmute")).toEqual(["m", "Shift + g u"]);
    expect(useTvConfig.getState().keyboardShortcuts["toggle-mute"]).toEqual(["m", "Shift+g u"]);
  });

  // @see docs/keyboard-shortcuts.md § "Key combos"
  it("records a key pressed while holding the one before as a chord with it", async () => {
    renderSettings();

    const dialog = await openToAdd("Toggle looping");
    await userEvent.keyboard("{g>}x{/g}");
    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^g \+ x$/);
    await userEvent.keyboard("u");
    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^g \+ x then u$/);
    await done(dialog);

    expect(keys("Toggle looping")).toEqual(["l", "g + x u"]);
  });

  it("shows keys pressed together joined by a + that isn't spaced out like a key", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g+m"] });
    renderSettings();

    expect(within(row("Mute/unmute")).getByRole("button", { name: 'Change g + m for "Mute/unmute"' }))
      .toHaveTextContent(/^g\+m$/);
  });

  // @see docs/keyboard-shortcuts.md § "The registry"
  it("shows the seek speed's keys as pressed while holding a seek key, following the seek keys", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "seek-forwards": ["l"] });
    renderSettings();

    expect(within(row("Speed up while rewinding/fast forwarding"))
      .getByRole("button", { name: 'Change ↑ for "Speed up while rewinding/fast forwarding"' }))
      .toHaveTextContent(/^\{←\/l\}\+↑$/);
  });

  it("hides the seek speed's shortcuts while there are no seek keys to hold", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "seek-backwards": [], "seek-forwards": [] });
    renderSettings();

    expect(screen.queryByText("Speed up while rewinding/fast forwarding")).not.toBeInTheDocument();
    expect(screen.queryByText("Slow down while rewinding/fast forwarding")).not.toBeInTheDocument();
  });

  it("shows the seek speed's shortcuts with just one seek key, held with that one", () => {
    useTvConfig.getState().set("keyboardShortcuts", { "seek-backwards": [] });
    renderSettings();

    expect(within(row("Speed up while rewinding/fast forwarding"))
      .getByRole("button", { name: 'Change ↑ for "Speed up while rewinding/fast forwarding"' }))
      .toHaveTextContent(/^\{→\}\+↑$/);
  });

  it("shows the seek speed's held seek key as a fixed key before those typed, once any are, and doesn't record it", async () => {
    renderSettings();

    const dialog = await openToAdd("Speed up while rewinding/fast forwarding");
    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^Type shortcut/);
    // Holding a seek key while typing, as when using the shortcut
    await userEvent.keyboard("{ArrowRight>}u{/ArrowRight}");

    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^\{←\/→\}\+u$/);
    expect(within(dialog).getAllByRole("button", { name: /^Remove / }).map((button) => button.getAttribute("aria-label")))
      .toEqual(["Remove u"]);
  });

  it("doesn't count a modifier pressed on its own as a key", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");
    await userEvent.keyboard("{Control}");

    expect(within(dialog).getByRole("textbox")).toHaveTextContent("Type shortcut");
  });

  it("closes with Cancel, changing nothing", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");
    await userEvent.keyboard("gx");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(keys("Mute/unmute")).toEqual(["m"]);
    expect(useTvConfig.getState().keyboardShortcuts).toEqual({});
  });

  it("removes a key typed when it's clicked, carrying on typing after it", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");
    await userEvent.keyboard("gxu");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove x" }));
    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^g then u$/);
    expect(within(dialog).getByRole("textbox")).toHaveFocus();
    await userEvent.keyboard("m");
    await done(dialog);

    expect(keys("Mute/unmute")).toEqual(["m", "g u m"]);
  });

  it("closes with Escape, changing nothing", async () => {
    renderSettings();

    await openToAdd("Mute/unmute");
    await userEvent.keyboard("g{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(keys("Mute/unmute")).toEqual(["m"]);
    expect(useTvConfig.getState().keyboardShortcuts).toEqual({});
  });

  it("moves to the palette's buttons with Tab, rather than taking it as a key", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");
    await userEvent.keyboard("g");
    await userEvent.tab();

    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^g$/);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("keeps Tab within the palette, going round its controls rather than to the page behind", async () => {
    renderSettings();

    const dialog = await openToAdd("Mute/unmute");
    await userEvent.keyboard("g");
    const textbox = within(dialog).getByRole("textbox");

    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Done" })).toHaveFocus();
    await userEvent.tab();
    expect(textbox).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Done" })).toHaveFocus();
  });

  it("doesn't let the keys typed trigger their shortcuts", async () => {
    renderSettings();

    const dialog = await openToAdd("Toggle looping");
    expect(useGlobalState.getState().recordingShortcut).toBe(true);
    await userEvent.keyboard("?");

    expect(useGlobalState.getState().keyboardShortcutsOpen).toBe(false);
    await done(dialog);
    expect(useGlobalState.getState().recordingShortcut).toBe(false);
  });

  it("changes a sequence clicked, starting from its keys", async () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g u", "m"] });
    renderSettings();

    await userEvent.click(within(row("Mute/unmute")).getByRole("button", { name: 'Change g u for "Mute/unmute"' }));
    const dialog = await palette("Mute/unmute");
    expect(within(dialog).getByRole("textbox")).toHaveTextContent("g then u");
    await userEvent.keyboard("x");
    await done(dialog);

    expect(keys("Mute/unmute")).toEqual(["g u x", "m"]);
  });

  // @see docs/keyboard-shortcuts.md § "Matching"
  it("warns about keys that would clash as they're typed, and takes them away on Done", async () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g m"] });
    renderSettings();

    const dialog = await openToAdd("Toggle looping");
    await userEvent.keyboard("g");
    expect(within(dialog).getByRole("status")).toHaveTextContent('The "g m" shortcut for "Mute/unmute" will be removed as it starts with the same key.');
    expect(within(dialog).getByRole("button", { name: "Done" })).toHaveClass("btn-warning");
    expect(useTvConfig.getState().keyboardShortcuts["toggle-mute"]).toEqual(["g m"]);
    await done(dialog);

    expect(keys("Toggle looping")).toEqual(["l", "g"]);
    expect(keys("Mute/unmute")).toEqual([]);
    expect(within(row("Toggle looping")).getByRole("status"))
      .toHaveTextContent('The "g m" shortcut for "Mute/unmute" was removed as it starts with the same key.');
  });

  it("says how many keys a shortcut to be removed starts with", async () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["g m"] });
    renderSettings();

    const dialog = await openToAdd("Toggle looping");
    await userEvent.keyboard("gmx");

    expect(within(dialog).getByRole("status"))
      .toHaveTextContent('The "g m" shortcut for "Mute/unmute" will be removed as it starts with the same keys.');
  });

  it("takes a key from the action that had it", async () => {
    renderSettings();

    const dialog = await openToAdd("Toggle looping");
    await userEvent.keyboard("m");
    expect(within(dialog).getByRole("status")).toHaveTextContent('The "m" shortcut for "Mute/unmute" will be removed as it uses the same key.');
    await done(dialog);

    expect(keys("Toggle looping")).toEqual(["l", "m"]);
    expect(keys("Mute/unmute")).toEqual([]);
  });

  // @see docs/keyboard-shortcuts.md § "Rating shortcuts"
  it("shows the rating's digits after its keys, as part of them", async () => {
    useGlobalState.getState().set("ratingSystem", RatingSystemType.Decimal);
    renderSettings();

    expect(within(row("Rate")).getByRole("button", { name: 'Change r for "Rate"' }))
      .toHaveTextContent(/^r \{0-9\} \{0-9\}$/);
  });

  it("shows the rating's digits as fixed keys after those typed, once any are", async () => {
    useGlobalState.getState().set("ratingSystem", RatingSystemType.Decimal);
    renderSettings();

    const dialog = await openToAdd("Rate");
    expect(within(dialog).queryByText("{0-9}")).not.toBeInTheDocument();
    await userEvent.keyboard("g");

    expect(within(dialog).getByRole("textbox")).toHaveTextContent(/^g then \{0-9\} then \{0-9\}$/);
    // Only the key typed can be removed
    expect(within(dialog).getAllByRole("button", { name: /^Remove / }).map((button) => button.getAttribute("aria-label")))
      .toEqual(["Remove g"]);
    await done(dialog);
    expect(keys("Rate")).toEqual(["r", "g"]);
  });

  it("removes a key with its ×, turning off an action left with none", async () => {
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: 'Remove m from "Mute/unmute"' }));

    expect(keys("Mute/unmute")).toEqual([]);
    expect(useTvConfig.getState().keyboardShortcuts["toggle-mute"]).toEqual([]);
  });

  it("resets a changed action to its default keys", async () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["u"], "delete": [] });
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: 'Reset "Mute/unmute" to default' }));

    expect(keys("Mute/unmute")).toEqual(["m"]);
    expect(useTvConfig.getState().keyboardShortcuts).toEqual({ "delete": [] });
  });

  it("resets every action with Reset all to default", async () => {
    useTvConfig.getState().set("keyboardShortcuts", { "toggle-mute": ["u"], "delete": [] });
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Reset all to default" }));

    expect(keys("Mute/unmute")).toEqual(["m"]);
    expect(keys("Delete scene/marker")).toEqual(["d"]);
    expect(screen.queryByRole("button", { name: "Reset all to default" })).not.toBeInTheDocument();
  });

  it("warns about keys that clash, as when Stash's rating system changes", () => {
    // r 0 unsets star ratings, but starts a decimal rating of 10.0
    useTvConfig.getState().set("keyboardShortcuts", { "unset-rating": ["r 0", "u"] });
    useGlobalState.getState().set("ratingSystem", RatingSystemType.Decimal);
    renderSettings();

    expect(within(row("Unset rating")).getByText(
      'r 0 starts r {0-9} {0-9} ("Rate"), so one of them needs changing.'
    )).toBeInTheDocument();
  });
});
