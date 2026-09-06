import { describe, expect, it, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { useGlobalState } from "../../../src/store/globalState";
import { resetStores, setTvConfigLoaded } from "../helpers/stores";

/**
 * Unit tests for the globalState Zustand store.
 *
 * Only behavior tests live here — the tvConfigLoaded guard and state toggling.
 * Deliberately excluded: default-value restatements and set/get round-trips
 * (tautologies that mirror the source without testing behavior).
 *
 * @see docs/state-and-config.md § "The `tvConfigLoaded` Guard"
 */

describe("globalState store", () => {
  beforeEach(() => {
    resetStores();
    localStorage.clear();
  });

  describe("tvConfigLoaded gating", () => {
    it("does not set other values when tvConfigLoaded is false", () => {
      setTvConfigLoaded(false);
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
      setTvConfigLoaded(false);
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
      setTvConfigLoaded(false);
      const { set, get, setToDefault } = useGlobalState.getState();

      // Set a value first
      act(() => {
        setTvConfigLoaded(true);
        set("showSettings", true);
        setTvConfigLoaded(false);
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
  });

  describe("transient UI state behavior", () => {
    it("resolves updater functions against the previous value", () => {
      // Consumers toggle transient state via updater functions
      // (set("showSettings", prev => !prev)) — the store must resolve them
      const { set, get } = useGlobalState.getState();

      act(() => {
        set("showSettings", (prev) => !prev);
      });
      expect(get("showSettings")).toBe(true);

      act(() => {
        set("showSettings", (prev) => !prev);
      });
      expect(get("showSettings")).toBe(false);
    });
  });
});
