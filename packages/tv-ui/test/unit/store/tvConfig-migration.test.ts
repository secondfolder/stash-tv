/**
 * Config migration tests.
 *
 * Tests the tvConfig migration logic for:
 * - v0 → v1: audioMuted → volume conversion, mute button type → volume button type
 * - v1 → v2: actionButtonsConfig → actionButtonStackConfig conversion
 * - v2 → v3: currentFilterId + isRandomised → a single channel
 *
 * These are real user-upgrade paths — when a user upgrades the plugin, their
 * persisted config should be automatically migrated to the current version.
 * The persisted state is seeded in localStorage under the hybrid storage's
 * local key (`app-state-local`); the Stash-side backend is mocked empty.
 *
 * @see docs/state-and-config.md § "Hybrid Storage"
 * @see docs/channels.md § "Migration"
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// The Apollo client must be mocked: hydration reads the Stash-side config
// through it, and unit tests must never make real network requests.
const { apolloQuery } = vi.hoisted(() => ({
  apolloQuery: vi.fn(() =>
    Promise.resolve({ data: { configuration: { plugins: {} } } })
  ),
}));

vi.mock("../../../src/hooks/getApolloClient", () => ({
  getApolloClient: vi.fn(() => ({
    query: apolloQuery,
    mutate: vi.fn(() => Promise.resolve({ data: {} })),
    stop: vi.fn(),
  })),
}));

const LOCAL_STORAGE_KEY = "app-state-local";

/** Seed persisted config state at the given schema version. */
function seedPersistedState(version: number, state: Record<string, unknown>) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ state, version }));
}

/** Re-import the store fresh so it rehydrates from the seeded state. */
async function reimportStore() {
  vi.resetModules();
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  const { useGlobalState } = await import("../../../src/store/globalState");
  await vi.waitFor(() => {
    expect(useGlobalState.getState().tvConfigLoaded).toBe(true);
  });
  return useTvConfig.getState();
}

/** Buttons in an action button stack config, with the union narrowed. */
function buttonsIn(config: { actionButtonStackConfig: { type: string; buttonType?: string }[] }) {
  return config.actionButtonStackConfig.filter(
    (item): item is { type: string; buttonType: string } =>
      item.type === "button" && typeof item.buttonType === "string"
  );
}

describe("tvConfig migration", () => {
  beforeEach(() => {
    localStorage.clear();
    apolloQuery.mockClear();
  });

  describe("v0 → v1 migration", () => {
    it("migrates audioMuted: true to volume: 0", async () => {
      seedPersistedState(0, { audioMuted: true });

      const config = await reimportStore();

      expect(config.volume).toBe(0);
      expect("audioMuted" in config).toBe(false);
    });

    it("migrates audioMuted: false to volume: 1", async () => {
      // The default volume is 0, so a migrated 1 is observable proof of the
      // false → 1 mapping (not just defaults loading)
      seedPersistedState(0, { audioMuted: false });

      const config = await reimportStore();

      expect(config.volume).toBe(1);
      expect("audioMuted" in config).toBe(false);
    });

    it("converts mute button type to volume button type", async () => {
      seedPersistedState(0, {
        audioMuted: false,
        actionButtonsConfig: [
          { type: "mute", folder: "default", position: 0 },
          { type: "settings", folder: "default", position: 1 },
        ],
      });

      const config = await reimportStore();

      // The v1 → v2 step also runs, so the buttons land in the stack config
      const buttons = buttonsIn(config);
      expect(buttons.map((button) => button.buttonType)).toEqual(
        expect.arrayContaining(["volume", "settings"])
      );
    });

    it("falls back to the default volume when audioMuted is absent", async () => {
      seedPersistedState(0, {});

      const config = await reimportStore();

      expect(config.volume).toBe(0);
      expect("audioMuted" in config).toBe(false);
    });
  });

  describe("v1 → v2 migration", () => {
    it("migrates actionButtonsConfig to actionButtonStackConfig", async () => {
      seedPersistedState(1, {
        actionButtonsConfig: [
          { type: "volume", folder: "default", position: 0 },
          { type: "settings", folder: "custom", position: 1 },
        ],
        volume: 0.5,
      });

      const config = await reimportStore();

      expect("actionButtonsConfig" in config).toBe(false);
      const buttons = buttonsIn(config);
      const buttonTypes = buttons.map((button) => button.buttonType);
      expect(buttonTypes).toEqual(expect.arrayContaining(["volume", "settings"]));
      // Non-button config survives the migration
      expect(config.volume).toBe(0.5);
    });

    it("applies the default stack config when actionButtonsConfig is missing", async () => {
      seedPersistedState(1, { volume: 0.5 });

      const config = await reimportStore();

      expect("actionButtonsConfig" in config).toBe(false);
      expect(config.actionButtonStackConfig.length).toBeGreaterThan(0);
      expect(buttonsIn(config).length).toBeGreaterThan(0);
    });
  });

  describe("full v0 → v2 migration", () => {
    it("migrates through both versions correctly", async () => {
      seedPersistedState(0, {
        audioMuted: true,
        actionButtonsConfig: [
          { type: "mute", folder: "default", position: 0 },
          { type: "settings", folder: "default", position: 1 },
        ],
      });

      const config = await reimportStore();

      // v0 → v1 results
      expect(config.volume).toBe(0);
      expect("audioMuted" in config).toBe(false);
      // v1 → v2 results
      expect("actionButtonsConfig" in config).toBe(false);
      expect(buttonsIn(config).map((button) => button.buttonType)).toEqual(
        expect.arrayContaining(["volume", "settings"])
      );
    });
  });

  describe("v2 → v3 migration", () => {
    it("turns the selected filter and randomise option into the last viewed channel", async () => {
      seedPersistedState(2, { currentFilterId: "7", isRandomised: true });

      const config = await reimportStore();

      expect(config.channels).toEqual([
        { id: expect.any(String), sources: [{ type: "stash-saved-filter", savedFilterId: "7", randomise: true }] },
      ]);
      expect(config.lastViewedChannelId).toBe(config.channels[0].id);
      expect(config.startupChannel).toBe("last-viewed");
      expect("currentFilterId" in config).toBe(false);
      expect("isRandomised" in config).toBe(false);
    });

    it("gives the default \"All scenes\" channel when no filter was selected", async () => {
      seedPersistedState(2, { isRandomised: true });

      const config = await reimportStore();

      expect(config.channels).toEqual([
        { id: "all-scenes", sources: [{ type: "all", entityType: "scene", randomise: false }] },
      ]);
      expect(config.lastViewedChannelId).toBeUndefined();
      expect("isRandomised" in config).toBe(false);
    });
  });

  describe("current version (v3) remains unchanged", () => {
    it("loads v3 state without migrating it", async () => {
      const channels = [{ id: "c1", sources: [{ type: "all", entityType: "marker", randomise: false }] }];
      seedPersistedState(3, {
        volume: 0.5,
        autoPlay: false,
        channels,
        lastViewedChannelId: "c1",
        actionButtonStackConfig: [
          { id: "test-1", type: "button", buttonType: "volume", pinned: false },
        ],
      });

      const config = await reimportStore();

      expect(config.volume).toBe(0.5);
      expect(config.autoPlay).toBe(false);
      expect(config.channels).toEqual(channels);
      expect(config.lastViewedChannelId).toBe("c1");
      expect(buttonsIn(config).some((button) => button.buttonType === "volume")).toBe(true);
    });
  });
});
