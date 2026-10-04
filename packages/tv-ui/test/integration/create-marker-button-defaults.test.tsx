/**
 * The create-marker action button with marker defaults. It creates a marker at the current playback position in one
 * click; once the scene has a matching marker it opens a panel for adding another or editing the existing ones. The
 * marker must show up on the scene being watched straight away.
 *
 * @see docs/action-buttons.md § "Create-Marker Button"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp, type BootedApp } from "./helpers/harness";
import { currentSlide, pinActionButtons, sceneIdOf, click } from "./helpers/feed";
import { actionButtonRoot, displayedIconState, sidePanel } from "../helpers/actionButtons";
import { setupCreateMarkerButtonTest, markerDefaults, firstScene, seedMarker, serverMarkersOf, createMarkerButton, displayedPlayingMarker, markerForm, chooseOption } from "./helpers/create-marker-button";

setupCreateMarkerButtonTest();

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

  it("shows the new marker as playing straight away, even while the video is paused", async () => {
    const app = await bootApp();
    await pinDefaultsButton();

    click(await defaultsButton(app));

    // Unlike displayedPlayingMarker, doesn't fire `timeupdate`: a paused video doesn't either
    await waitFor(() =>
      expect(currentSlide(app).querySelector(".currently-playing-marker")?.textContent).toBe("Quick mark")
    );

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

  it("fills in its icon once the scene has a matching marker", async () => {
    const app = await bootApp();
    await pinDefaultsButton();
    // Imported after boot: see docs/testing.md § "Gotchas" (importing app code at the top of an integration test)
    const { actionButtonIcons } = await import("../../src/components/action-buttons/icons");
    const displayedState = async () =>
      await displayedIconState(actionButtonRoot(await defaultsButton(app)), actionButtonIcons["bookmark"].states);
    expect(await displayedState()).toBe("inactive");

    click(await defaultsButton(app));
    await waitForCreatedMarkerOnSlide(app);

    await waitFor(async () => expect(await displayedState()).toBe("active"));

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
