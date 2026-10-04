/**
 * The edit tags action button: changing the current scene's or marker's tags in Stash, and showing them on the slide.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bootApp } from "./helpers/harness";
import { pinActionButtons, pinUncheckedActionButton, bootMarkersFeed, click, actionButton } from "./helpers/feed";
import { isSidePanelOpen, sidePanel } from "../helpers/actionButtons";
import { setupSceneActionButtonsTest, firstScene, firstMarker, serverScene, serverMarker } from "./helpers/scene-action-buttons";

setupSceneActionButtonsTest();

describe("Edit tags button", () => {
  function tagSelect() {
    return within(sidePanel()).getByRole("combobox");
  }

  function saveButton() {
    return within(sidePanel()).getByRole("button", { name: "Save" });
  }

  /** The tags shown as selected in the tag editor */
  function selectedTags() {
    return [...sidePanel().querySelectorAll(".react-select__multi-value__label")].map((tag) => tag.textContent);
  }

  it("opens an editor showing the scene's tags", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);

    click(await actionButton(app, "Edit scene/marker tags"));

    expect(selectedTags()).toEqual(["Beta"]);
    // Nothing to save until the tags change
    expect(saveButton()).toBeDisabled();

    await app.unmount();
  });

  it("saves the edited tags to the scene and closes", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);
    click(await actionButton(app, "Edit scene/marker tags"));

    // Focus rather than userEvent.click: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
    act(() => tagSelect().focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton()).toBeEnabled());
    click(saveButton());

    await waitFor(() => expect(serverScene(firstScene.id).tag_ids).toEqual([]));
    await waitFor(() => expect(isSidePanelOpen()).toBe(false));

    await app.unmount();
  });

  it("discards edits on cancel", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);
    click(await actionButton(app, "Edit scene/marker tags"));
    act(() => tagSelect().focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton()).toBeEnabled());

    click(within(sidePanel()).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(isSidePanelOpen()).toBe(false));
    expect(serverScene(firstScene.id).tag_ids).toEqual(firstScene.tagIds);

    await app.unmount();
  });

  it("offers its pinned tags for adding in one click", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: ["tag-delta", "tag-beta"] }]);
    click(await actionButton(app, "Edit scene/marker tags"));

    // The scene already has Beta, so only Delta is offered
    const pinned = await waitFor(() => {
      const element = sidePanel().querySelector<HTMLElement>(".pinned");
      if (!element) throw new Error("Pinned tags not shown");
      return element;
    });
    expect(pinned).toHaveTextContent("Delta");
    expect(pinned).not.toHaveTextContent("Beta");
    click(within(pinned).getByText("Delta"));
    click(saveButton());

    await waitFor(() => expect(serverScene(firstScene.id).tag_ids).toEqual(["tag-beta", "tag-delta"]));

    await app.unmount();
  });

  it("edits the marker's tags on a marker slide, noting its primary tag", async () => {
    serverMarker(firstMarker.id).tag_ids = ["tag-delta"];
    const app = await bootMarkersFeed();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);
    click(await actionButton(app, "Edit scene/marker tags"));

    expect(selectedTags()).toEqual(["Delta"]);
    expect(sidePanel()).toHaveTextContent(`Marker's primary tag is "Alpha".`);
    act(() => tagSelect().focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton()).toBeEnabled());
    click(saveButton());

    await waitFor(() => expect(serverMarker(firstMarker.id).tag_ids).toEqual([]));
    expect(serverMarker(firstMarker.id).primary_tag_id).toBe(firstMarker.primaryTagId);

    await app.unmount();
  });

  it("still opens the editor, without pinned tags, when its config is invalid", async () => {
    const app = await bootApp();
    await pinUncheckedActionButton({ buttonType: "edit-tags", pinnedTagIds: "tag-delta" });

    click(await actionButton(app, "Edit scene/marker tags"));

    expect(selectedTags()).toEqual(["Beta"]);
    expect(sidePanel().querySelector(".pinned")).toBeNull();

    await app.unmount();
  });
});
