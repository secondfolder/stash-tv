import { expect } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Reading and using the scene info panel, for its unit and integration tests alike.
 *
 * Clicks are `fireEvent` rather than `userEvent`: with a MediaSlide mounted (in the integration tests) userEvent's
 * clicks throw (see docs/testing.md § "Gotchas").
 *
 * @see docs/scene-info-panel.md
 */

// Fixture scene-7 (the feed's first slide): the integration tests' scene, which the unit tests' stand-in copies
export const TITLE = "Grotto Glow";
export const PERFORMER = "Bob Bold";
// As Stash shows it on the scene's page (the fixture's date is 2025-02-14)
export const DATE = "14 February 2025";
export const TAG = "Beta";

/** A layout of the fields the tests use, each on its own line, to edit (the default has many more) */
export const SIMPLE_LAYOUT = [["studio"], ["title"], ["performers"], ["date"]];

export function click(element: HTMLElement) {
  fireEvent.click(element);
}

/** Switch the open panel to its editor */
export function clickEdit(infoPanel: HTMLElement) {
  click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
}

export function save(infoPanel: HTMLElement) {
  click(within(infoPanel).getByRole("button", { name: "Save" }));
}

/** The panel's lines, as the text of each */
export function shownLines(infoPanel: HTMLElement) {
  return [...infoPanel.querySelectorAll<HTMLElement>(".field-line")].map((line) => line.textContent);
}

/** The editor's lines, as the text of each pill on them (each line's items have its index in `data-line`) */
export function editorLines(infoPanel: HTMLElement) {
  const lines: (string | null)[][] = [];
  for (const item of infoPanel.querySelectorAll<HTMLElement>(".layout-lines [data-line]")) {
    const line = lines[Number(item.dataset.line)] ??= [];
    if (item.classList.contains("field-pill")) line.push(item.textContent);
  }
  return lines;
}

/** The panel's lines, as the fields shown on each */
export function shownFields(infoPanel: HTMLElement) {
  return [...infoPanel.querySelectorAll<HTMLElement>(".field-line")].map(line => (
    [...line.querySelectorAll<HTMLElement>(".line-fields > .field")].map(field => (
      [...field.classList].find(name => name.startsWith("field-"))?.replace(/^field-/, "")
    ))
  ));
}

export function field(infoPanel: HTMLElement, id: string) {
  return infoPanel.querySelector<HTMLElement>(`.field-line .field-${id}`);
}

/** Opens a field's options dialog from its pill, returning the dialog */
export async function openFieldOptions(infoPanel: HTMLElement, fieldName: string) {
  click(within(infoPanel).getByRole("button", { name: `${fieldName} options` }));
  return await screen.findByRole("dialog");
}

/** Saves a field's options dialog, waiting for it to close (its form submits asynchronously) */
export async function saveFieldOptions(dialog: HTMLElement) {
  click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}
