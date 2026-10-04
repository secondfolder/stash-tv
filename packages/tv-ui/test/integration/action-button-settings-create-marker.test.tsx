/**
 * The create marker action button's settings form, opened when it's added from the Settings tab and from its edit
 * control in the Settings tab's list.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp, savedTvConfig } from "./helpers/harness";
import { setupActionButtonSettingsTest, stackButtons, openActionButtonSettings, addButton, settingsModal, chooseOption, slideButton } from "./helpers/action-button-settings";
import { setStackConfig, click } from "./helpers/feed";

const integration = setupActionButtonSettingsTest();

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
