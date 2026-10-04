/**
 * The quick tag action button: adding or removing one tag on the current scene or marker in Stash, and showing it on
 * the slide.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp } from "./helpers/harness";
import { currentSlide, pinActionButtons, pinUncheckedActionButton } from "./helpers/feed";
import { actionButtonRoot, displayedIconState, sidePanel } from "../helpers/actionButtons";
import { setupSceneActionButtonsTest, firstScene, firstMarker, click, actionButton, serverScene, serverMarker, bootMarkersFeed } from "./helpers/scene-action-buttons";

setupSceneActionButtonsTest();

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
