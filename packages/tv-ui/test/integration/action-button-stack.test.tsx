/**
 * The action button stack as a whole: folders, side panels, and buttons whose type this build doesn't know.
 *
 * @see docs/action-buttons.md § "Rendering (`ActionButtonStack`)"
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 */

import { describe, expect, it } from "vitest";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { setupIntegrationTest, bootApp, type BootedApp } from "./helpers/harness";
import { currentSlide, pinActionButtons, pinUncheckedActionButton } from "./helpers/feed";
import { displayedIconState, isSidePanelOpen } from "../helpers/actionButtons";
import type { ActionButtonStackConfig } from "../../src/components/action-buttons/ActionButtonStack";

setupIntegrationTest();

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

async function setStackConfig(config: ActionButtonStackConfig[]) {
  const { useTvConfig } = await import("../../src/store/tvConfig");
  await act(async () => useTvConfig.getState().set("actionButtonStackConfig", config));
}

function slideButton(app: BootedApp, name: string | RegExp) {
  return within(currentSlide(app)).queryByRole("button", { name });
}

/** Open side panels, wherever they are in the document */
function openSidePanels() {
  return document.querySelectorAll(".action-button-side-panel");
}

describe("Action button folders", () => {
  const twoFolders: ActionButtonStackConfig[] = [
    { id: "a", type: "folder", pinned: false, contents: [
      { id: "a.1", type: "button", buttonType: "loop", pinned: false },
      { id: "a.2", type: "button", buttonType: "letterboxing", pinned: false },
    ] },
    { id: "b", type: "folder", pinned: false, contents: [
      { id: "b.1", type: "button", buttonType: "force-landscape", pinned: false },
    ] },
  ];

  function folderButtons(app: BootedApp) {
    return within(currentSlide(app)).getAllByRole("button", { name: /folder$/ });
  }

  /** Buttons of an open folder. Its popover is portalled to the document body, outside the slide. */
  function openFolderButtonNames() {
    const popover = document.querySelector<HTMLElement>(".folder-contents-popover");
    return popover ? within(popover).getAllByRole("button").map((button) => button.textContent) : [];
  }

  it("shows a folder's buttons only once it's opened", async () => {
    const app = await bootApp();
    await setStackConfig(twoFolders);
    expect(openFolderButtonNames()).toEqual([]);

    click(folderButtons(app)[0]);

    await waitFor(() => expect(openFolderButtonNames()).toEqual(["Loop scene", "Fill screen"]));

    await app.unmount();
  });

  it("hides a folder's buttons when it's closed again", async () => {
    const app = await bootApp();
    await setStackConfig(twoFolders);
    click(folderButtons(app)[0]);
    await waitFor(() => expect(openFolderButtonNames()).not.toEqual([]));

    click(within(currentSlide(app)).getByRole("button", { name: "Close folder" }));

    await waitFor(() => expect(openFolderButtonNames()).toEqual([]));

    await app.unmount();
  });

  it("closes the open folder when another one is opened", async () => {
    const app = await bootApp();
    await setStackConfig(twoFolders);
    click(folderButtons(app)[0]);
    await waitFor(() => expect(openFolderButtonNames()).toEqual(["Loop scene", "Fill screen"]));

    click(folderButtons(app)[1]);

    await waitFor(() => expect(openFolderButtonNames()).toEqual(["Portrait"]));

    await app.unmount();
  });

  it("previews the icons of its first 4 buttons while closed", async () => {
    const app = await bootApp();
    await setStackConfig([
      { id: "a", type: "folder", pinned: false, contents: (["loop", "letterboxing", "force-landscape", "settings", "ui-visibility"] as const)
        .map((buttonType) => ({ id: buttonType, type: "button", buttonType, pinned: false })) },
    ]);

    const folder = within(currentSlide(app)).getByRole("button", { name: "Open folder" });

    expect(folder.querySelectorAll(".ActionButtonIcon")).toHaveLength(4);

    await app.unmount();
  });

  it("previews the icon chosen in a button's settings", async () => {
    const app = await bootApp();
    await setStackConfig([
      { id: "a", type: "folder", pinned: false, contents: [
        { id: "a.1", type: "button", buttonType: "quick-tag", pinned: false, tagId: "tag-delta", iconId: "star" },
      ] },
    ]);

    const folder = within(currentSlide(app)).getByRole("button", { name: "Open folder" });

    const { actionButtonIcons } = await import("../../src/components/action-buttons/icons");
    expect(await displayedIconState(folder, actionButtonIcons["star"].states)).toBe("inactive");

    await app.unmount();
  });
});

describe("Action button side panels", () => {
  it("closes the open side panel when another button opens its own", async () => {
    const app = await bootApp();
    await pinActionButtons(["rate-scene", "playback-rate"]);
    const rateButton = slideButton(app, "Rate scene");
    const playbackRateButton = slideButton(app, "Set playback rate");
    if (!rateButton || !playbackRateButton) throw new Error("Buttons not rendered");

    click(rateButton);
    await waitFor(() => expect(document.querySelector(".action-button-rating-stars")).not.toBeNull());
    click(playbackRateButton);

    // The closing panel's contents are removed once it has animated out
    await waitFor(() => expect(document.querySelector(".action-button-rating-stars")).toBeNull());
    expect(openSidePanels()).toHaveLength(1);
    expect(isSidePanelOpen()).toBe(true);

    await app.unmount();
  });
});

describe("Unknown action buttons", () => {
  // A button saved by a newer version of Stash TV sharing the same Stash server
  it("shows a warning naming the unknown button type instead of a button", async () => {
    const app = await bootApp();

    await pinUncheckedActionButton({ buttonType: "teleport" });

    await waitFor(() => expect(currentSlide(app)).toHaveTextContent('Unknown button type "teleport"'));
    const warning = currentSlide(app).querySelector(".unknown-action-button");
    expect(warning).toHaveTextContent('Unknown button: "teleport"');
    expect(slideButton(app, /teleport/)).not.toBeInTheDocument();

    await app.unmount();
  });
});
