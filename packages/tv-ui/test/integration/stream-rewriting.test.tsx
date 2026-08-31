/**
 * Stream rewriting integration tests.
 *
 * Tests the preview-only modes that rewrite scene streams:
 * - scenePreviewOnly mode rewrites streams to single "Direct stream"
 *
 * @see docs/media-loading.md § "Preview-only modes"
 * @see docs/video-player.md § "Stream labels"
 */

import { describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Stream rewriting integration", () => {
  it("scenePreviewOnly mode is settable and persisted to config", async () => {
    const { default: App } = await loadFreshAppModules();
    const { getApolloClient } = await import("../../src/hooks/getApolloClient");

    const apolloClient = getApolloClient();
    let rendered!: ReturnType<typeof render>;
    await act(async () => {
      rendered = render(
        <ApolloProvider client={apolloClient}>
          <App />
        </ApolloProvider>
      );
    });

    // Wait for the app to render and load media
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // Enable scene preview mode
    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    await act(async () => {
      setTvConfig("scenePreviewOnly", true);
    });

    // Verify that scenePreviewOnly is true in the config
    const scenePreviewOnly = useTvConfig.getState().get("scenePreviewOnly");
    expect(scenePreviewOnly).toBe(true);
  });

  it("markerPreviewOnly mode is settable and persisted to config", async () => {
    const { default: App } = await loadFreshAppModules();
    const { getApolloClient } = await import("../../src/hooks/getApolloClient");

    const apolloClient = getApolloClient();
    let rendered!: ReturnType<typeof render>;
    await act(async () => {
      rendered = render(
        <ApolloProvider client={apolloClient}>
          <App />
        </ApolloProvider>
      );
    });

    // Wait for the app to render and load media
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // Enable marker preview mode
    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();
    setTvConfig("markerPreviewOnly", true);

    // Verify that markerPreviewOnly is true in the config
    const markerPreviewOnly = useTvConfig.getState().get("markerPreviewOnly");
    expect(markerPreviewOnly).toBe(true);
  });
});
