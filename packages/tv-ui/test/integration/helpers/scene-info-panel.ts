import { act, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import { setupIntegrationTest, savedTvConfig, type BootedApp } from "./harness";
import { bootWithTvConfig, currentSlide, click } from "./feed";

/**
 * Helpers for the scene info panel's tests, which are split across files so they run in parallel.
 *
 * @see docs/scene-info-panel.md
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a scene info panel test file against the mock server (call at the top of the file) */
export function setupSceneInfoPanelTest() {
  integration = setupIntegrationTest();
  return integration;
}

// The first slide's scene (fixture scene-7, the newest), which has no studio
export const TITLE = "Grotto Glow";
export const PERFORMER = "Bob Bold";
// As Stash shows it on the scene's page (the fixture's date is 2025-02-14)
export const DATE = "14 February 2025";
export const TAG = "Beta";
// Booting waits for the first scene's title by default, which a customised panel may hide, so tests that customise it
// wait for the date instead

export async function openPanel(app: BootedApp) {
  const { useGlobalState } = await import("../../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("sceneInfoOpen", true));
  return panel(app);
}

export function panel(app: BootedApp) {
  return within(currentSlide(app)).getByTestId("MediaSlide--sceneInfo");
}

export async function startEditing(app: BootedApp) {
  const infoPanel = await openPanel(app);
  click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
  return infoPanel;
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

/** A layout of the fields the tests use, each on its own line, to edit (the default has many more) */
export const SIMPLE_LAYOUT = [["studio"], ["title"], ["performers"], ["date"]];

export function bootWithSimpleLayout() {
  return bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", SIMPLE_LAYOUT), DATE);
}

/** The panel's lines, as the fields shown on each */
export function shownFields(infoPanel: HTMLElement) {
  return [...infoPanel.querySelectorAll<HTMLElement>(".field-line")].map(line => (
    [...line.querySelectorAll<HTMLElement>(".line-fields > .field")].map(field => (
      [...field.classList].find(name => name.startsWith("field-"))?.replace(/^field-/, "")
    ))
  ));
}

export function savedLayout() {
  return savedTvConfig(integration).sceneInfoLayout;
}

export function savedFieldOptions() {
  return savedTvConfig(integration).sceneInfoFieldOptions;
}

/** The panel showing these fields, one per line */
export function bootShowingFields(fields: string[]) {
  return bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [["date"], ...fields.map(field => [field])]), DATE);
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
