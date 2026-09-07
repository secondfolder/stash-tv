/**
 * Mutation integration tests.
 *
 * Tests mutations against the mock Stash API:
 * - Scene mutations (O-counter increment/decrement) persist to server truth
 *
 * @see docs/media-loading.md § "Data flow"
 */

import { describe, expect, it } from "vitest";
import { gql } from "@apollo/client";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

interface SceneOCounter {
  id: string;
  o_counter: number | null;
}

const scenesOQuery = gql`
  query ScenesOCounters {
    findScenes(filter: { per_page: -1 }) {
      scenes {
        id
        o_counter
      }
    }
  }
`;

function isScene(value: unknown): value is SceneOCounter {
  return typeof value === "object" && value !== null && "id" in value && "o_counter" in value;
}

async function oCounterFor(
  apolloClient: Awaited<ReturnType<typeof import("../../src/hooks/getApolloClient").getApolloClient>>,
  sceneId: string,
  fetchPolicy: "cache-first" | "network-only" = "cache-first"
) {
  const { data } = await apolloClient.query({ query: scenesOQuery, fetchPolicy });
  const scene = data.findScenes.scenes.find(
    (s: unknown): s is SceneOCounter => isScene(s) && s.id === sceneId
  );
  expect(scene).toBeDefined();
  return scene.o_counter;
}

describe("Mutation integration", () => {
  it("increments scene O-counter and persists to server", async () => {
    const app = await bootApp();

    // From fixtures, scene-1 has two o_history entries
    expect(await oCounterFor(app.apolloClient, "scene-1")).toBe(2);

    const { data } = await app.apolloClient.mutate({
      mutation: gql`
        mutation IncrementO($id: ID!) {
          sceneIncrementO(id: $id)
        }
      `,
      variables: { id: "scene-1" },
    });
    expect(data?.sceneIncrementO).toBe(3);

    // Server truth, not cache
    expect(await oCounterFor(app.apolloClient, "scene-1", "network-only")).toBe(3);

    await app.unmount();
  });

  it("decrements scene O-counter and persists to server", async () => {
    const app = await bootApp();

    const initial = await oCounterFor(app.apolloClient, "scene-1");
    // The decrement path is only defined above zero — assert the precondition
    // rather than silently skipping when the fixture changes
    expect(initial).toBeGreaterThan(0);

    const { data } = await app.apolloClient.mutate({
      mutation: gql`
        mutation DecrementO($id: ID!) {
          sceneDecrementO(id: $id)
        }
      `,
      variables: { id: "scene-1" },
    });
    expect(data?.sceneDecrementO).toBe(initial - 1);

    expect(await oCounterFor(app.apolloClient, "scene-1", "network-only")).toBe(initial - 1);

    await app.unmount();
  });
});
