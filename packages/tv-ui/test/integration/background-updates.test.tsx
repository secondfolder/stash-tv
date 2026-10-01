/**
 * Background cache update integration tests.
 *
 * While a scene plays, Stash's ScenePlayer saves activity, and that mutation (like most of Stash's scene mutations)
 * evicts every cached `findScenes` result and garbage-collects the cache. The feed must keep showing live data for
 * every loaded item through that, must not refetch its pages because of it, and must not remount anything the user
 * is interacting with.
 *
 * @see docs/media-loading.md § "Live item data"
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { setupIntegrationTest, bootApp, type BootedApp } from "./helpers/harness";
import { currentSlide, displayedSideInfo, goToSlide, pinActionButtons, sceneIdOf } from "./helpers/feed";

const integration = setupIntegrationTest();

// The server store outlives each test, so restore every scene's o-count history afterwards
let initialOHistories: Map<string, string[]>;
beforeEach(() => {
  initialOHistories = new Map(
    [...integration.server.store.scenes.values()].map((scene) => [scene.id, [...scene.o_history]])
  );
});
afterEach(() => {
  for (const [id, history] of initialOHistories) {
    const scene = integration.server.store.scenes.get(id);
    if (scene) scene.o_history = history;
  }
});

/** Apply what Stash's activity-save mutation does to the cache: update the scene, then evict list queries + GC. */
async function simulateActivitySave(app: BootedApp, sceneId: string) {
  // Imported here rather than at the top: importing StashService creates an Apollo client, which must only happen once
  // the harness has pointed the API at the mock server (this resolves to the booted app's instance)
  const { evictQueries } = await import("stash-ui/dist/src/core/StashService");
  await act(async () => {
    const cache = app.apolloClient.cache;
    cache.modify({
      id: cache.identify({ __typename: "Scene", id: sceneId }),
      fields: { resume_time: () => 42 },
    });
    evictQueries(cache, [GQL.FindScenesDocument]);
  });
  // Give anything the eviction would trigger (refetches, re-renders) time to happen
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
}

function serverOCount(sceneId: string) {
  return integration.server.store.scenes.get(sceneId)?.o_history.length;
}

describe("Background cache updates", () => {
  // Stash's o-count mutation only patches fields of the cached scene, so it silently does nothing if the scene
  // entity was garbage-collected after an earlier eviction.
  it("shows o-count changes on a later-page slide after list queries were evicted", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    // Default page size is 5, so the sixth slide comes from page 2
    await goToSlide(app, 5);
    const sceneId = sceneIdOf(currentSlide(app));
    expect(displayedSideInfo(app, "o-counter")).toBeNull();

    await simulateActivitySave(app, sceneId);
    const oCounterButton = currentSlide(app).querySelector<HTMLElement>(".ActionButton.o-counter .icon-container");
    if (!oCounterButton) throw new Error("O-counter button not rendered");
    // fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
    fireEvent.click(oCounterButton);

    await waitFor(() => expect(serverOCount(sceneId)).toBe(1));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    await app.unmount();
  });

  it("doesn't refetch loaded pages when list queries are evicted", async () => {
    const app = await bootApp();
    const sceneId = sceneIdOf(currentSlide(app));
    // Let the initial load finish first: the 8 fixture scenes are pages 1 and 2 at the default page size of 5
    await waitFor(() => expect(integration.server.getRequestCounts()["FindFullScenes"]).toBe(2));
    integration.server.resetRequestCounts();

    await simulateActivitySave(app, sceneId);

    expect(integration.server.getRequestCounts()["FindFullScenes"] ?? 0).toBe(0);

    await app.unmount();
  });

  it("keeps unsaved tag edits and the player when the scene updates in the background", async () => {
    const app = await bootApp();
    const slide = currentSlide(app);
    const sceneId = sceneIdOf(slide);
    const scenePlayer = slide.querySelector(".ScenePlayer");
    expect(scenePlayer).not.toBeNull();

    // Open the tag editor and remove the scene's tag without saving
    await userEvent.keyboard("e");
    const dialog = await screen.findByRole("dialog");
    const saveButton = within(dialog).getByTestId("MediaSlide--editTagsSaveButton");
    expect(saveButton).toBeDisabled();
    // Focus rather than userEvent.click: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
    act(() => within(dialog).getByRole("combobox").focus());
    await userEvent.keyboard("{Backspace}");
    await waitFor(() => expect(saveButton).toBeEnabled());

    await simulateActivitySave(app, sceneId);

    expect(within(screen.getByRole("dialog")).getByTestId("MediaSlide--editTagsSaveButton")).toBeEnabled();
    expect(currentSlide(app).querySelector(".ScenePlayer")).toBe(scenePlayer);

    await app.unmount();
  });
});
