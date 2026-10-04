import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, type BootedApp } from "./harness";
import { currentSlide } from "./feed";
import type { ActionButtonIconName } from "../../../src/components/action-buttons/icons";
import type { ActionButtonStackConfig } from "../../../src/components/action-buttons/ActionButtonStack";

/**
 * Helpers for the action button settings forms' tests, which are split across files so they run in parallel.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a test file for these tests against the mock server (call it at the top of the file) */
export function setupActionButtonSettingsTest() {
  integration = setupIntegrationTest();
  return integration;
}

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
export function click(element: HTMLElement) {
  fireEvent.click(element);
}

export async function stackConfig() {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  return useTvConfig.getState().actionButtonStackConfig;
}

/** Every button in the stack, including those in folders */
export async function stackButtons() {
  return (await stackConfig()).flatMap((config) => (config.type === "folder" ? config.contents : [config]));
}

export async function setStackConfig(config: ActionButtonStackConfig[]) {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  await act(async () => useTvConfig.getState().set("actionButtonStackConfig", config));
}

/** Open the Settings tab's action button settings (in its "UI" section) */
export async function openActionButtonSettings() {
  const { useGlobalState } = await import("../../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("showSettings", true));
  click(await screen.findByText("UI"));
  await screen.findByText("Action Buttons");
}

/** Click the Settings tab's control for adding the button with the given title */
export function addButton(title: string) {
  const control = [...document.querySelectorAll<HTMLElement>(".add-action-button")].find(
    (element) => element.textContent === title
  );
  if (!control) throw new Error(`No control for adding "${title}"`);
  click(control);
}

/** Open the settings of the button with the given title in the Settings tab's list of buttons */
export function editButton(title: string) {
  const item = [...document.querySelectorAll<HTMLElement>(".config-list-item")].find(
    (element) => !element.classList.contains("folder") && element.textContent === title
  );
  if (!item) throw new Error(`No "${title}" button in the Settings tab's list`);
  click(within(item).getByRole("button", { name: "Edit button settings" }));
}

export async function settingsModal() {
  return await waitFor(() => {
    const modal = document.querySelector<HTMLElement>(".ActionButtonSettingsModal");
    if (!modal) throw new Error("Settings modal not shown");
    return modal;
  });
}

/** Choose an option in one of the modal's selects, by typing its name */
export async function chooseOption(modal: HTMLElement, label: string, optionText: string) {
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
export async function chooseAnotherIcon(modal: HTMLElement) {
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
export async function loadActionButtonIcons() {
  return (await import("../../../src/components/action-buttons/icons")).actionButtonIcons;
}

export function isIconName(name: unknown, icons: Record<ActionButtonIconName, unknown>): name is ActionButtonIconName {
  return typeof name === "string" && name in icons;
}

export function slideButton(app: BootedApp, name: string) {
  return within(currentSlide(app)).findByRole("button", { name });
}
