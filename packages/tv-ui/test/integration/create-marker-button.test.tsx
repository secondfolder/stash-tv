/**
 * The create-marker action button.
 *
 * Without marker defaults it opens Stash's marker form, with a dropdown above it for switching to editing one of the
 * scene's existing markers. With defaults it creates a marker at the current playback position in one click; once the scene has a
 * matching marker it opens a panel for adding another or editing the existing ones. Either way the marker must show
 * up on the scene being watched straight away, which means the slide's live data has to pick up the scene's new marker
 * list.
 *
 * @see docs/action-buttons.md § "Create-Marker Button"
 * @see docs/media-loading.md § "Live item data"
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MockStashServer } from "mock-stash";
import { setupIntegrationTest, bootApp, type BootedApp } from "./helpers/harness";
import { currentSlide, pinActionButtons, sceneIdOf } from "./helpers/feed";

const integration = setupIntegrationTest();

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

const markerDefaults = { title: "Quick mark", primaryTagId: "tag-delta", tagIds: ["tag-epsilon"] };
const firstScene = "scene-7"; // The first slide (the newest scene), which has no fixture markers

/** Add a marker to the server before the app boots. */
function seedMarker(id: string, marker: { seconds: number; title: string; primary_tag_id: string }) {
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

function serverMarkersOf(sceneId: string) {
  return [...integration.server.store.markers.values()].filter((marker) => marker.scene_id === sceneId);
}

/** The current slide's create-marker button, found by its accessible name (its title). */
function createMarkerButton(app: BootedApp, name: string | RegExp) {
  return within(currentSlide(app)).findByRole("button", { name });
}

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

/**
 * The marker(s) the current slide says are playing. Recomputed on the video's `timeupdate`, which jsdom never fires
 * on its own, so fire one first (jsdom's playback position stays at 0).
 */
function displayedPlayingMarker(app: BootedApp) {
  const slide = currentSlide(app);
  const video = slide.querySelector("video");
  if (!video) throw new Error("Current slide has no video element");
  fireEvent(video, new Event("timeupdate"));
  return slide.querySelector(".currently-playing-marker")?.textContent ?? null;
}

/** The open action button side panel. */
function sidePanel() {
  const panel = document.querySelector<HTMLElement>(".action-button-side-panel");
  if (!panel) throw new Error("Side panel not shown");
  return panel;
}

function markerForm() {
  const form = document.querySelector<HTMLElement>(".action-button-create-marker");
  if (!form) throw new Error("Marker form not shown");
  return form;
}

/**
 * The select for one of the marker form's fields. Stash's form labels don't point at react-select's input, so it can't
 * be found by label text.
 */
function markerFormSelect(field: "title" | "primary_tag_id" | "tag_ids") {
  const group = markerForm().querySelector(`label[for="${field}"]`)?.closest<HTMLElement>(".form-group");
  if (!group) throw new Error(`Marker form has no ${field} field`);
  return within(group).getByRole("combobox");
}

/** Type into one of the marker form's selects and pick the option with the given name. */
async function chooseOption(field: "title" | "primary_tag_id", text: string) {
  // The title select is disabled until its suggestions load
  const combobox = await waitFor(() => {
    const element = markerFormSelect(field);
    expect(element).toBeEnabled();
    return element;
  });
  act(() => combobox.focus());
  await userEvent.keyboard(text);
  const listbox = await waitFor(() => {
    const element = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!element) throw new Error(`${field} options not shown`);
    return element;
  });
  click(await within(listbox).findByText(text, { exact: false }));
}

/** The marker form's start time, as shown in its time field */
function markerFormStartTime() {
  const field = markerForm().querySelector<HTMLInputElement>("input#seconds");
  if (!field) throw new Error("Marker form has no time field");
  return field.value;
}

/** The title shown in the marker form's title field (null when it's empty) */
function markerFormTitle() {
  const group = markerForm().querySelector('label[for="title"]')?.closest(".form-group");
  return group?.querySelector(".react-select__single-value")?.textContent ?? null;
}

/** The dropdown above the marker form choosing between adding a marker and editing an existing one. */
function markerChoiceSelect() {
  return within(sidePanel()).getByRole("combobox", { name: "Add or edit a marker" });
}

function selectedMarkerChoice() {
  return sidePanel().querySelector(".marker-select .react-select__single-value")?.textContent ?? null;
}

/** Open the add-or-edit dropdown's menu and return its listbox. */
async function openMarkerChoiceMenu() {
  const combobox = markerChoiceSelect();
  act(() => combobox.focus());
  await userEvent.keyboard("{ArrowDown}");
  return await waitFor(() => {
    const listbox = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!listbox) throw new Error("Add-or-edit options not shown");
    return listbox;
  });
}

async function chooseMarker(label: string) {
  click(within(await openMarkerChoiceMenu()).getByRole("option", { name: label }));
  expect(selectedMarkerChoice()).toBe(label);
}

async function openNewMarkerForm(app: BootedApp) {
  await pinActionButtons([{ buttonType: "create-marker", iconId: "add-marker", markerDefaults: null }]);
  click(await createMarkerButton(app, "Add/edit scene marker"));
  await waitFor(markerForm);
}

describe("Create-marker button without defaults", () => {
  it("creates the marker entered in the form and shows it on the scene", async () => {
    const app = await bootApp();
    const sceneId = sceneIdOf(currentSlide(app));
    const markerCountBefore = serverMarkersOf(sceneId).length;

    await openNewMarkerForm(app);
    await chooseOption("primary_tag_id", "Delta");
    click(within(markerForm()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(serverMarkersOf(sceneId)).toHaveLength(markerCountBefore + 1));
    expect(serverMarkersOf(sceneId)).toContainEqual(
      expect.objectContaining({ primary_tag_id: "tag-delta", seconds: 0 })
    );
    await waitFor(() => expect(displayedPlayingMarker(app)).toBe("Delta"));

    await app.unmount();
  });

  it("offers adding a new marker or editing one of the scene's markers, in order of start time", async () => {
    seedMarker("marker-test-finale", { seconds: 8, title: "Finale", primary_tag_id: "tag-beta" });
    seedMarker("marker-test-intro", { seconds: 1, title: "Intro", primary_tag_id: "tag-alpha" });
    seedMarker("marker-test-mid", { seconds: 4, title: "Middle", primary_tag_id: "tag-delta" });
    const app = await bootApp();

    await openNewMarkerForm(app);

    const listbox = await openMarkerChoiceMenu();
    const options = within(listbox).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Add new marker", "Edit 0:01 Intro", "Edit 0:04 Middle", "Edit 0:08 Finale"]);

    await app.unmount();
  });

  it("has no add-or-edit dropdown when the scene has no markers", async () => {
    const app = await bootApp();

    await openNewMarkerForm(app);

    expect(within(sidePanel()).queryByRole("combobox", { name: "Add or edit a marker" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("starts on adding a new marker", async () => {
    seedMarker("marker-test-intro", { seconds: 1, title: "Intro", primary_tag_id: "tag-alpha" });
    const app = await bootApp();

    await openNewMarkerForm(app);

    expect(selectedMarkerChoice()).toBe("Add new marker");
    // Only an existing marker's form can delete it
    expect(within(markerForm()).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("switches the form to editing the chosen marker", async () => {
    seedMarker("marker-test-intro", { seconds: 1, title: "Intro", primary_tag_id: "tag-alpha" });
    seedMarker("marker-test-finale", { seconds: 8, title: "Finale", primary_tag_id: "tag-beta" });
    const app = await bootApp();
    const markerCountBefore = serverMarkersOf(firstScene).length;

    await openNewMarkerForm(app);
    await chooseMarker("Edit 0:08 Finale");
    await waitFor(() => expect(within(markerForm()).getByRole("button", { name: "Delete" })).toBeInTheDocument());
    expect(markerFormStartTime()).toBe("0:08");
    await waitFor(() => expect(markerFormTitle()).toBe("Finale"));
    await chooseOption("title", "Renamed");
    click(within(markerForm()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(integration.server.store.markers.get("marker-test-finale")?.title).toBe("Renamed"));
    expect(serverMarkersOf(firstScene)).toHaveLength(markerCountBefore);

    await app.unmount();
  });

  it("switches the form back to a new marker", async () => {
    seedMarker("marker-test-finale", { seconds: 8, title: "Finale", primary_tag_id: "tag-beta" });
    const app = await bootApp();

    await openNewMarkerForm(app);
    await chooseMarker("Edit 0:08 Finale");
    await waitFor(() => expect(markerFormStartTime()).toBe("0:08"));
    await chooseMarker("Add new marker");

    // A new marker starts at the playhead, which jsdom keeps at 0:00
    await waitFor(() => expect(markerFormStartTime()).toBe("0:00"));
    expect(markerFormTitle()).toBeNull();
    expect(within(markerForm()).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await app.unmount();
  });
});

describe("Create-marker button with defaults", () => {
  async function pinDefaultsButton(defaults: { title?: string; primaryTagId: string; tagIds: string[] } = markerDefaults) {
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults: defaults }]);
  }

  function defaultsButton(app: BootedApp) {
    return createMarkerButton(app, 'Add/edit "Delta" markers');
  }

  /**
   * Wait for the slide to show the marker the button just created (the scene has no others), which is what switches
   * the button from creating markers to opening its panel. Its title is the same either way, so wait on this before
   * clicking it again.
   */
  async function waitForCreatedMarkerOnSlide(app: BootedApp) {
    await waitFor(() => expect(displayedPlayingMarker(app)).not.toBeNull());
  }

  it("creates a marker from the defaults at the playback position in one click", async () => {
    const app = await bootApp();
    await pinDefaultsButton();
    const sceneId = sceneIdOf(currentSlide(app));

    click(await defaultsButton(app));

    await waitFor(() =>
      expect(serverMarkersOf(sceneId)).toContainEqual(
        expect.objectContaining({ title: "Quick mark", primary_tag_id: "tag-delta", tag_ids: ["tag-epsilon"], seconds: 0 })
      )
    );

    await app.unmount();
  });

  it("shows the new marker on the scene", async () => {
    const app = await bootApp();
    await pinDefaultsButton();

    click(await defaultsButton(app));

    await waitFor(() => expect(displayedPlayingMarker(app)).toBe("Quick mark"));

    await app.unmount();
  });

  it("opens a panel instead of creating another once the scene has a matching marker", async () => {
    const app = await bootApp();
    await pinDefaultsButton();
    const markerCountBefore = serverMarkersOf(firstScene).length;

    click(await defaultsButton(app));
    await waitForCreatedMarkerOnSlide(app);
    click(await defaultsButton(app));

    expect(within(sidePanel()).getByRole("button", { name: 'Add another "Delta" marker' })).toBeInTheDocument();
    expect(serverMarkersOf(firstScene)).toHaveLength(markerCountBefore + 1);

    await app.unmount();
  });

  it("recognises its markers when the defaults have no title", async () => {
    const app = await bootApp();
    const { title: _title, ...untitledDefaults } = markerDefaults;
    await pinDefaultsButton(untitledDefaults);
    const markerCountBefore = serverMarkersOf(firstScene).length;

    click(await defaultsButton(app));
    await waitForCreatedMarkerOnSlide(app);
    click(await defaultsButton(app));

    expect(within(sidePanel()).getByRole("button", { name: 'Add another "Delta" marker' })).toBeInTheDocument();
    expect(serverMarkersOf(firstScene)).toHaveLength(markerCountBefore + 1);

    await app.unmount();
  });

  it("adds another marker from the panel", async () => {
    seedMarker("marker-test-match", { seconds: 5, title: "Quick mark", primary_tag_id: "tag-delta" });
    const app = await bootApp();
    await pinDefaultsButton();
    const markerCountBefore = serverMarkersOf(firstScene).length;

    click(await defaultsButton(app));
    click(within(sidePanel()).getByRole("button", { name: 'Add another "Delta" marker' }));

    await waitFor(() => expect(serverMarkersOf(firstScene)).toHaveLength(markerCountBefore + 1));
    expect(serverMarkersOf(firstScene)).toContainEqual(
      expect.objectContaining({ title: "Quick mark", primary_tag_id: "tag-delta", seconds: 0 })
    );

    await app.unmount();
  });

  it("lists every marker matching the defaults, in order of start time", async () => {
    seedMarker("marker-test-late", { seconds: 7, title: "Quick mark", primary_tag_id: "tag-delta" });
    seedMarker("marker-test-early", { seconds: 3, title: "Quick mark", primary_tag_id: "tag-delta" });
    seedMarker("marker-test-other", { seconds: 5, title: "Other", primary_tag_id: "tag-delta" });
    const app = await bootApp();
    await pinDefaultsButton();

    click(await defaultsButton(app));

    const editButtons = within(sidePanel()).getAllByRole("button", { name: /^Edit / });
    expect(editButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Edit 0:03 Quick mark",
      "Edit 0:07 Quick mark",
    ]);

    await app.unmount();
  });

  it("edits the chosen marker from the panel and shows the change on the scene", async () => {
    const app = await bootApp();
    await pinDefaultsButton();
    const sceneId = sceneIdOf(currentSlide(app));

    click(await defaultsButton(app));
    await waitForCreatedMarkerOnSlide(app);
    click(await defaultsButton(app));
    click(within(sidePanel()).getByRole("button", { name: "Edit 0:00 Quick mark" }));
    await chooseOption("title", "Renamed");
    click(within(markerForm()).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(serverMarkersOf(sceneId)).toContainEqual(expect.objectContaining({ title: "Renamed" }))
    );
    await waitFor(() => expect(displayedPlayingMarker(app)).toBe("Renamed"));

    await app.unmount();
  });

  it("goes back to creating once its only marker is deleted", async () => {
    const app = await bootApp();
    await pinDefaultsButton();
    const sceneId = sceneIdOf(currentSlide(app));
    const markerCountBefore = serverMarkersOf(sceneId).length;

    click(await defaultsButton(app));
    await waitForCreatedMarkerOnSlide(app);
    click(await defaultsButton(app));
    click(within(sidePanel()).getByRole("button", { name: "Edit 0:00 Quick mark" }));
    click(within(markerForm()).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(serverMarkersOf(sceneId)).toHaveLength(markerCountBefore));
    await waitFor(() => expect(displayedPlayingMarker(app)).toBeNull());
    click(await defaultsButton(app));
    await waitFor(() => expect(serverMarkersOf(sceneId)).toHaveLength(markerCountBefore + 1));

    await app.unmount();
  });
});
