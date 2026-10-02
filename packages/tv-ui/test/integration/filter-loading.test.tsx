/**
 * Filter loading integration tests.
 *
 * Tests that the app boots into the last viewed channel and applies its source to the feed (fixture filter
 * "2" = "Alpha Scenes" matches only scenes tagged alpha, sorted by title).
 *
 * @see docs/media-loading.md § "Architecture"
 * @see docs/channels.md § "Sources"
 */

import { describe, expect, it } from "vitest";
import { setupIntegrationTest } from "./helpers/harness";
import { bootWithTvConfig, setChannel } from "./helpers/feed";

setupIntegrationTest();

// Fixture filter "2" ("Alpha Scenes") matches scene-1/4/6 only, sorted by title
const ALPHA_SCENES = ["Aurora Ascending", "Drift Duration", "Foothill Flight"];
// Page-one fixtures of the default "All Scenes" filter that alpha excludes
const NON_ALPHA_SCENES = ["Blueprint Boulevard", "Grotto Glow"];

describe("Filter loading integration", () => {
  it("boots into the saved filter of the last viewed channel", async () => {
    const app = await bootWithTvConfig((tvConfig) => setChannel(tvConfig, "2"), "Drift Duration");
    const content = app.rendered.container.textContent ?? "";

    for (const title of ALPHA_SCENES) {
      expect(content).toContain(title);
    }
    for (const title of NON_ALPHA_SCENES) {
      expect(content).not.toContain(title);
    }

    await app.unmount();
  });

  it("boots into every marker for an \"All markers\" channel", async () => {
    // "Intro" is a fixture marker title, never a scene title
    const app = await bootWithTvConfig(
      (tvConfig) => setChannel(tvConfig, { type: "all", entityType: "marker", randomise: false }),
      "Intro"
    );

    await app.unmount();
  });

  it("explains that a channel's filter is missing when it's been deleted from Stash", async () => {
    const app = await bootWithTvConfig(
      (tvConfig) => setChannel(tvConfig, "deleted-filter"),
      "no longer exists in Stash"
    );

    await app.unmount();
  });
});
