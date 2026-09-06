import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { useTvConfig } from "../../../src/store/tvConfig";
import { resetStores, setTvConfigLoaded } from "../helpers/stores";

/**
 * Unit tests for the tvConfig Zustand store.
 *
 * Only behavior tests live here — guards, persistence routing, and the
 * render-debugging side effect. Deliberately excluded: default-value
 * restatements and set/get round-trips (tautologies that mirror the source
 * without testing behavior).
 *
 * @see docs/state-and-config.md § "Hybrid Storage"
 */

// Mock the Apollo client to prevent connection attempts. A single hoisted
// mutate mock lets tests assert what was written to the Stash backend.
const { apolloMutate } = vi.hoisted(() => ({
  apolloMutate: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock("../../../src/hooks/getApolloClient", () => ({
  getApolloClient: vi.fn(() => ({
    query: vi.fn(() => Promise.resolve({ data: { configuration: { plugins: {} } } })),
    mutate: apolloMutate,
    stop: vi.fn(),
  })),
}));

describe("tvConfig store", () => {
  beforeEach(() => {
    resetStores();
    localStorage.clear();
    apolloMutate.mockClear();
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
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("before config was loaded"));

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
        expect.stringContaining("before store was loaded")
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

      const parsed = JSON.parse(localStorage.getItem("app-state-local") ?? "null");
      expect(parsed?.state.forceLandscape).toBe(true);
    });

    it("routes non-localStorage keys to the Stash config backend", async () => {
      const { set } = useTvConfig.getState();

      act(() => {
        set("volume", 0.5);
      });

      // Written through ConfigurePlugin, not localStorage
      await waitFor(() => {
        expect(apolloMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({
              plugin_id: "stash-tv",
              input: expect.objectContaining({
                "app-state": expect.stringContaining('"volume":0.5'),
              }),
            }),
          })
        );
      });
      const localParsed = JSON.parse(localStorage.getItem("app-state-local") ?? "null");
      expect(localParsed?.state.volume).toBeUndefined();
    });
  });

  describe("showDebuggingInfo render-debugging side effect", () => {
    it("persists enableRenderDebugging and reloads when render-debugging is toggled", async () => {
      vi.useFakeTimers();
      try {
        const reloadSpy = vi.fn();
          Object.defineProperty(window, "location", {
          value: { ...window.location, reload: reloadSpy },
          writable: true,
        });

        const { set } = useTvConfig.getState();

        act(() => {
          set("showDebuggingInfo", ["render-debugging"]);
        });

        // The write + reload happen on a delay, after zustand persists
        await vi.advanceTimersByTimeAsync(400);

        expect(localStorage.getItem("enableRenderDebugging")).toBe("true");
        expect(reloadSpy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not reload when the render-debugging state is unchanged", async () => {
      localStorage.setItem("enableRenderDebugging", "false");
      vi.useFakeTimers();
      try {
        const reloadSpy = vi.fn();
        Object.defineProperty(window, "location", {
          value: { ...window.location, reload: reloadSpy },
          writable: true,
        });

        const { set } = useTvConfig.getState();

        act(() => {
          // Some other debugging option — render-debugging is still off
          set("showDebuggingInfo", ["onscreen-info"]);
        });

        await vi.advanceTimersByTimeAsync(400);

        expect(localStorage.getItem("enableRenderDebugging")).toBe("false");
        expect(reloadSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
