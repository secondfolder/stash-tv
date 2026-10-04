import { fireEvent, within } from "@testing-library/react";
import { setupIntegrationTest, restoreServerMediaAfterEach, type BootedApp } from "./harness";
import { bootWithTvConfig, currentSlide, setChannel } from "./feed";

/**
 * Helpers for the tests of action buttons that change the current scene or marker in Stash, which are split across
 * files so they run in parallel. Each test's changes to the server's scenes and markers are undone after it.
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a test file for these tests against the mock server (call it at the top of the file) */
export function setupSceneActionButtonsTest() {
  integration = setupIntegrationTest();
  restoreServerMediaAfterEach(integration);
  return integration;
}

// Fixture data for the first slide of the default feed (the newest scene)
export const firstScene = { id: "scene-7", tagIds: ["tag-beta"] };
// Fixture data for the first slide of the "All Markers" feed
export const firstMarker = { id: "marker-1", sceneId: "scene-1", primaryTagId: "tag-alpha" };

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
export function click(element: HTMLElement) {
  fireEvent.click(element);
}

/**
 * The current slide's action button with the given accessible name (its title). In the action button stack: the scene
 * info panel can have buttons of the same name (e.g. its o-count's "Mark Orgasm").
 */
export async function actionButton(app: BootedApp, name: string | RegExp) {
  const stack = await within(currentSlide(app)).findByTestId("MediaSlide--toggleableUi");
  return within(stack).findByRole("button", { name });
}

export function serverScene(sceneId: string) {
  const scene = integration.server.store.scenes.get(sceneId);
  if (!scene) throw new Error(`No scene ${sceneId} on the server`);
  return scene;
}

export function serverMarker(markerId: string) {
  const marker = integration.server.store.markers.get(markerId);
  if (!marker) throw new Error(`No marker ${markerId} on the server`);
  return marker;
}

export async function bootMarkersFeed() {
  // Fixture filter "3" is "All Markers", sorted by scene
  return await bootWithTvConfig((tvConfig) => setChannel(tvConfig, "3"), "Intro");
}
