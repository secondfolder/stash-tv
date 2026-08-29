import { describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { setupIntegrationTest, loadFreshAppModules } from "./helpers/harness";

/**
 * End-to-end smoke: the real App component tree boots against the mock Stash API —
 * config loads (tvConfigLoaded flips), the default saved filter is selected, the first
 * page of scenes is fetched and rendered into the feed.
 */

const integration = setupIntegrationTest();

describe("App boots against the mock Stash API", () => {
  it("loads config and renders the feed", async () => {
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

    // The app renders nothing until config has loaded (tvConfigLoaded gate)
    await waitFor(
      () => {
        expect(rendered.container.querySelector(".FeedPage, [class*='Feed']")).toBeTruthy();
      },
      { timeout: 10000 }
    );

    // The first page of scenes actually made it into the feed DOM. jsdom can't run
    // videojs players, but the slide markup + titles should exist.
    await waitFor(
      () => {
        const content = rendered.container.textContent ?? "";
        expect(content).toContain("Aurora Ascending");
      },
      { timeout: 10000 }
    );

    // And the mock server actually served the scene query
    const probe = await fetch(`${integration.server.url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `{ findScenes(filter: {per_page: -1}) { count } }`,
      }),
    });
    const body = (await probe.json()) as { data: { findScenes: { count: number } } };
    expect(body.data.findScenes.count).toBe(8);

    // Tear the app down explicitly: unmount stops watch queries/hooks, and stopping
    // both Apollo clients cancels in-flight XHRs (apollo-upload-client uses XHR) so
    // jsdom teardown doesn't turn them into unhandled rejections.
    await act(async () => {
      rendered.unmount();
    });
    const { getClient } = await import("stash-ui/dist/src/core/StashService");
    getClient().stop();
    apolloClient.stop();
  });
});
