import { afterEach, beforeEach, expect } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import type { MockStashServer } from "mock-stash";
import { setupIntegrationTest, type BootedApp } from "./harness";
import { currentSlide, pinActionButtons, click } from "./feed";
import { sidePanel } from "../../helpers/actionButtons";
import { chooseSelectOption, openSelectMenu } from "./selects";

/**
 * Helpers for the create-marker action button's tests, which are split across files so they run in parallel. The
 * markers each test creates on the server are removed after it.
 *
 * @see docs/action-buttons.md § "Create-Marker Button"
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a test file for these tests against the mock server (call it at the top of the file) */
export function setupCreateMarkerButtonTest() {
  integration = setupIntegrationTest();

  // The server store outlives each test, so restore the fixture markers afterwards
  let initialMarkers: MockStashServer["store"]["markers"];
  beforeEach(() => {
    initialMarkers = new Map(integration.server.store.markers);
  });
  afterEach(() => {
    const { markers } = integration.server.store;
    markers.clear();
    for (const [id, marker] of initialMarkers) markers.set(id, marker);
  });
  return integration;
}

export const markerDefaults = { title: "Quick mark", primaryTagId: "tag-delta", tagIds: ["tag-epsilon"] };
export const firstScene = "scene-7"; // The first slide (the newest scene), which has no fixture markers

/** Add a marker to the server before the app boots. */
export function seedMarker(id: string, marker: { seconds: number; title: string; primary_tag_id: string }) {
  integration.server.store.markers.set(id, {
    id,
    scene_id: firstScene,
    end_seconds: null,
    tag_ids: [],
    ...marker,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  });
}

export function serverMarkersOf(sceneId: string) {
  return [...integration.server.store.markers.values()].filter((marker) => marker.scene_id === sceneId);
}

/** The current slide's create-marker button, found by its accessible name (its title). */
export function createMarkerButton(app: BootedApp, name: string | RegExp) {
  return within(currentSlide(app)).findByRole("button", { name });
}

/**
 * The marker(s) the current slide says are playing. Recomputed on the video's `timeupdate`, which jsdom never fires
 * on its own, so fire one first (jsdom's playback position stays at 0).
 */
export function displayedPlayingMarker(app: BootedApp) {
  const slide = currentSlide(app);
  const video = slide.querySelector("video");
  if (!video) throw new Error("Current slide has no video element");
  fireEvent(video, new Event("timeupdate"));
  return slide.querySelector(".currently-playing-marker")?.textContent ?? null;
}

export function markerForm() {
  const form = document.querySelector<HTMLElement>(".action-button-create-marker");
  if (!form) throw new Error("Marker form not shown");
  return form;
}

/**
 * The select for one of the marker form's fields. Stash's form labels don't point at react-select's input, so it can't
 * be found by label text.
 */
export function markerFormSelect(field: "title" | "primary_tag_id" | "tag_ids") {
  const group = markerForm().querySelector(`label[for="${field}"]`)?.closest<HTMLElement>(".form-group");
  if (!group) throw new Error(`Marker form has no ${field} field`);
  return within(group).getByRole("combobox");
}

/** Type into one of the marker form's selects and pick the option with the given name. */
export async function chooseOption(field: "title" | "primary_tag_id", text: string) {
  // The title select is disabled until its suggestions load
  const combobox = await waitFor(() => {
    const element = markerFormSelect(field);
    expect(element).toBeEnabled();
    return element;
  });
  await chooseSelectOption(combobox, text, { exact: false });
}

/** The marker form's start time, as shown in its time field */
export function markerFormStartTime() {
  const field = markerForm().querySelector<HTMLInputElement>("input#seconds");
  if (!field) throw new Error("Marker form has no time field");
  return field.value;
}

/** The title shown in the marker form's title field (null when it's empty) */
export function markerFormTitle() {
  const group = markerForm().querySelector('label[for="title"]')?.closest(".form-group");
  return group?.querySelector(".react-select__single-value")?.textContent ?? null;
}

/** The dropdown above the marker form choosing between adding a marker and editing an existing one. */
export function markerChoiceSelect() {
  return within(sidePanel()).getByRole("combobox", { name: "Add or edit a marker" });
}

export function selectedMarkerChoice() {
  return sidePanel().querySelector(".marker-select .react-select__single-value")?.textContent ?? null;
}

/** Open the add-or-edit dropdown's menu and return its listbox. */
export async function openMarkerChoiceMenu() {
  return await openSelectMenu(markerChoiceSelect());
}

export async function chooseMarker(label: string) {
  click(within(await openMarkerChoiceMenu()).getByRole("option", { name: label }));
  expect(selectedMarkerChoice()).toBe(label);
}

export async function openNewMarkerForm(app: BootedApp) {
  await pinActionButtons([{ buttonType: "create-marker", iconId: "add-marker", markerDefaults: null }]);
  click(await createMarkerButton(app, "Add/edit scene marker"));
  await waitFor(markerForm);
}
