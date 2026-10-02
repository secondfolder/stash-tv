/**
 * Action buttons that change the current scene or marker in Stash: o-counter, rating, organized, quick tag, tag
 * editing and deleting. Each must change the right item on the server and show the change on the slide.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, restoreServerMediaAfterEach, type BootedApp } from "./helpers/harness";
import {
  bootWithTvConfig,
  currentSlide,
  displayedSideInfo,
  pinActionButtons,
  pinUncheckedActionButton,
  sceneIdOf,
  slides,
  setChannel,
} from "./helpers/feed";
import {
  actionButtonRoot,
  closeSidePanelByClickingOutside,
  displayedIconState,
  isSidePanelOpen,
  sidePanel,
} from "../helpers/actionButtons";

const integration = setupIntegrationTest();
restoreServerMediaAfterEach(integration);

// Fixture data for the first slide of the default feed (the newest scene)
const firstScene = { id: "scene-7", tagIds: ["tag-beta"] };
// Fixture data for the first slide of the "All Markers" feed
const firstMarker = { id: "marker-1", sceneId: "scene-1", primaryTagId: "tag-alpha" };

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

/** The current slide's action button with the given accessible name (its title). */
function actionButton(app: BootedApp, name: string | RegExp) {
  return within(currentSlide(app)).findByRole("button", { name });
}

function serverScene(sceneId: string) {
  const scene = integration.server.store.scenes.get(sceneId);
  if (!scene) throw new Error(`No scene ${sceneId} on the server`);
  return scene;
}

function serverMarker(markerId: string) {
  const marker = integration.server.store.markers.get(markerId);
  if (!marker) throw new Error(`No marker ${markerId} on the server`);
  return marker;
}

async function bootMarkersFeed() {
  // Fixture filter "3" is "All Markers", sorted by scene
  return await bootWithTvConfig((tvConfig) => setChannel(tvConfig, "3"), "Intro");
}

describe("O-counter button", () => {
  it("adds an orgasm mark to the scene in one click", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);

    click(await actionButton(app, "Mark Orgasm"));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(1));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    await app.unmount();
  });

  it("shows the scene's o-count beside the button, but not when it's 0", async () => {
    serverScene(firstScene.id).o_history = ["2024-05-01T10:00:00Z", "2024-05-02T10:00:00Z"];
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);

    expect(displayedSideInfo(app, "o-counter")).toBe("2");
    // An o-count from before the slide was shown doesn't count as marked now
    expect(await actionButton(app, "Mark Orgasm")).toBeInTheDocument();

    await app.unmount();
  });

  it("opens a panel for adjusting the count once marked, instead of adding another", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    click(await actionButton(app, "Undo Orgasm Mark"));

    expect(within(sidePanel()).getByRole("button", { name: "Decrease O-count" })).toBeInTheDocument();
    expect(sidePanel()).toHaveTextContent("1");
    expect(serverScene(firstScene.id).o_history).toHaveLength(1);

    await app.unmount();
  });

  it("removes the latest orgasm mark from the panel", async () => {
    serverScene(firstScene.id).o_history = ["2024-05-01T10:00:00Z", "2024-05-02T10:00:00Z"];
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(3));
    const markAdded = serverScene(firstScene.id).o_history[2];

    click(await actionButton(app, "Undo Orgasm Mark"));
    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(2));
    expect(serverScene(firstScene.id).o_history).not.toContain(markAdded);
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("2"));

    await app.unmount();
  });

  it("adds another orgasm mark from the panel", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    click(await actionButton(app, "Undo Orgasm Mark"));
    click(within(sidePanel()).getByRole("button", { name: "Increase O-count" }));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(2));
    await waitFor(() => expect(sidePanel()).toHaveTextContent("2"));

    await app.unmount();
  });

  it("can't decrease the count below 0", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));
    click(await actionButton(app, "Undo Orgasm Mark"));
    // Keep the panel open while the count drops by adding a second mark first, so the button stays "marked"
    click(within(sidePanel()).getByRole("button", { name: "Increase O-count" }));
    await waitFor(() => expect(sidePanel()).toHaveTextContent("2"));

    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));
    await waitFor(() => expect(sidePanel()).toHaveTextContent("1"));
    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));
    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(0));

    expect(within(sidePanel()).getByRole("button", { name: "Decrease O-count" })).toBeDisabled();
    expect(displayedSideInfo(app, "o-counter")).toBeNull();

    await app.unmount();
  });

  it("goes back to adding a mark in one click once the count drops back below where it started", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));
    click(await actionButton(app, "Undo Orgasm Mark"));
    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));
    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(0));
    await closeSidePanelByClickingOutside();

    click(await actionButton(app, "Mark Orgasm"));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(1));

    await app.unmount();
  });
});

describe("Rate scene button", () => {
  /** The star buttons in the open rating panel, in order. */
  function stars() {
    const ratingStars = sidePanel().querySelector<HTMLElement>(".rating-stars");
    if (!ratingStars) throw new Error("Rating stars not shown");
    return within(ratingStars).getAllByRole("button");
  }

  async function displayedRatingState(button: HTMLElement) {
    // Imported after boot: see docs/testing.md § "Gotchas" (importing app code at the top of an integration test)
    const { buttonDefinition } = await import("../../src/components/action-buttons/buttons/RateSceneActionButton");
    return await displayedIconState(actionButtonRoot(button), buttonDefinition.icon);
  }

  it("rates the scene with the chosen number of stars", async () => {
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);
    const rateButton = await actionButton(app, "Rate scene");
    expect(await displayedRatingState(rateButton)).toBe("inactive");
    expect(displayedSideInfo(app, "rate-scene")).toBeNull();

    click(rateButton);
    click(stars()[3]);

    await waitFor(() => expect(serverScene(firstScene.id).rating100).toBe(80));
    await waitFor(() => expect(displayedSideInfo(app, "rate-scene")).toBe("4"));
    expect(await displayedRatingState(await actionButton(app, "Rate scene"))).toBe("active");

    await app.unmount();
  });

  it("clears the rating when the current star rating is chosen again", async () => {
    serverScene(firstScene.id).rating100 = 60;
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    click(await actionButton(app, "Rate scene"));
    click(stars()[2]);

    await waitFor(() => expect(serverScene(firstScene.id).rating100).toBeNull());
    await waitFor(() => expect(displayedSideInfo(app, "rate-scene")).toBeNull());

    await app.unmount();
  });

  it("shows a star rating out of 5, with a half star as .5", async () => {
    serverScene(firstScene.id).rating100 = 70;
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    expect(displayedSideInfo(app, "rate-scene")).toBe("3.5");

    await app.unmount();
  });

  it("shows a decimal rating out of 10 when Stash uses decimal ratings", async () => {
    integration.server.store.uiConfig = { ratingSystemOptions: { type: "decimal", starPrecision: "full" } };
    serverScene(firstScene.id).rating100 = 75;
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    expect(displayedSideInfo(app, "rate-scene")).toBe("7.5");

    await app.unmount();
  });

  it("focuses the rating input when opened with decimal ratings", async () => {
    integration.server.store.uiConfig = { ratingSystemOptions: { type: "decimal", starPrecision: "full" } };
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    click(await actionButton(app, "Rate scene"));

    await waitFor(() => expect(within(sidePanel()).getByRole("spinbutton")).toHaveFocus());

    await app.unmount();
  });

  it("rates a marker's scene", async () => {
    const app = await bootMarkersFeed();
    await pinActionButtons(["rate-scene"]);

    click(await actionButton(app, "Rate scene"));
    click(stars()[4]);

    await waitFor(() => expect(serverScene(firstMarker.sceneId).rating100).toBe(100));

    await app.unmount();
  });
});

describe("Set organized button", () => {
  it("marks the scene as organized", async () => {
    const app = await bootApp();
    await pinActionButtons(["set-organized"]);

    click(await actionButton(app, "Mark as organized"));

    await waitFor(() => expect(serverScene(firstScene.id).organized).toBe(true));
    expect(await actionButton(app, "Mark as unorganized")).toBeInTheDocument();

    await app.unmount();
  });

  it("marks an organized scene as unorganized", async () => {
    serverScene(firstScene.id).organized = true;
    const app = await bootApp();
    await pinActionButtons(["set-organized"]);

    click(await actionButton(app, "Mark as unorganized"));

    await waitFor(() => expect(serverScene(firstScene.id).organized).toBe(false));
    expect(await actionButton(app, "Mark as organized")).toBeInTheDocument();

    await app.unmount();
  });

  it("isn't shown on marker slides", async () => {
    const app = await bootMarkersFeed();
    await pinActionButtons(["set-organized", "rate-scene"]);
    // Wait for the stack to render the other button so the absence isn't vacuous
    await actionButton(app, "Rate scene");

    expect(within(currentSlide(app)).queryByRole("button", { name: /organized/ })).not.toBeInTheDocument();

    await app.unmount();
  });
});

describe("Quick tag button", () => {
  async function pinQuickTag(tagId: string, iconId = "add-tag") {
    await pinActionButtons([{ buttonType: "quick-tag", iconId, tagId }]);
  }

  it("adds its tag to the scene, keeping the scene's other tags", async () => {
    const app = await bootApp();
    await pinQuickTag("tag-delta");

    click(await actionButton(app, 'Add "Delta" to scene/marker'));

    await waitFor(() => expect(serverScene(firstScene.id).tag_ids).toEqual([...firstScene.tagIds, "tag-delta"]));
    expect(await actionButton(app, 'Remove "Delta" from scene/marker')).toBeInTheDocument();

    await app.unmount();
  });

  it("removes its tag from a scene that has it, keeping the scene's other tags", async () => {
    serverScene(firstScene.id).tag_ids = ["tag-beta", "tag-delta"];
    const app = await bootApp();
    await pinQuickTag("tag-delta");

    click(await actionButton(app, 'Remove "Delta" from scene/marker'));

    await waitFor(() => expect(serverScene(firstScene.id).tag_ids).toEqual(["tag-beta"]));
    expect(await actionButton(app, 'Add "Delta" to scene/marker')).toBeInTheDocument();

    await app.unmount();
  });

  it("tags the marker rather than its scene on a marker slide", async () => {
    const sceneTagsBefore = [...serverScene(firstMarker.sceneId).tag_ids];
    const app = await bootMarkersFeed();
    await pinQuickTag("tag-delta");

    click(await actionButton(app, 'Add "Delta" to scene/marker'));

    await waitFor(() => expect(serverMarker(firstMarker.id).tag_ids).toEqual(["tag-delta"]));
    expect(serverScene(firstMarker.sceneId).tag_ids).toEqual(sceneTagsBefore);

    await app.unmount();
  });

  it("removes its tag from a marker that has it", async () => {
    serverMarker(firstMarker.id).tag_ids = ["tag-delta"];
    const app = await bootMarkersFeed();
    await pinQuickTag("tag-delta");

    click(await actionButton(app, 'Remove "Delta" from scene/marker'));

    await waitFor(() => expect(serverMarker(firstMarker.id).tag_ids).toEqual([]));

    await app.unmount();
  });

  it("explains instead of removing a tag that's the marker's primary tag", async () => {
    const app = await bootMarkersFeed();
    await pinQuickTag(firstMarker.primaryTagId);

    click(await actionButton(app, 'Remove "Alpha" from scene/marker'));

    await waitFor(() =>
      expect(sidePanel()).toHaveTextContent(`Marker's primary tag is "Alpha" and a markers's primary tag cannot be removed.`)
    );
    expect(serverMarker(firstMarker.id).primary_tag_id).toBe(firstMarker.primaryTagId);

    await app.unmount();
  });

  it("shows the icon chosen in its settings", async () => {
    const app = await bootApp();
    await pinQuickTag("tag-delta", "star");

    const button = await actionButton(app, 'Add "Delta" to scene/marker');

    const { actionButtonIcons } = await import("../../src/components/action-buttons/icons");
    expect(await displayedIconState(actionButtonRoot(button), actionButtonIcons["star"].states)).toBe("inactive");

    await app.unmount();
  });

  it("shows an error marker instead of a button when it has no tag configured", async () => {
    const app = await bootApp();
    await pinUncheckedActionButton({ buttonType: "quick-tag", iconId: "add-tag" });

    await waitFor(() => expect(currentSlide(app).querySelector(".ActionButtonStack .pinned")).toHaveTextContent("?"));
    expect(within(currentSlide(app)).queryByRole("button", { name: /to scene\/marker/ })).not.toBeInTheDocument();

    await app.unmount();
  });
});

describe("Edit tags button", () => {
  function tagSelect() {
    return within(sidePanel()).getByRole("combobox");
  }

  function saveButton() {
    return within(sidePanel()).getByRole("button", { name: "Save" });
  }

  /** The tags shown as selected in the tag editor */
  function selectedTags() {
    return [...sidePanel().querySelectorAll(".react-select__multi-value__label")].map((tag) => tag.textContent);
  }

  it("opens an editor showing the scene's tags", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);

    click(await actionButton(app, "Edit scene/marker tags"));

    expect(selectedTags()).toEqual(["Beta"]);
    // Nothing to save until the tags change
    expect(saveButton()).toBeDisabled();

    await app.unmount();
  });

  it("saves the edited tags to the scene and closes", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);
    click(await actionButton(app, "Edit scene/marker tags"));

    // Focus rather than userEvent.click: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
    act(() => tagSelect().focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton()).toBeEnabled());
    click(saveButton());

    await waitFor(() => expect(serverScene(firstScene.id).tag_ids).toEqual([]));
    await waitFor(() => expect(isSidePanelOpen()).toBe(false));

    await app.unmount();
  });

  it("discards edits on cancel", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);
    click(await actionButton(app, "Edit scene/marker tags"));
    act(() => tagSelect().focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton()).toBeEnabled());

    click(within(sidePanel()).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(isSidePanelOpen()).toBe(false));
    expect(serverScene(firstScene.id).tag_ids).toEqual(firstScene.tagIds);

    await app.unmount();
  });

  it("offers its pinned tags for adding in one click", async () => {
    const app = await bootApp();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: ["tag-delta", "tag-beta"] }]);
    click(await actionButton(app, "Edit scene/marker tags"));

    // The scene already has Beta, so only Delta is offered
    const pinned = await waitFor(() => {
      const element = sidePanel().querySelector<HTMLElement>(".pinned");
      if (!element) throw new Error("Pinned tags not shown");
      return element;
    });
    expect(pinned).toHaveTextContent("Delta");
    expect(pinned).not.toHaveTextContent("Beta");
    click(within(pinned).getByText("Delta"));
    click(saveButton());

    await waitFor(() => expect(serverScene(firstScene.id).tag_ids).toEqual(["tag-beta", "tag-delta"]));

    await app.unmount();
  });

  it("edits the marker's tags on a marker slide, noting its primary tag", async () => {
    serverMarker(firstMarker.id).tag_ids = ["tag-delta"];
    const app = await bootMarkersFeed();
    await pinActionButtons([{ buttonType: "edit-tags", pinnedTagIds: [] }]);
    click(await actionButton(app, "Edit scene/marker tags"));

    expect(selectedTags()).toEqual(["Delta"]);
    expect(sidePanel()).toHaveTextContent(`Marker's primary tag is "Alpha".`);
    act(() => tagSelect().focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton()).toBeEnabled());
    click(saveButton());

    await waitFor(() => expect(serverMarker(firstMarker.id).tag_ids).toEqual([]));
    expect(serverMarker(firstMarker.id).primary_tag_id).toBe(firstMarker.primaryTagId);

    await app.unmount();
  });

  it("still opens the editor, without pinned tags, when its config is invalid", async () => {
    const app = await bootApp();
    await pinUncheckedActionButton({ buttonType: "edit-tags", pinnedTagIds: "tag-delta" });

    click(await actionButton(app, "Edit scene/marker tags"));

    expect(selectedTags()).toEqual(["Beta"]);
    expect(sidePanel().querySelector(".pinned")).toBeNull();

    await app.unmount();
  });
});

describe("Delete button", () => {
  function confirmationDialog() {
    const dialog = document.querySelector<HTMLElement>(".ModalComponent");
    if (!dialog) throw new Error("Delete confirmation not shown");
    return dialog;
  }

  it("deletes the scene once confirmed and moves on to the next item", async () => {
    const app = await bootApp();
    await pinActionButtons(["delete-media-item"]);

    click(await actionButton(app, "Delete scene/marker"));
    click(await waitFor(() => within(confirmationDialog()).getByRole("button", { name: "Delete" })));

    await waitFor(() => expect(integration.server.store.scenes.has(firstScene.id)).toBe(false));
    await waitFor(() => expect(slides(app).map(sceneIdOf)).not.toContain(firstScene.id));

    await app.unmount();
  });

  it("deletes nothing when cancelled", async () => {
    const app = await bootApp();
    await pinActionButtons(["delete-media-item"]);

    click(await actionButton(app, "Delete scene/marker"));
    click(await waitFor(() => within(confirmationDialog()).getByRole("button", { name: "Cancel" })));

    await waitFor(() => expect(document.querySelector(".ModalComponent")).toBeNull());
    expect(integration.server.store.scenes.has(firstScene.id)).toBe(true);
    expect(sceneIdOf(currentSlide(app))).toBe(firstScene.id);

    await app.unmount();
  });

  it("deletes the marker, not its scene, on a marker slide", async () => {
    const app = await bootMarkersFeed();
    await pinActionButtons(["delete-media-item"]);

    click(await actionButton(app, "Delete scene/marker"));
    click(await waitFor(() => within(confirmationDialog()).getByRole("button", { name: "Delete" })));

    await waitFor(() => expect(integration.server.store.markers.has(firstMarker.id)).toBe(false));
    expect(integration.server.store.scenes.has(firstMarker.sceneId)).toBe(true);

    await app.unmount();
  });
});
