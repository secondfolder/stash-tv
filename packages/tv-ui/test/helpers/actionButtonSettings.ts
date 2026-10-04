import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Using the Settings tab's action button settings, for their unit and integration tests alike.
 *
 * @see docs/action-buttons.md § "Settings Integration"
 */

// App modules are imported inside functions: integration tests mustn't import anything that creates an Apollo client
// before the harness has pointed the API at the mock server (see docs/testing.md § "Gotchas")

export async function stackConfig() {
  const { useTvConfig } = await import("../../src/store/tvConfig");
  return useTvConfig.getState().actionButtonStackConfig;
}

/** Every button in the stack, including those in folders */
export async function stackButtons() {
  return (await stackConfig()).flatMap((config) => (config.type === "folder" ? config.contents : [config]));
}

/** Open the Settings tab's action button settings (in its "UI" section) */
export async function openActionButtonSettings() {
  const { useGlobalState } = await import("../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("showSettings", true));
  fireEvent.click(await screen.findByText("UI"));
  await screen.findByText("Action Buttons");
}

/** Click the Settings tab's control for adding the button with the given title */
export function addButton(title: string) {
  const control = [...document.querySelectorAll<HTMLElement>(".add-action-button")].find(
    (element) => element.textContent === title
  );
  if (!control) throw new Error(`No control for adding "${title}"`);
  fireEvent.click(control);
}

/** Open the settings of the button with the given title in the Settings tab's list of buttons */
export function editButton(title: string) {
  const item = [...document.querySelectorAll<HTMLElement>(".config-list-item")].find(
    (element) => !element.classList.contains("folder") && element.textContent === title
  );
  if (!item) throw new Error(`No "${title}" button in the Settings tab's list`);
  fireEvent.click(within(item).getByRole("button", { name: "Edit button settings" }));
}

export async function settingsModal() {
  return await waitFor(() => {
    const modal = document.querySelector<HTMLElement>(".ActionButtonSettingsModal");
    if (!modal) throw new Error("Settings modal not shown");
    return modal;
  });
}

/** Wait for the settings modal to close */
export async function settingsModalClosed() {
  await waitFor(() => {
    if (document.querySelector(".ActionButtonSettingsModal")) throw new Error("Settings modal still shown");
  });
}
