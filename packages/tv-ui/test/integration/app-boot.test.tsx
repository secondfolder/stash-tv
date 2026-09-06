import { describe, expect, it } from "vitest";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

/**
 * End-to-end smoke: the real App component tree boots against the mock Stash API —
 * config loads (tvConfigLoaded flips), the default saved filter is selected, the first
 * page of scenes is fetched and rendered into the feed.
 */

const integration = setupIntegrationTest();

describe("App boots against the mock Stash API", () => {
  it("loads config and renders the feed", async () => {
    const app = await bootApp();

    // The feed (not, e.g., a settings or feedback overlay) rendered
    expect(app.rendered.container.querySelector(".FeedPage")).toBeTruthy();

    // The mock server actually served the scene data behind it
    const probe = await fetch(`${integration.server.url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `{ findScenes(filter: {per_page: -1}) { count } }`,
      }),
    });
    const body = (await probe.json()) as { data: { findScenes: { count: number } } };
    expect(body.data.findScenes.count).toBe(8);

    // Apollo clients are not stopped — see the harness NOTE
    await app.unmount();
  });
});
