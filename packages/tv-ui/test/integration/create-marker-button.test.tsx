/**
 * The create-marker action button.
 *
 * Without marker defaults it opens Stash's marker form. With defaults it creates a marker at the current playback
 * position in one click, then becomes an "edit marker" button for that marker. Either way the marker must show up on
 * the scene being watched straight away, which means the slide's live data has to pick up the scene's new marker list.
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

describe("Create-marker button without defaults", () => {
  it("creates the marker entered in the form and shows it on the scene", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "create-marker", iconId: "add-marker", markerDefaults: null }]);
    const sceneId = sceneIdOf(currentSlide(app));
    const markerCountBefore = serverMarkersOf(sceneId).length;

    click(await createMarkerButton(app, "Create marker for scene"));
    const form = await waitFor(markerForm);
    await chooseOption("primary_tag_id", "Delta");
    click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(serverMarkersOf(sceneId)).toHaveLength(markerCountBefore + 1));
    expect(serverMarkersOf(sceneId)).toContainEqual(
      expect.objectContaining({ primary_tag_id: "tag-delta", seconds: 0 })
    );
    await waitFor(() => expect(displayedPlayingMarker(app)).toBe("Delta"));

    await app.unmount();
  });
});

describe("Create-marker button with defaults", () => {
  it("creates a marker from the defaults at the playback position in one click", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults }]);
    const sceneId = sceneIdOf(currentSlide(app));

    click(await createMarkerButton(app, 'Create "Delta" marker'));

    await waitFor(() =>
      expect(serverMarkersOf(sceneId)).toContainEqual(
        expect.objectContaining({ title: "Quick mark", primary_tag_id: "tag-delta", tag_ids: ["tag-epsilon"], seconds: 0 })
      )
    );

    await app.unmount();
  });

  it("shows the new marker on the scene", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults }]);

    click(await createMarkerButton(app, 'Create "Delta" marker'));

    await waitFor(() => expect(displayedPlayingMarker(app)).toBe("Quick mark"));

    await app.unmount();
  });

  it("becomes an edit button once the scene has the marker, and doesn't create another", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults }]);
    const sceneId = sceneIdOf(currentSlide(app));
    const markerCountBefore = serverMarkersOf(sceneId).length;

    click(await createMarkerButton(app, 'Create "Delta" marker'));
    click(await createMarkerButton(app, 'Edit "Delta" marker'));

    await waitFor(markerForm);
    expect(serverMarkersOf(sceneId)).toHaveLength(markerCountBefore + 1);

    await app.unmount();
  });

  it("recognises its marker when the defaults have no title", async () => {
    const app = await bootApp();
    const { title: _title, ...untitledDefaults } = markerDefaults;
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults: untitledDefaults }]);

    click(await createMarkerButton(app, 'Create "Delta" marker'));

    expect(await createMarkerButton(app, 'Edit "Delta" marker')).toBeInTheDocument();

    await app.unmount();
  });

  it("shows changes saved from the edit form on the scene", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults }]);
    const sceneId = sceneIdOf(currentSlide(app));

    click(await createMarkerButton(app, 'Create "Delta" marker'));
    click(await createMarkerButton(app, 'Edit "Delta" marker'));
    const form = await waitFor(markerForm);
    await chooseOption("title", "Renamed");
    click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(serverMarkersOf(sceneId)).toContainEqual(expect.objectContaining({ title: "Renamed" }))
    );
    await waitFor(() => expect(displayedPlayingMarker(app)).toBe("Renamed"));

    await app.unmount();
  });

  it("goes back to creating once its marker is deleted from the edit form", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "create-marker", iconId: "bookmark", markerDefaults }]);
    const sceneId = sceneIdOf(currentSlide(app));
    const markerCountBefore = serverMarkersOf(sceneId).length;

    click(await createMarkerButton(app, 'Create "Delta" marker'));
    click(await createMarkerButton(app, 'Edit "Delta" marker'));
    const form = await waitFor(markerForm);
    click(within(form).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(serverMarkersOf(sceneId)).toHaveLength(markerCountBefore));
    expect(await createMarkerButton(app, 'Create "Delta" marker')).toBeInTheDocument();
    expect(displayedPlayingMarker(app)).toBeNull();

    await app.unmount();
  });
});
