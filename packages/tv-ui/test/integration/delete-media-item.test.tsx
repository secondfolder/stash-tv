/**
 * Deleting the current scene from the feed.
 *
 * Deleting must remove the item, move on to the next one, and leave every remaining item reachable: Stash paginates
 * by page number, so a delete shifts every later item back one place on the server, and the feed must neither skip
 * nor get stuck on items because of that.
 *
 * @see docs/media-loading.md § "Data flow"
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, goToNextSlide, sceneIdOf, slides } from "./helpers/feed";

const integration = setupIntegrationTest();

// The server store outlives each test, so restore deleted scenes (and their markers) afterwards
let initialScenes: [string, unknown][];
let initialMarkers: [string, unknown][];
beforeEach(() => {
  initialScenes = [...integration.server.store.scenes.entries()];
  initialMarkers = [...integration.server.store.markers.entries()];
});
afterEach(() => {
  const { scenes, markers } = integration.server.store;
  for (const [id, scene] of initialScenes) if (!scenes.has(id)) scenes.set(id, scene as never);
  for (const [id, marker] of initialMarkers) if (!markers.has(id)) markers.set(id, marker as never);
});

/** Scene ids in the default "All Scenes" feed order (date desc), as the server currently has them. */
function serverFeedOrder() {
  return [...integration.server.store.scenes.values()]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map((scene) => scene.id);
}

async function deleteCurrentItem(app: BootedApp) {
  const sceneId = sceneIdOf(currentSlide(app));
  await userEvent.keyboard("d");
  const confirmButton = await waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>(".ModalComponent .btn-danger");
    if (!button) throw new Error("Delete confirmation not shown");
    return button;
  });
  // fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
  fireEvent.click(confirmButton);
  await waitFor(() => expect(integration.server.store.scenes.has(sceneId)).toBe(false));
  await waitFor(() => expect(slides(app).map(sceneIdOf)).not.toContain(sceneId));
  return sceneId;
}

describe("Deleting a media item", () => {
  it("moves on to the next item after deleting the current one", async () => {
    const app = await bootApp();
    const [, nextSceneId] = serverFeedOrder();

    await deleteCurrentItem(app);

    await waitFor(() => expect(sceneIdOf(currentSlide(app))).toBe(nextSceneId));

    await app.unmount();
  });

  // A deleted scene leaves its slide's data incomplete, like a field Stash's mutations evict, but there's nothing to
  // refetch. (Other slides' scenes are refetched: deleting evicts fields they share, like tag and performer counts.)
  // See docs/media-loading.md § "Live item data"
  it("doesn't try to refetch the deleted scene", async () => {
    const app = await bootApp();
    integration.server.resetRequestCounts();

    const deletedSceneId = await deleteCurrentItem(app);
    // Give a refetch time to happen
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

    const sceneRefetches = integration.server.getRequests().filter((request) => request.operationName === "FindScene");
    expect(sceneRefetches.map((request) => request.variables.id)).not.toContain(deletedSceneId);

    await app.unmount();
  });

  it("keeps every remaining item reachable, in order, after deleting one", async () => {
    // With pages of 2 the feed has loaded only some of the 8 fixture scenes when the delete happens, so the delete
    // shifts items the feed hasn't fetched yet
    const app = await bootWithTvConfig((tvConfig) => tvConfig.set("pageSize", 2));

    await deleteCurrentItem(app);
    const expectedOrder = serverFeedOrder();
    const visited = [sceneIdOf(currentSlide(app))];
    for (let i = 1; i < expectedOrder.length; i++) {
      await goToNextSlide(app);
      visited.push(sceneIdOf(currentSlide(app)));
    }

    expect(visited).toEqual(expectedOrder);

    await app.unmount();
  });
});
