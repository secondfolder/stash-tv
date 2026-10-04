import { setupIntegrationTest, restoreServerMediaAfterEach } from "./harness";

/**
 * Helpers for the tests of action buttons that drive the current slide's player through Stash's ScenePlayer, which are
 * split across files so they run in parallel.
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a test file for these tests against the mock server (call it at the top of the file) */
export function setupPlayerActionButtonsTest() {
  integration = setupIntegrationTest();
  restoreServerMediaAfterEach(integration);
  return integration;
}

export const firstSceneId = "scene-7"; // The first slide of the default feed
