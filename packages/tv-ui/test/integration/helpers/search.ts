import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import type { BootedApp } from "./harness";
import { actionButton, click } from "./feed";

/** Helpers for tests of the search palette (see docs/search.md) */

/** The search palette's text field, once it's open */
export function searchField() {
  return screen.getByRole("combobox", { name: "Search" });
}

/** Open the search palette with the current slide's search button */
export async function openSearch(app: BootedApp) {
  click(await actionButton(app, "Search"));
  return await waitFor(searchField);
}

/** Type into the search palette, returning its list of suggestions once what was typed has been searched for */
export async function typeSearch(text: string) {
  const field = searchField();
  act(() => field.focus());
  await userEvent.keyboard(text);
  await waitFor(() => expect(screen.queryByText("Searching…")).not.toBeInTheDocument());
  return screen.getByRole("listbox", { name: "Search" });
}

/** The suggestions under a heading (e.g. "Performers"), by their text */
export function suggestionsIn(listbox: HTMLElement, heading: string) {
  return within(within(listbox).getByRole("group", { name: heading })).getAllByRole("option").map((option) => option.textContent);
}

/** The suggestion under a heading whose text includes the given text */
export function suggestion(listbox: HTMLElement, heading: string, text: string) {
  const option = within(within(listbox).getByRole("group", { name: heading })).getAllByRole("option")
    .find((option) => option.textContent?.includes(text));
  if (!option) throw new Error(`No "${heading}" suggestion with "${text}"`);
  return option;
}
