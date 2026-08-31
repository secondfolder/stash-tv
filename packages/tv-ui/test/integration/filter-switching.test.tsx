/**
 * Filter switching integration tests.
 *
 * Tests the filter selection and accumulator reset behavior:
 * - Saved filters list loads correctly
 *
 * @see docs/media-loading.md § "Architecture"
 */

import { describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Filter switching integration", () => {
  it("loads saved filters list and displays them", async () => {
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

    // Wait for the app to render and load filters
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // The saved filters should be loaded via useMediaItemFilters
    // We can verify this by checking that filters exist in the Apollo cache
    const filtersQuery = await apolloClient.query({
      query: (await import("stash-ui/dist/src/core/generated-graphql")).FindSavedFiltersDocument,
      variables: { mode: "SCENES" },
    });

    expect(filtersQuery.data.findSavedFilters).toHaveLength(2);
    expect(filtersQuery.data.findSavedFilters[0].name).toBe("All Scenes");
    expect(filtersQuery.data.findSavedFilters[1].name).toBe("Alpha Scenes");
  });
});
