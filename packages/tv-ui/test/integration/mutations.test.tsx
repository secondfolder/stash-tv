/**
 * Mutation integration tests.
 *
 * Tests mutations against the mock Stash API:
 * - Scene mutations (O-counter increment/decrement)
 * - Optimistic updates and server truth
 *
 * @see docs/media-loading.md § "Data flow"
 */

import { describe, expect, it } from "vitest";
import { render, waitFor, act, screen } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { gql } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Mutation integration", () => {
  it("increments scene O-counter and persists to server", async () => {
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

    // Wait for the app to render
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // Query the initial O-counter for scene-1 (Aurora Ascending)
    // From fixtures, scene-1 has o_history: ["2024-03-02T10:00:00Z", "2024-03-03T11:00:00Z"]
    // which gives o_counter: 2
    const initialOQuery = gql`
      query Scene1InitialO {
        findScenes(filter: { per_page: -1 }) {
          scenes {
            id
            title
            o_counter
          }
        }
      }
    `;

    const { data: initialData } = await apolloClient.query({ query: initialOQuery });
    const auroraScene = initialData?.findScenes?.scenes.find((s: any) => s.id === "scene-1");

    expect(auroraScene).toBeDefined();
    expect(auroraScene.title).toBe("Aurora Ascending");
    const initialOCount = auroraScene.o_counter;
    expect(initialOCount).toBe(2);

    // Increment the O-counter using the mutation
    const incrementOMutation = gql`
      mutation IncrementO($id: ID!) {
        sceneIncrementO(id: $id)
      }
    `;

    const { data: incrementData } = await apolloClient.mutate({
      mutation: incrementOMutation,
      variables: { id: "scene-1" },
    });

    expect(incrementData?.sceneIncrementO).toBeDefined();
    expect(incrementData.sceneIncrementO).toBe(initialOCount + 1);

    // Verify the increment persisted by querying again
    const { data: verifyData } = await apolloClient.query({
      query: initialOQuery,
      fetchPolicy: "network-only" // Skip cache to get server truth
    });

    const verifyScene = verifyData?.findScenes?.scenes.find((s: any) => s.id === "scene-1");
    expect(verifyScene.o_counter).toBe(initialOCount + 1);

    // Cleanup
    await act(async () => {
      rendered.unmount();
    });
    const { getClient } = await import("stash-ui/dist/src/core/StashService");
    getClient().stop();
    apolloClient.stop();
  });

  it("decrements scene O-counter when above zero", async () => {
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

    // Wait for the app to render
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Foothill Flight");
      },
      { timeout: 10000 }
    );

    // Get initial O-count for scene-1
    const sceneQuery = gql`
      query {
        findScenes(filter: { per_page: -1 }) {
          scenes {
            id
            o_counter
          }
        }
      }
    `;

    const { data: initialData } = await apolloClient.query({ query: sceneQuery });
    const scene = initialData?.findScenes?.scenes.find((s: any) => s.id === "scene-1");
    const initialOCount = scene.o_counter;

    // Decrement the O-counter
    const decrementOMutation = gql`
      mutation DecrementO($id: ID!) {
        sceneDecrementO(id: $id)
      }
    `;

    // Only decrement if count > 0
    if (initialOCount > 0) {
      const { data: decrementData } = await apolloClient.mutate({
        mutation: decrementOMutation,
        variables: { id: "scene-1" },
      });

      expect(decrementData?.sceneDecrementO).toBeDefined();
      expect(decrementData.sceneDecrementO).toBe(initialOCount - 1);

      // Verify the decrement persisted
      const { data: verifyData } = await apolloClient.query({
        query: sceneQuery,
        fetchPolicy: "network-only"
      });

      const verifyScene = verifyData?.findScenes?.scenes.find((s: any) => s.id === "scene-1");
      expect(verifyScene.o_counter).toBe(initialOCount - 1);
    }

    // Cleanup
    await act(async () => {
      rendered.unmount();
    });
    const { getClient } = await import("stash-ui/dist/src/core/StashService");
    getClient().stop();
    apolloClient.stop();
  });
});
