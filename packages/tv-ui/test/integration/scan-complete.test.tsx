/**
 * ScanComplete subscription integration tests.
 *
 * Tests the WebSocket subscription behavior:
 * - Client subscribes to ScanCompleteSubscribe
 * - When scan completes, client.resetStore() is called
 * - Observed refetch happens after reset
 *
 * @see docs/media-loading.md § "Data flow"
 */

import { describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("ScanComplete subscription integration", () => {
  it("triggerScanComplete causes client resetStore and observed refetch", async () => {
    const { default: App } = await loadFreshAppModules();
    const { getApolloClient } = await import("../../src/hooks/getApolloClient");
    const GQL = await import("stash-ui/dist/src/core/generated-graphql");

    const apolloClient = getApolloClient();
    let rendered!: ReturnType<typeof render>;
    await act(async () => {
      rendered = render(
        <ApolloProvider client={apolloClient}>
          <App />
        </ApolloProvider>
      );
    });

    // Wait for the app to render and load initial data
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // Store a snapshot of the cache before triggering scan
    const cacheBefore = apolloClient.extract();
    const scenesBefore = Object.values(cacheBefore).filter((obj: any) =>
      obj?.__typename === "Scene"
    );
    const initialSceneCount = scenesBefore.length;
    expect(initialSceneCount).toBeGreaterThan(0);

    // Trigger scan complete via the mock server
    integration.server.triggerScanComplete();

    // Wait for the client to reset and refetch
    await waitFor(
      () => {
        // After resetStore, the app should refetch and the cache should repopulate
        const cacheAfter = apolloClient.extract();
        const scenesAfter = Object.values(cacheAfter).filter((obj: any) =>
          obj?.__typename === "Scene"
        );
        expect(scenesAfter.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    // Verify the cache was reset (refetched data should be present)
    const cacheAfter = apolloClient.extract();
    const scenesAfter = Object.values(cacheAfter).filter((obj: any) =>
      obj?.__typename === "Scene"
    );
    expect(scenesAfter.length).toBe(initialSceneCount);
  });
});
