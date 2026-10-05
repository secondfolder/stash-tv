/**
 * Plugin initialization tests
 *
 * Exercises the real main.tsx against a mocked PluginApi: patch registration
 * and first-run setup (ConfigureInterface menu-items injection gated on
 * initialSetupComplete).
 */

import { describe, it, expect, vi } from "vitest";
import { importPlugin } from "./test-harness";

// main.tsx transitively imports tv-ui's config store, which builds an Apollo
// client from Stash's StashService — that touches `document`, which doesn't
// exist in the node test environment. Stub the Stash client; its query/mutate
// failures are caught by stash-config-storage.
vi.mock("stash-ui/dist/src/core/StashService", () => ({
  getClient: () => ({ cache: {}, link: undefined }),
}));

describe("Plugin initialization", () => {
  it("registers patches for PluginSettings, MainNavBar.MenuItems, CheckboxGroup and ScenePage", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });

    const targets = mock.patches.map((p) => `${p.type}:${p.target}`).sort();
    expect(targets).toEqual([
      "before:CheckboxGroup",
      "instead:MainNavBar.MenuItems",
      "instead:PluginSettings",
      "instead:ScenePage",
    ]);
  });

  it("adds tv to menu items via ConfigureInterface on first run", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": {} } });

    await vi.waitFor(() => {
      expect(mock.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          mutation: "ConfigureInterfaceDocument",
          variables: expect.objectContaining({
            input: expect.objectContaining({ menuItems: expect.arrayContaining(["tv"]) }),
          }),
        })
      );
    });
  });

  it("marks initialSetupComplete in the plugin config on first run", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { volume: 50 } } });

    await vi.waitFor(() => {
      expect(mock.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          mutation: "ConfigurePluginDocument",
          variables: expect.objectContaining({
            plugin_id: "stash-tv",
            input: expect.objectContaining({ initialSetupComplete: true, volume: 50 }),
          }),
        })
      );
    });
  });

  it("does not run setup when initialSetupComplete is already true", async () => {
    const mock = await importPlugin({
      plugins: { "stash-tv": { initialSetupComplete: true } },
      interface: { menuItems: ["scenes"] },
    });

    // Give any (incorrectly started) setup chain a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const interfaceMutations = mock.mutate.mock.calls.filter(
      (call) => call[0]?.mutation === "ConfigureInterfaceDocument"
    );
    expect(interfaceMutations).toHaveLength(0);
  });

  it("setupPlugin does not duplicate tv in existing menu items", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
    const { setupPlugin } = await import("../../main");
    mock.mutate.mockClear();

    mock.query.mockResolvedValue({
      data: {
        configuration: {
          plugins: { "stash-tv": { initialSetupComplete: true } },
          interface: { menuItems: ["tv", "scenes"], soundOnPreview: true },
        },
      },
    });

    await setupPlugin();
    await setupPlugin();

    await vi.waitFor(() => {
      expect(mock.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            input: expect.objectContaining({
              menuItems: ["tv", "scenes"],
              soundOnPreview: true,
            }),
          }),
        })
      );
    });
    const interfaceMutations = mock.mutate.mock.calls.filter(
      (call) => call[0]?.mutation === "ConfigureInterfaceDocument"
    );
    expect(interfaceMutations).toHaveLength(2);
  });
});
