/**
 * Config persistence integration tests.
 *
 * Tests the hybrid storage system where config keys are split between
 * localStorage and Stash config via ConfigurePlugin mutation:
 * - A ConfigurePlugin mutation persists to the mock store and is served back
 * - Config set through the app's store is rehydrated on a fresh boot
 *   (cross-"device" persistence)
 *
 * @see docs/state-and-config.md § "Hybrid Storage"
 */

import { describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Config persistence integration", () => {
  it("ConfigurePlugin mutation persists to the mock store and is served back", async () => {
    const app = await bootApp();
    const GQL = await import("stash-ui/dist/src/core/generated-graphql");

    await app.apolloClient.mutate({
      mutation: GQL.ConfigurePluginDocument,
      variables: {
        plugin_id: "stash-tv",
        input: {
          volume: 75,
          crtEffect: true,
        },
      },
    });

    // Read back through a different operation, from the server (not cache)
    const { data } = await app.apolloClient.query({
      query: GQL.ConfigurationDocument,
      fetchPolicy: "network-only",
    });
    const stored = data.configuration.plugins["stash-tv"];
    expect(stored.volume).toBe(75);
    expect(stored.crtEffect).toBe(true);

    await app.unmount();
  });

  it("rehydrates config set through the app store on a fresh boot", async () => {
    // First boot: set a Stash-persisted config value through the app's store
    const first = await bootApp();
    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    await act(async () => {
      setTvConfig("volume", 0.75);
    });

    // Wait for the hybrid storage write to land on the server
    await waitFor(
      () => {
        const stored = integration.server.store.pluginConfig["stash-tv"];
        expect(stored).toBeDefined();
        expect(String(stored["app-state"])).toContain('"volume":0.75');
      },
      { timeout: 5000 }
    );
    await first.unmount();

    // Second boot (fresh modules): the store hydrates from the server config
    const second = await bootApp();
    const { useTvConfig: freshTvConfig } = await import("../../src/store/tvConfig");
    await waitFor(
      () => {
        expect(freshTvConfig.getState().get("volume")).toBe(0.75);
      },
      { timeout: 5000 }
    );

    await second.unmount();
  });
});
