/**
 * Media loading integration tests.
 *
 * Tests the media pagination and accumulation behavior against the mock Stash API:
 * - First page loads correctly and renders in the UI
 * - Multiple scenes are displayed from the first page
 *
 * @see docs/media-loading.md § "Architecture"
 */

import { describe, expect, it } from "vitest";
import { render, waitFor, act, screen } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Media loading integration", () => {
  it("loads first page of scenes and renders them in the feed", async () => {
    const { default: App } = await loadFreshAppModules();
    const { getApolloClient } = await import("../../src/hooks/getApolloClient");

    let rendered: ReturnType<typeof render>;
    const apolloClient = getApolloClient();
    await act(async () => {
      rendered = render(
        <ApolloProvider client={apolloClient}>
          <App />
        </ApolloProvider>
      );
    });

    // Wait for the app to render and load the first page of scenes
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // Verify multiple scenes from the first page are rendered
    // Default pageSize is 5, scenes are ordered by date desc
    const content = rendered.container.textContent ?? "";
    expect(content).toContain("Foothill Flight"); // 2025-01-20
    expect(content).toContain("Grotto Glow"); // 2025-02-14
    expect(content).toContain("Aurora Ascending"); // 2024-03-01
    expect(content).toContain("Cascade Calm"); // 2024-04-10
    expect(content).toContain("Blueprint Boulevard"); // 2024-02-15

    // Cleanup
    await act(async () => {
      rendered.unmount();
    });
    const { getClient } = await import("stash-ui/dist/src/core/StashService");
    getClient().stop();
    apolloClient.stop();
  });
});
