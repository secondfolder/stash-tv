import { fireEvent, within } from "@testing-library/react";
import { setupIntegrationTest, restoreServerMediaAfterEach, type BootedApp } from "./harness";
import { currentSlide } from "./feed";

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

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
export function click(element: HTMLElement) {
  fireEvent.click(element);
}

export function actionButton(app: BootedApp, name: string | RegExp) {
  return within(currentSlide(app)).findByRole("button", { name });
}

export async function tvConfig() {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  return useTvConfig.getState();
}
