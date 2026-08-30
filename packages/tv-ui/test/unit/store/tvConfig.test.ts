import { describe, expect, it, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { useTvConfig } from "../../../src/store/tvConfig";
import { resetStores, setTvConfigLoaded } from "../helpers/stores";

/**
 * Unit tests for the tvConfig Zustand store.
 *
 * Only behavior tests live here — guards, persistence routing, and migration.
 * Deliberately excluded: default-value restatements and set/get round-trips
 * (tautologies that mirror the source without testing behavior).
 *
 * @see docs/state-and-config.md § "Hybrid Storage"
 */

// Mock the Apollo client to prevent connection attempts
vi.mock("../../../src/hooks/getApolloClient", () => ({
  getApolloClient: vi.fn(() => ({
    query: vi.fn(() => Promise.resolve({ data: { configuration: { plugins: {} } } })),
    mutate: vi.fn(() => Promise.resolve({ data: {} })),
    stop: vi.fn(),
  })),
}));

describe("tvConfig store", () => {
  beforeEach(() => {
    resetStores();
    localStorage.clear();
  });

  describe("set", () => {
    it("applies an updater function with the previous value", () => {
      const { set, get } = useTvConfig.getState();

      act(() => {
        set("volume", (prev) => prev + 0.3);
      });

      expect(get("volume")).toBe(0.3);
    });
  });

  describe("tvConfigLoaded gating", () => {
    it("does not set values when tvConfigLoaded is false", () => {
      setTvConfigLoaded(false);
      const { set, get } = useTvConfig.getState();

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        set("volume", 0.9);
      });

      expect(get("volume")).toBe(0); // Should remain at default
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tried to set volume")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("before config was loaded")
      );

      consoleSpy.mockRestore();
    });

    it("does not setToDefault when tvConfigLoaded is false", () => {
      setTvConfigLoaded(false);
      const { set, get, setToDefault } = useTvConfig.getState();

      // Set a value first
      act(() => {
        setTvConfigLoaded(true);
        set("volume", 0.7);
        setTvConfigLoaded(false);
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        setToDefault("volume");
      });

      expect(get("volume")).toBe(0.7); // Should remain unchanged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tried to set volume to default before store was loaded")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("hybrid storage routing", () => {
    it("stores forceLandscape in localStorage", () => {
      const { set } = useTvConfig.getState();

      act(() => {
        set("forceLandscape", true);
      });

      // forceLandscape should be in localStorage with -local suffix
      const localData = localStorage.getItem("app-state-local");
      expect(localData).toBeTruthy();
      if (localData) {
        const parsed = JSON.parse(localData);
        expect(parsed.state.forceLandscape).toBe(true);
      }
    });

    it("stores non-localStorageKeys in Stash config (simulated)", () => {
      const { set } = useTvConfig.getState();

      act(() => {
        set("volume", 0.5);
        set("autoPlay", false);
      });

      // These should NOT be in localStorage - they should be in the Stash config
      // Since we mock the Apollo client, we can't actually test Stash config storage
      // but we can verify they don't end up in localStorage
      const localData = localStorage.getItem("app-state-local");
      // The localStorage might have empty state or not exist at all
      // If it exists, it should not contain volume or autoPlay
      if (localData) {
        const parsed = JSON.parse(localData);
        expect(parsed.state.volume).toBeUndefined();
        expect(parsed.state.autoPlay).toBeUndefined();
      }
    });

    it("splits state correctly between both storage backends", () => {
      const { set } = useTvConfig.getState();

      act(() => {
        set("forceLandscape", true); // Goes to localStorage
        set("volume", 0.6); // Goes to Stash config
        set("autoPlay", false); // Goes to Stash config
      });

      const localData = localStorage.getItem("app-state-local");
      expect(localData).toBeTruthy();
      if (localData) {
        const parsed = JSON.parse(localData);
        expect(parsed.state.forceLandscape).toBe(true);
        expect(parsed.state.volume).toBeUndefined();
        expect(parsed.state.autoPlay).toBeUndefined();
      }
    });
  });

  describe("actionButtonStackConfig structure", () => {
    it("has the correct nested folder structure", () => {
      const { actionButtonStackConfig } = useTvConfig.getState();

      const folder12 = actionButtonStackConfig.find((item) => item.id === "12");
      expect(folder12).toBeDefined();
      expect(folder12?.type).toBe("folder");
      expect(folder12?.pinned).toBe(false);

      const folder13 = actionButtonStackConfig.find((item) => item.id === "13");
      expect(folder13).toBeDefined();
      expect(folder13?.type).toBe("folder");
      expect(folder13?.pinned).toBe(false);

      // Narrow the union before accessing folder-only properties
      const contents12 = folder12?.type === "folder" ? folder12.contents : undefined;
      const contents13 = folder13?.type === "folder" ? folder13.contents : undefined;
      expect(contents12).toHaveLength(5);
      expect(contents13).toHaveLength(4);
    });

    it("has correct buttonType values after v1→v2 migration", () => {
      const { actionButtonStackConfig } = useTvConfig.getState();

      // All type: "button" items should have buttonType property
      const buttons = actionButtonStackConfig.filter((item) => item.type === "button");
      buttons.forEach((button) => {
        expect(button).toHaveProperty("buttonType");
        expect(typeof button.buttonType).toBe("string");
      });

      // All folder contents should also have buttonType
      const folders = actionButtonStackConfig.filter((item) => item.type === "folder");
      folders.forEach((folder) => {
        folder.contents?.forEach((content) => {
          expect(content).toHaveProperty("buttonType");
        });
      });
    });
  });
});
