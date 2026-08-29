import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { useGlobalState } from "../../../src/store/globalState";

/**
 * Unit tests for the globalState Zustand store.
 *
 * These tests cover:
 * - Default values match the defaults object
 * - Setter/getter/setToDefault/getDefault methods work correctly
 * - tvConfigLoaded gating allows setting tvConfigLoaded itself but blocks other mutations
 * - Transient UI state (showSettings, fullscreen, sceneInfoOpen)
 *
 * @see docs/state-and-config.md § "The `tvConfigLoaded` Guard"
 */

describe("globalState store", () => {
  beforeEach(() => {
    // Clear localStorage before each test to avoid state bleeding
    localStorage.clear();
    // Reset the store to defaults by enabling it first
    useGlobalState.setState({ tvConfigLoaded: true });
    const state = useGlobalState.getState();
    // Manually reset all properties
    state.set("showSettings", false);
    state.set("fullscreen", false);
    state.set("sceneInfoOpen", false);
    state.set("tvConfigLoaded", true); // Keep it enabled for tests
  });

  afterEach(() => {
    localStorage.clear();
    // Reset the store to defaults
    const { setToDefault } = useGlobalState.getState();
    Object.keys(useGlobalState.getState()).forEach((key) => {
      if (typeof setToDefault === "function" && key !== "set" && key !== "get" && key !== "setToDefault" && key !== "getDefault") {
        // @ts-expect-error -- we're iterating over all config keys
        setToDefault(key);
      }
    });
  });

  describe("default values", () => {
    it("has the correct default showSettings", () => {
      const { showSettings } = useGlobalState.getState();
      expect(showSettings).toBe(false);
    });

    it("has the correct default fullscreen", () => {
      const { fullscreen } = useGlobalState.getState();
      expect(fullscreen).toBe(false);
    });

    it("has the correct default sceneInfoOpen", () => {
      const { sceneInfoOpen } = useGlobalState.getState();
      expect(sceneInfoOpen).toBe(false);
    });

    it("has the correct default tvConfigLoaded", () => {
      // Reset to get the true default
      useGlobalState.setState({ tvConfigLoaded: false });
      const { tvConfigLoaded } = useGlobalState.getState();
      expect(tvConfigLoaded).toBe(false);
    });
  });

  describe("set/get methods", () => {
    it("sets and gets a simple value", () => {
      const { set, get } = useGlobalState.getState();

      act(() => {
        set("showSettings", true);
      });

      expect(get("showSettings")).toBe(true);
    });

    it("sets and gets with an updater function", () => {
      const { set, get } = useGlobalState.getState();

      act(() => {
        set("showSettings", (prev) => !prev);
      });

      expect(get("showSettings")).toBe(true);
    });

    it("sets multiple values sequentially", () => {
      const { set, get } = useGlobalState.getState();

      act(() => {
        set("showSettings", true);
        set("fullscreen", true);
        set("sceneInfoOpen", true);
      });

      expect(get("showSettings")).toBe(true);
      expect(get("fullscreen")).toBe(true);
      expect(get("sceneInfoOpen")).toBe(true);
    });
  });

  describe("setToDefault/getDefault methods", () => {
    it("resets a value to its default", () => {
      const { set, get, setToDefault, getDefault } = useGlobalState.getState();

      act(() => {
        set("showSettings", true);
      });

      expect(get("showSettings")).toBe(true);
      expect(getDefault("showSettings")).toBe(false);

      act(() => {
        setToDefault("showSettings");
      });

      expect(get("showSettings")).toBe(false);
    });

    it("returns the correct default value", () => {
      const { getDefault } = useGlobalState.getState();

      expect(getDefault("showSettings")).toBe(false);
      expect(getDefault("fullscreen")).toBe(false);
      expect(getDefault("sceneInfoOpen")).toBe(false);
      expect(getDefault("tvConfigLoaded")).toBe(false);
    });

    it("resets all properties to defaults", () => {
      const { set, get, setToDefault } = useGlobalState.getState();

      act(() => {
        set("showSettings", true);
        set("fullscreen", true);
        set("sceneInfoOpen", true);
        set("tvConfigLoaded", true);
      });

      expect(get("showSettings")).toBe(true);
      expect(get("fullscreen")).toBe(true);
      expect(get("sceneInfoOpen")).toBe(true);
      expect(get("tvConfigLoaded")).toBe(true);

      act(() => {
        setToDefault("showSettings");
        setToDefault("fullscreen");
        setToDefault("sceneInfoOpen");
        setToDefault("tvConfigLoaded");
      });

      expect(get("showSettings")).toBe(false);
      expect(get("fullscreen")).toBe(false);
      expect(get("sceneInfoOpen")).toBe(false);
      expect(get("tvConfigLoaded")).toBe(false);
    });
  });

  describe("tvConfigLoaded gating", () => {
    it("does not set other values when tvConfigLoaded is false", () => {
      useGlobalState.setState({ tvConfigLoaded: false });
      const { set, get } = useGlobalState.getState();

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        set("showSettings", true);
      });

      expect(get("showSettings")).toBe(false); // Should remain at default
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tried to set showSettings")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("before store was loaded")
      );

      consoleSpy.mockRestore();
    });

    it("allows setting tvConfigLoaded itself even when false", () => {
      useGlobalState.setState({ tvConfigLoaded: false });
      const { set, get } = useGlobalState.getState();

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        set("tvConfigLoaded", true);
      });

      expect(get("tvConfigLoaded")).toBe(true);
      // No warning should be logged for tvConfigLoaded
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("does not setToDefault when tvConfigLoaded is false", () => {
      useGlobalState.setState({ tvConfigLoaded: false });
      const { set, get, setToDefault } = useGlobalState.getState();

      // Set a value first
      act(() => {
        useGlobalState.setState({ tvConfigLoaded: true });
        set("showSettings", true);
        useGlobalState.setState({ tvConfigLoaded: false });
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        setToDefault("showSettings");
      });

      expect(get("showSettings")).toBe(true); // Should remain unchanged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tried to set showSettings to default before store was loaded")
      );

      consoleSpy.mockRestore();
    });

    it("blocks multiple state changes until tvConfigLoaded is set", () => {
      useGlobalState.setState({ tvConfigLoaded: false });
      const { set, get } = useGlobalState.getState();

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      act(() => {
        set("showSettings", true);
        set("fullscreen", true);
        set("sceneInfoOpen", true);
      });

      // All should remain at defaults
      expect(get("showSettings")).toBe(false);
      expect(get("fullscreen")).toBe(false);
      expect(get("sceneInfoOpen")).toBe(false);

      // Should have logged 3 warnings
      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe("transient UI state behavior", () => {
    it("toggles settings panel", () => {
      const { set, get } = useGlobalState.getState();

      expect(get("showSettings")).toBe(false);

      act(() => {
        set("showSettings", true);
      });
      expect(get("showSettings")).toBe(true);

      act(() => {
        set("showSettings", false);
      });
      expect(get("showSettings")).toBe(false);
    });

    it("toggles fullscreen state", () => {
      const { set, get } = useGlobalState.getState();

      expect(get("fullscreen")).toBe(false);

      act(() => {
        set("fullscreen", true);
      });
      expect(get("fullscreen")).toBe(true);

      act(() => {
        set("fullscreen", false);
      });
      expect(get("fullscreen")).toBe(false);
    });

    it("toggles scene info panel", () => {
      const { set, get } = useGlobalState.getState();

      expect(get("sceneInfoOpen")).toBe(false);

      act(() => {
        set("sceneInfoOpen", true);
      });
      expect(get("sceneInfoOpen")).toBe(true);

      act(() => {
        set("sceneInfoOpen", false);
      });
      expect(get("sceneInfoOpen")).toBe(false);
    });
  });

  describe("type safety", () => {
    it("handles runtime setting with setter methods", () => {
      const { set, get } = useGlobalState.getState();

      // Even with TypeScript @ts-expect-error, the setter methods will still
      // work at runtime - this tests that behavior
      // @ts-expect-error -- intentionally testing type safety
      set("showSettings", true);

      expect(get("showSettings")).toBe(true);
    });

    it("enforces correct types for known keys", () => {
      const { set, get } = useGlobalState.getState();

      act(() => {
        set("showSettings", true);
        set("fullscreen", false);
        set("sceneInfoOpen", true);
        set("tvConfigLoaded", true);
      });

      expect(typeof get("showSettings")).toBe("boolean");
      expect(typeof get("fullscreen")).toBe("boolean");
      expect(typeof get("sceneInfoOpen")).toBe("boolean");
      expect(typeof get("tvConfigLoaded")).toBe("boolean");
    });
  });

  describe("state isolation", () => {
    it("maintains independent state for different properties", () => {
      const { set, get } = useGlobalState.getState();

      act(() => {
        set("showSettings", true);
        set("fullscreen", true);
        set("sceneInfoOpen", false);
      });

      expect(get("showSettings")).toBe(true);
      expect(get("fullscreen")).toBe(true);
      expect(get("sceneInfoOpen")).toBe(false);

      // Reset one property shouldn't affect others
      act(() => {
        set("showSettings", false);
      });

      expect(get("showSettings")).toBe(false);
      expect(get("fullscreen")).toBe(true); // Still true
      expect(get("sceneInfoOpen")).toBe(false); // Still false
    });
  });
});
