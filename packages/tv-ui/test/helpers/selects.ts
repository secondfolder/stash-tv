import { act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Driving the react-select dropdowns that Stash's forms (and ours, built on them) use. A select's input is its
 * `combobox`, and its menu's listbox is the element its `aria-controls` names, shown once it opens.
 */

/** Type into a select, focusing it first, and return its menu's listbox once it's shown */
export async function typeIntoSelect(combobox: HTMLElement, keys: string) {
  act(() => combobox.focus());
  await userEvent.keyboard(keys);
  return await waitFor(() => {
    const listbox = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!listbox) throw new Error(`The options of the select "${combobox.id}" aren't shown`);
    return listbox;
  });
}

/** Open a select's menu without choosing anything, returning its listbox */
export function openSelectMenu(combobox: HTMLElement) {
  return typeIntoSelect(combobox, "{ArrowDown}");
}

/** Choose a select's option by typing its name */
export async function chooseSelectOption(combobox: HTMLElement, optionText: string, { exact = true } = {}) {
  const listbox = await typeIntoSelect(combobox, optionText);
  fireEvent.click(await within(listbox).findByText(optionText, { exact }));
}
