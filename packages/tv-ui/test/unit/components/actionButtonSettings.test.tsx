/**
 * Action button settings forms. Buttons with options open a settings form when added from the Settings tab, and again
 * from the button's edit control in the Settings tab's list. Forms where a tag is chosen from Stash's are covered by
 * the integration tests.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsTab from "../../../src/components/settings/SettingsTab";
import { useTvConfig } from "../../../src/store/tvConfig";
import {
  addButton,
  editButton,
  openActionButtonSettings,
  settingsModal,
  settingsModalClosed,
  stackButtons,
} from "../../helpers/actionButtonSettings";
import { renderOnSlide } from "../helpers/render";
import { resetStores } from "../helpers/stores";

beforeEach(async () => {
  resetStores();
  renderOnSlide(<SettingsTab />);
  await openActionButtonSettings();
});

describe("Quick tag settings", () => {
  it("won't add a quick tag button without a tag", async () => {
    const buttonCountBefore = (await stackButtons()).length;
    addButton("Add tag to scene/marker");
    const modal = await settingsModal();

    await userEvent.click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(modal).toHaveTextContent("tagId is a required field"));
    expect(document.querySelector(".ActionButtonSettingsModal")).not.toBeNull();
    expect(await stackButtons()).toHaveLength(buttonCountBefore);
  });
});

describe("Volume settings", () => {
  it("turns on full volume control", async () => {
    editButton("Volume");
    const modal = await settingsModal();

    await userEvent.click(within(modal).getByLabelText("Full volume control"));
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await settingsModalClosed();
    expect((await stackButtons()).filter((button) => button.buttonType === "volume")).toEqual([
      expect.objectContaining({ fullControl: true }),
    ]);
  });
});

describe("Change channel settings", () => {
  it("switches the default change channel button to cycling through channels", async () => {
    editButton("Change channel");
    const modal = await settingsModal();

    await userEvent.click(within(modal).getByLabelText("Cycle through channels"));
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await settingsModalClosed();
    expect((await stackButtons()).filter((button) => button.buttonType === "change-channel")).toEqual([
      expect.objectContaining({ cycle: true }),
    ]);
  });
});

describe("Create marker settings", () => {
  it("adds a create marker button without defaults unless they're switched on", async () => {
    addButton("Add/edit scene marker");
    const modal = await settingsModal();
    expect(within(modal).getByLabelText("Create with defaults")).not.toBeChecked();
    expect(within(modal).queryByLabelText("Primary Tag (required)")).not.toBeInTheDocument();

    await userEvent.click(within(modal).getByRole("button", { name: "Add" }));

    await settingsModalClosed();
    expect((await stackButtons()).filter((button) => button.buttonType === "create-marker")).toEqual([
      expect.objectContaining({ markerDefaults: null }),
    ]);
  });

  it("won't add a create marker button with defaults but no primary tag", async () => {
    const buttonCountBefore = (await stackButtons()).length;
    addButton("Add/edit scene marker");
    const modal = await settingsModal();
    await userEvent.click(within(modal).getByLabelText("Create with defaults"));

    await userEvent.click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(within(modal).getByText(/primaryTagId is a required field/)).toBeInTheDocument());
    expect(await stackButtons()).toHaveLength(buttonCountBefore);
  });

  it("starts a second create marker button with defaults switched on", async () => {
    act(() => useTvConfig.getState().set("actionButtonStackConfig", [
      { id: "marker", type: "button", buttonType: "create-marker", pinned: false, iconId: "add-marker", markerDefaults: null },
    ]));

    addButton("Add/edit scene marker");
    const modal = await settingsModal();

    expect(within(modal).getByLabelText("Create with defaults")).toBeChecked();
    expect(within(modal).getByLabelText("Primary Tag (required)")).toBeInTheDocument();
  });
});
