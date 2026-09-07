/**
 * Media loading integration tests.
 *
 * The first page of scenes (default "All Scenes" filter, sorted by date desc,
 * page size 5) loads and renders in the feed.
 *
 * @see docs/media-loading.md § "Data flow"
 */

import { describe, expect, it } from "vitest";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

// First page of the default filter: 5 newest scenes by date desc
const FIRST_PAGE_TITLES = [
  "Grotto Glow", // 2025-02-14
  "Foothill Flight", // 2025-01-20
  "Cascade Calm", // 2024-04-10
  "Aurora Ascending", // 2024-03-01
  "Blueprint Boulevard", // 2024-02-15
];
// Older fixtures that must wait for page 2
const SECOND_PAGE_TITLES = ["Drift Duration", "Ember Evening", "Horizon Hush"];

describe("Media loading integration", () => {
  it("loads the first page of scenes and renders them in the feed", async () => {
    const app = await bootApp();

    const content = app.rendered.container.textContent ?? "";
    for (const title of FIRST_PAGE_TITLES) {
      expect(content).toContain(title);
    }
    for (const title of SECOND_PAGE_TITLES) {
      expect(content).not.toContain(title);
    }

    await app.unmount();
  });
});
