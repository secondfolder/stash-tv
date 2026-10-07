/**
 * The action button stack as a whole, with buttons that need Stash's data: previewing them in a folder, and their
 * side panels, and both closing when the scene info panel opens. The rest of the stack (opening and closing folders, unknown buttons) is unit tested, in
 * test/unit/components/actionButtonStack.test.tsx.
 *
 * @see docs/action-buttons.md § "Rendering (`ActionButtonStack`)"
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 * @see docs/action-buttons.md § "Side panels"
 */

import { describe, expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { setupIntegrationTest, bootApp, type BootedApp } from "./helpers/harness";
import { currentSlide, pinActionButtons, setStackConfig, click } from "./helpers/feed";
import { displayedIconState, isSidePanelOpen } from "../helpers/actionButtons";

setupIntegrationTest();

function slideButton(app: BootedApp, name: string | RegExp) {
  return within(currentSlide(app)).queryByRole("button", { name });
}

/** Open side panels, wherever they are in the document */
function openSidePanels() {
  return document.querySelectorAll(".PopoverPanel");
}

describe("Action button folders", () => {
  // Which 4 is down to CSS, so it's covered by test/e2e/action-button-stack.test.ts

  it("doesn't preview a button that isn't shown", async () => {
    const app = await bootApp();
    // Fixture scenes have no captions, so the subtitles button isn't shown
    await setStackConfig([
      { id: "a", type: "folder", pinned: false, contents: (["subtitles", "loop"] as const)
        .map((buttonType) => ({ id: buttonType, type: "button", buttonType, pinned: false })) },
    ]);

    const folder = within(currentSlide(app)).getByRole("button", { name: "Open folder" });

    const { getActionButtonDefinition } = await import("../../src/components/action-buttons/buttons");
    expect(folder.querySelectorAll(".ActionButtonIcon")).toHaveLength(1);
    expect(await displayedIconState(folder, getActionButtonDefinition("loop").icon)).not.toBeNull();

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

describe("Opening the scene info panel", () => {
  it("closes the open side panel", async () => {
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);
    const rateButton = slideButton(app, "Rate scene");
    if (!rateButton) throw new Error("Button not rendered");
    click(rateButton);
    await waitFor(() => expect(isSidePanelOpen()).toBe(true));

    fireEvent.keyDown(document.body, { key: "i" });

    await waitFor(() => expect(isSidePanelOpen()).toBe(false));
    expect(within(currentSlide(app)).getByTestId("MediaSlide--sceneInfo").classList).toContain("active");

    await app.unmount();
  });

  it("closes the open folder, even when the button opening it is in that folder", async () => {
    const app = await bootApp();
    await setStackConfig([
      { id: "a", type: "folder", pinned: false, contents: (["show-scene-info", "loop"] as const)
        .map((buttonType) => ({ id: buttonType, type: "button", buttonType, pinned: false })) },
    ]);
    click(within(currentSlide(app)).getByRole("button", { name: "Open folder" }));
    const folderPopover = await waitFor(() => {
      const popover = document.querySelector<HTMLElement>(".folder-contents-popover");
      if (!popover) throw new Error("Folder not open");
      return popover;
    });

    click(within(folderPopover).getByRole("button", { name: "Show scene info" }));

    await waitFor(() => expect(document.querySelector(".folder-contents-popover")).toBeNull());
    expect(within(currentSlide(app)).getByTestId("MediaSlide--sceneInfo").classList).toContain("active");

    await app.unmount();
  });
});
