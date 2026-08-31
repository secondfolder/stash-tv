/**
 * Media items modifier function integration tests.
 *
 * Tests the custom media modifier functionality where users can write
 * custom JavaScript functions (stored as strings) that transform the
 * media list before display.
 *
 * @see docs/media-loading.md § "Media items modifier"
 * @see AGENTS.md § "Custom media modifier functions"
 */

import { describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Media items modifier function integration", () => {
  it("mediaItemsModifierFunction is settable and persisted to config", async () => {
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

    // Set showDevOptions to enable modifier functions
    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    await act(async () => {
      setTvConfig("showDevOptions", true);
    });

    // Set a modifier function that filters to only scenes with id ending in odd numbers
    const modifierFunction = "(items) => items.filter(item => item.id.endsWith('1') || item.id.endsWith('3') || item.id.endsWith('5') || item.id.endsWith('7') || item.id.endsWith('9'))";

    await act(async () => {
      setTvConfig("mediaItemsModifierFunction", modifierFunction);
    });

    // Verify that showDevOptions is persisted
    const showDevOptions = useTvConfig.getState().get("showDevOptions");
    expect(showDevOptions).toBe(true);

    // Verify that mediaItemsModifierFunction is persisted to config
    const persistedFunction = useTvConfig.getState().get("mediaItemsModifierFunction");
    expect(persistedFunction).toBe(modifierFunction);
  });
});
