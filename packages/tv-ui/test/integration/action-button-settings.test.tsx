/**
 * Action button settings forms. Buttons with options (quick tag, edit tags, volume, create marker) open a settings
 * form when added from the Settings tab, and again from the button's edit control in the Settings tab's list.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, savedTvConfig, type BootedApp } from "./helpers/harness";
import { currentSlide } from "./helpers/feed";
import { actionButtonRoot, displayedIconState } from "../helpers/actionButtons";
import type { ActionButtonIconName } from "../../src/components/action-buttons/icons";
import type { ActionButtonStackConfig } from "../../src/components/action-buttons/ActionButtonStack";

const integration = setupIntegrationTest();

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

async function stackConfig() {
  const { useTvConfig } = await import("../../src/store/tvConfig");
  return useTvConfig.getState().actionButtonStackConfig;
}

/** Every button in the stack, including those in folders */
async function stackButtons() {
  return (await stackConfig()).flatMap((config) => (config.type === "folder" ? config.contents : [config]));
}

async function setStackConfig(config: ActionButtonStackConfig[]) {
  const { useTvConfig } = await import("../../src/store/tvConfig");
  await act(async () => useTvConfig.getState().set("actionButtonStackConfig", config));
}

/** Open the Settings tab's action button settings (in its "UI" section) */
async function openActionButtonSettings() {
  const { useGlobalState } = await import("../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("showSettings", true));
  click(await screen.findByText("UI"));
  await screen.findByText("Action Buttons");
}

/** Click the Settings tab's control for adding the button with the given title */
function addButton(title: string) {
  const control = [...document.querySelectorAll<HTMLElement>(".add-action-button")].find(
    (element) => element.textContent === title
  );
  if (!control) throw new Error(`No control for adding "${title}"`);
  click(control);
}

/** Open the settings of the button with the given title in the Settings tab's list of buttons */
function editButton(title: string) {
  const item = [...document.querySelectorAll<HTMLElement>(".draggable-list-item")].find(
    (element) => !element.classList.contains("folder") && element.textContent === title
  );
  if (!item) throw new Error(`No "${title}" button in the Settings tab's list`);
  click(within(item).getByRole("button", { name: "Edit button settings" }));
}

async function settingsModal() {
  return await waitFor(() => {
    const modal = document.querySelector<HTMLElement>(".ActionButtonSettingsModal");
    if (!modal) throw new Error("Settings modal not shown");
    return modal;
  });
}

/** Choose an option in one of the modal's selects, by typing its name */
async function chooseOption(modal: HTMLElement, label: string, optionText: string) {
  const combobox = within(modal).getByLabelText(label);
  act(() => combobox.focus());
  await userEvent.keyboard(optionText);
  const listbox = await waitFor(() => {
    const element = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!element) throw new Error(`${label} options not shown`);
    return element;
  });
  click(await within(listbox).findByText(optionText));
}

/** Choose a different icon than the current one in the modal's icon select (icons have no names to choose by) */
async function chooseAnotherIcon(modal: HTMLElement) {
  const combobox = within(modal).getByLabelText("Action Button Icon");
  act(() => combobox.focus());
  await userEvent.keyboard("{ArrowDown}");
  const listbox = await waitFor(() => {
    const element = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!element) throw new Error("Icon options not shown");
    return element;
  });
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

describe("Create marker settings", () => {
  it("adds a create marker button without defaults unless they're switched on", async () => {
    const app = await bootApp();
    await openActionButtonSettings();

    addButton("Add/edit scene marker");
    const modal = await settingsModal();
    expect(within(modal).getByLabelText("Create with defaults")).not.toBeChecked();
    expect(within(modal).queryByLabelText("Primary Tag (required)")).not.toBeInTheDocument();
    click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    expect((await stackButtons()).filter((button) => button.buttonType === "create-marker")).toEqual([
      expect.objectContaining({ markerDefaults: null }),
    ]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("create-marker"));

    await app.unmount();
  });

  it("adds a create marker button with the chosen defaults", async () => {
    const app = await bootApp();
    await openActionButtonSettings();

    addButton("Add/edit scene marker");
    const modal = await settingsModal();
    click(within(modal).getByLabelText("Create with defaults"));
    await chooseOption(modal, "Primary Tag (required)", "Delta");
    await chooseOption(modal, "Tags (optional)", "Epsilon");
    click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(document.querySelector(".ActionButtonSettingsModal")).toBeNull());
    expect((await stackButtons()).filter((button) => button.buttonType === "create-marker")).toEqual([
      expect.objectContaining({ markerDefaults: expect.objectContaining({ primaryTagId: "tag-delta", tagIds: ["tag-epsilon"] }) }),
    ]);
    expect(await slideButton(app, 'Add/edit "Delta" markers')).toBeInTheDocument();
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("tag-epsilon"));

    await app.unmount();
  });

  it("won't add a create marker button with defaults but no primary tag", async () => {
    const app = await bootApp();
    await openActionButtonSettings();
    const buttonCountBefore = (await stackButtons()).length;

    addButton("Add/edit scene marker");
    const modal = await settingsModal();
    click(within(modal).getByLabelText("Create with defaults"));
    click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(within(modal).getByText(/primaryTagId is a required field/)).toBeInTheDocument());
    expect(await stackButtons()).toHaveLength(buttonCountBefore);

    await app.unmount();
  });

  it("starts a second create marker button with defaults switched on", async () => {
    const app = await bootApp();
    await setStackConfig([{ id: "marker", type: "button", buttonType: "create-marker", pinned: false, iconId: "add-marker", markerDefaults: null }]);
    await waitFor(() => expect(JSON.stringify(savedTvConfig(integration))).toContain("create-marker"));
    await openActionButtonSettings();

    addButton("Add/edit scene marker");
    const modal = await settingsModal();

    expect(within(modal).getByLabelText("Create with defaults")).toBeChecked();
    expect(within(modal).getByLabelText("Primary Tag (required)")).toBeInTheDocument();

    await app.unmount();
  });
});
