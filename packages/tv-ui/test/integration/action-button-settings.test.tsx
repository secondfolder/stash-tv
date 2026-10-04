/**
 * Action button settings forms where a tag is chosen from Stash's: quick tag, edit tags, and create marker with
 * defaults. The rest of the forms (and choosing no tag) is unit tested, in
 * test/unit/components/actionButtonSettings.test.tsx.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp, savedTvConfig, setupIntegrationTest, type BootedApp } from "./helpers/harness";
import { actionButtonRoot, displayedIconState } from "../helpers/actionButtons";
import {
  addButton,
  editButton,
  openActionButtonSettings,
  settingsModal,
  settingsModalClosed,
  stackButtons,
  stackConfig,
} from "../helpers/actionButtonSettings";
import { click, currentSlide, setStackConfig } from "./helpers/feed";
import { chooseSelectOption, openSelectMenu } from "../helpers/selects";
import type { ActionButtonIconName } from "../../src/components/action-buttons/icons";

const integration = setupIntegrationTest();

/** Choose an option in one of the modal's selects, by typing its name */
async function chooseOption(modal: HTMLElement, label: string, optionText: string) {
  await chooseSelectOption(within(modal).getByLabelText(label), optionText);
}

/** Choose a different icon than the current one in the modal's icon select (icons have no names to choose by) */
async function chooseAnotherIcon(modal: HTMLElement) {
  const listbox = await openSelectMenu(within(modal).getByLabelText("Action Button Icon"));
  const otherOption = within(listbox)
    .getAllByRole("option")
    .find((option) => option.getAttribute("aria-selected") !== "true");
  if (!otherOption) throw new Error("No other icon to choose");
  click(otherOption);
}

// Imported after boot: see docs/testing.md § "Gotchas" (importing app code at the top of an integration test)
async function loadActionButtonIcons() {
  return (await import("../../src/components/action-buttons/icons")).actionButtonIcons;
}

function isIconName(name: unknown, icons: Record<ActionButtonIconName, unknown>): name is ActionButtonIconName {
  return typeof name === "string" && name in icons;
}

function slideButton(app: BootedApp, name: string) {
  return within(currentSlide(app)).findByRole("button", { name });
}

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

    await settingsModalClosed();
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

    await settingsModalClosed();
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

    await settingsModalClosed();
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

    await settingsModalClosed();
    const editTagsButtons = (await stackButtons()).filter((button) => button.buttonType === "edit-tags");
    expect(editTagsButtons).toEqual([expect.objectContaining({ pinnedTagIds: ["tag-delta"] })]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-delta"));

    await app.unmount();
  });
});

describe("Create marker settings", () => {
  it("adds a create marker button with the chosen defaults", async () => {
    const app = await bootApp();
    await openActionButtonSettings();

    addButton("Add/edit scene marker");
    const modal = await settingsModal();
    click(within(modal).getByLabelText("Create with defaults"));
    await chooseOption(modal, "Primary Tag (required)", "Delta");
    await chooseOption(modal, "Tags (optional)", "Epsilon");
    click(within(modal).getByRole("button", { name: "Add" }));

    await settingsModalClosed();
    expect((await stackButtons()).filter((button) => button.buttonType === "create-marker")).toEqual([
      expect.objectContaining({ markerDefaults: expect.objectContaining({ primaryTagId: "tag-delta", tagIds: ["tag-epsilon"] }) }),
    ]);
    expect(await slideButton(app, 'Add/edit "Delta" markers')).toBeInTheDocument();
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-epsilon"));

    await app.unmount();
  });
});
