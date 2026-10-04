/**
 * Config persistence integration tests.
 *
 * Tests the hybrid storage system where config keys are split between
 * localStorage and Stash config via ConfigurePlugin mutation: config set through
 * the app's store is rehydrated on a fresh boot (cross-"device" persistence).
 * (That mock-stash serves back what ConfigurePlugin saves is tested in mock-stash.)
 *
 * @see docs/state-and-config.md § "Hybrid Storage"
 */

import { describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

describe("Config persistence integration", () => {
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
