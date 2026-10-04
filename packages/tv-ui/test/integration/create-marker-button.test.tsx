/**
 * The create-marker action button.
 *
 * Without marker defaults it opens Stash's marker form, with a dropdown above it for switching to editing one of the
 * scene's existing markers. The marker must show up on the scene being watched straight away, which means the slide's
 * live data has to pick up the scene's new marker list.
 *
 * The button with marker defaults is tested in a file of its own, so they run in parallel.
 *
 * @see docs/action-buttons.md § "Create-Marker Button"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, pinActionButtons, pinUncheckedActionButton, sceneIdOf, setChannel, click } from "./helpers/feed";
import { isSidePanelOpen, sidePanel } from "../helpers/actionButtons";
import { setupCreateMarkerButtonTest, firstScene, seedMarker, serverMarkersOf, displayedPlayingMarker, markerForm, chooseOption, markerFormStartTime, markerFormTitle, selectedMarkerChoice, openMarkerChoiceMenu, chooseMarker, openNewMarkerForm } from "./helpers/create-marker-button";

const integration = setupCreateMarkerButtonTest();

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

  it("closes when the form is cancelled, creating nothing", async () => {
    const app = await bootApp();
    const markerCountBefore = serverMarkersOf(firstScene).length;

    await openNewMarkerForm(app);
    click(within(markerForm()).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(isSidePanelOpen()).toBe(false));
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

describe("Create-marker button", () => {
  it("isn't shown on marker slides", async () => {
    // Fixture filter "3" is "All Markers"
    const app = await bootWithTvConfig((tvConfig) => setChannel(tvConfig, "3"), "Intro");
    await pinActionButtons([{ buttonType: "create-marker", iconId: "add-marker", markerDefaults: null }, "loop"]);
    // Wait for the stack to render the other button so the absence isn't vacuous
    await within(currentSlide(app)).findByRole("button", { name: "Loop scene" });

    expect(within(currentSlide(app)).queryByRole("button", { name: /marker/ })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("shows an error marker instead of a button when its config is invalid", async () => {
    const app = await bootApp();

    await pinUncheckedActionButton({ buttonType: "create-marker", markerDefaults: null });

    await waitFor(() => expect(currentSlide(app).querySelector(".ActionButtonStack .pinned")).toHaveTextContent("?"));
    expect(within(currentSlide(app)).queryByRole("button", { name: /marker/ })).not.toBeInTheDocument();

    await app.unmount();
  });
});
