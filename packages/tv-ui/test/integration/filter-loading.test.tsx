/**
 * Filter loading integration tests.
 *
 * Tests that the app boots into the saved filter configured via
 * `currentFilterId`, applying its entity filter to the feed (fixture filter
 * "2" = "Alpha Scenes" matches only scenes tagged alpha, sorted by title).
 *
 * @see docs/media-loading.md § "Architecture"
 */

import { describe, expect, it } from "vitest";
import { act } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

// Fixture filter "2" ("Alpha Scenes") matches scene-1/4/6 only, sorted by title
const ALPHA_SCENES = ["Aurora Ascending", "Drift Duration", "Foothill Flight"];
// Page-one fixtures of the default "All Scenes" filter that alpha excludes
const NON_ALPHA_SCENES = ["Blueprint Boulevard", "Grotto Glow"];

describe("Filter loading integration", () => {
  it("boots into the filter configured as currentFilterId", async () => {
    // First boot with the default filter, then switch the configured filter
    const first = await bootApp();
    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    await act(async () => {
      setTvConfig("currentFilterId", "2");
    });
    await first.unmount();

    // Fresh boot: the app should load and apply the "Alpha Scenes" filter
    const second = await bootApp("Drift Duration");
    const content = second.rendered.container.textContent ?? "";

    for (const title of ALPHA_SCENES) {
      expect(content).toContain(title);
    }
    for (const title of NON_ALPHA_SCENES) {
      expect(content).not.toContain(title);
    }

    await second.unmount();
  });
});
