/**
 * Action button settings forms. Buttons with options (quick tag, edit tags, volume, change channel, create marker) open a settings
 * form when added from the Settings tab, and again from the button's edit control in the Settings tab's list.
 *
 * The create marker button's settings are tested in a file of their own, so they run in parallel.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp, savedTvConfig } from "./helpers/harness";
import { actionButtonRoot, displayedIconState } from "../helpers/actionButtons";
import { setupActionButtonSettingsTest, click, stackConfig, stackButtons, setStackConfig, openActionButtonSettings, addButton, editButton, settingsModal, chooseOption, chooseAnotherIcon, loadActionButtonIcons, isIconName, slideButton } from "./helpers/action-button-settings";

const integration = setupActionButtonSettingsTest();

describe("Quick tag settings", () => {
  it("adds a quick tag button for the chosen tag and icon", async () => {
    const app = await bootApp();
    await openActionButtonSettings();

    addButton("Add tag to scene/marker");
    const modal = await settingsModal();
    expect(modal).toHaveTextContent("Add Add tag to scene/marker Action Button");
    await chooseOption(modal, "Tag to add (required)", "Delta");
    await chooseAnotherIcon(modal);
    click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    const added = (await stackButtons()).find((button) => button.buttonType === "quick-tag");
    expect(added).toMatchObject({ tagId: "tag-delta" });
    const iconId = added && "iconId" in added ? added.iconId : undefined;
    const icons = await loadActionButtonIcons();
    if (!isIconName(iconId, icons)) throw new Error(`Saved icon "${String(iconId)}" isn't a known icon`);
    expect(iconId).not.toBe("add-tag");
    const button = await slideButton(app, 'Add "Delta" to scene/marker');
    expect(await displayedIconState(actionButtonRoot(button), icons[iconId].states)).toBe("inactive");
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-delta"));

    await app.unmount();
  });

  it("won't add a quick tag button without a tag", async () => {
    const app = await bootApp();
    await openActionButtonSettings();
    const buttonCountBefore = (await stackButtons()).length;

    addButton("Add tag to scene/marker");
    const modal = await settingsModal();
    click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(modal).toHaveTextContent("tagId is a required field"));
    expect(document.querySelector(".ActionButtonSettingsModal")).not.toBeNull();
    expect(await stackButtons()).toHaveLength(buttonCountBefore);

    await app.unmount();
  });

  it("changes an existing quick tag button's tag", async () => {
    const app = await bootApp();
    await setStackConfig([{ id: "quick", type: "button", buttonType: "quick-tag", pinned: false, iconId: "add-tag", tagId: "tag-alpha" }]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-alpha"));
    await openActionButtonSettings();

    editButton('Add "Alpha" to scene/marker');
    const modal = await settingsModal();
    expect(modal).toHaveTextContent("Edit");
    await chooseOption(modal, "Tag to add (required)", "Delta");
    click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    expect(await stackConfig()).toEqual([expect.objectContaining({ id: "quick", tagId: "tag-delta" })]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-delta"));

    await app.unmount();
  });

  it("adds nothing when cancelled", async () => {
    const app = await bootApp();
    await openActionButtonSettings();
    const stackBefore = await stackConfig();

    addButton("Add tag to scene/marker");
    const modal = await settingsModal();
    await chooseOption(modal, "Tag to add (required)", "Delta");
    click(within(modal).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    expect(await stackConfig()).toEqual(stackBefore);

    await app.unmount();
  });
});

describe("Edit tags settings", () => {
  it("saves the pinned tags of the edit tags button, even inside a folder", async () => {
    const app = await bootApp();
    // The default stack has the edit tags button in a folder
    expect((await stackConfig()).some((config) => config.type === "folder" && config.contents.some((button) => button.buttonType === "edit-tags"))).toBe(true);
    await openActionButtonSettings();

    editButton("Edit scene/marker tags");
    const modal = await settingsModal();
    await chooseOption(modal, "Pinned Tags (optional)", "Delta");
    click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    const editTagsButtons = (await stackButtons()).filter((button) => button.buttonType === "edit-tags");
    expect(editTagsButtons).toEqual([expect.objectContaining({ pinnedTagIds: ["tag-delta"] })]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-delta"));

    await app.unmount();
  });
});

describe("Volume settings", () => {
  it("turns on full volume control", async () => {
    const app = await bootApp();
    await openActionButtonSettings();

    editButton("Volume");
    const modal = await settingsModal();
    click(within(modal).getByLabelText("Full volume control"));
    click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    expect((await stackButtons()).filter((button) => button.buttonType === "volume")).toEqual([
      expect.objectContaining({ fullControl: true }),
    ]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain('"fullControl":true'));

    await app.unmount();
  });
});

describe("Change channel settings", () => {
  it("switches the default change channel button to cycling through channels", async () => {
    const app = await bootApp();
    await openActionButtonSettings();

    editButton("Change channel");
    const modal = await settingsModal();
    click(within(modal).getByLabelText("Cycle through channels"));
    click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    expect((await stackButtons()).filter((button) => button.buttonType === "change-channel")).toEqual([
      expect.objectContaining({ cycle: true }),
    ]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain('"cycle":true'));

    await app.unmount();
  });
});
