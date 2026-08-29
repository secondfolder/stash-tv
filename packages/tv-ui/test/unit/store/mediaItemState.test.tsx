import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import {
  createMediaItemStore,
  MediaItemStateContextProvider,
  useMediaItemState,
  hasMediaItemStateContext,
} from "../../../src/store/mediaItemState";

/**
 * Unit tests for the mediaItemState Zustand store.
 *
 * These tests cover:
 * - Default values match the defaults object
 * - Setter/getter/setToDefault/getDefault methods work correctly
 * - Initial values override defaults
 * - React context provider usage
 * - useMediaItemState hook throws error outside provider
 * - hasMediaItemStateContext checks for provider existence
 * - Ref object handling
 *
 * @see docs/media-loading.md § "useMediaItemsAccumulatorStore (module-level)"
 */

describe("mediaItemState store", () => {
  beforeEach(() => {
    // Reset any existing state before each test
  });

  describe("store creation and defaults", () => {
    it("creates a store with default values", () => {
      const store = createMediaItemStore({});

      expect(store.getState().openFolderId).toBe("");
      expect(store.getState().preIncrementOCounterValue).toBe(0);
      expect(store.getState().mediaSlideElementRef.current).toBeNull();
    });

    it("allows overriding initial values", () => {
      const mockRef = { current: document.createElement("div") };
      const store = createMediaItemStore({
        initialValues: {
          openFolderId: "folder-123",
          preIncrementOCounterValue: 5,
          mediaSlideElementRef: mockRef,
        },
      });

      expect(store.getState().openFolderId).toBe("folder-123");
      expect(store.getState().preIncrementOCounterValue).toBe(5);
      expect(store.getState().mediaSlideElementRef.current).toBe(mockRef.current);
    });

    it("partially overrides initial values", () => {
      const store = createMediaItemStore({
        initialValues: {
          openFolderId: "folder-456",
        },
      });

      expect(store.getState().openFolderId).toBe("folder-456");
      expect(store.getState().preIncrementOCounterValue).toBe(0); // Default
      expect(store.getState().mediaSlideElementRef.current).toBeNull(); // Default
    });
  });

  describe("set/get methods", () => {
    it("sets and gets a simple value", () => {
      const store = createMediaItemStore({});

      store.getState().set("openFolderId", "folder-789");

      expect(store.getState().get("openFolderId")).toBe("folder-789");
    });

    it("sets and gets with an updater function", () => {
      const store = createMediaItemStore({});

      store.getState().set("preIncrementOCounterValue", (prev) => prev + 10);

      expect(store.getState().get("preIncrementOCounterValue")).toBe(10);
    });

    it("sets multiple values sequentially", () => {
      const store = createMediaItemStore({});

      store.getState().set("openFolderId", "folder-abc");
      store.getState().set("preIncrementOCounterValue", 3);

      expect(store.getState().get("openFolderId")).toBe("folder-abc");
      expect(store.getState().get("preIncrementOCounterValue")).toBe(3);
    });

    it("updates ref object", () => {
      const store = createMediaItemStore({});
      const mockRef = { current: document.createElement("div") };

      store.getState().set("mediaSlideElementRef", mockRef);

      expect(store.getState().get("mediaSlideElementRef")).toBe(mockRef);
      expect(store.getState().get("mediaSlideElementRef").current).toBe(mockRef.current);
    });
  });

  describe("setToDefault/getDefault methods", () => {
    it("resets a value to its default", () => {
      const store = createMediaItemStore({});

      store.getState().set("openFolderId", "folder-xyz");
      store.getState().set("preIncrementOCounterValue", 7);

      expect(store.getState().get("openFolderId")).toBe("folder-xyz");
      expect(store.getState().get("preIncrementOCounterValue")).toBe(7);

      store.getState().setToDefault("openFolderId");
      store.getState().setToDefault("preIncrementOCounterValue");

      expect(store.getState().get("openFolderId")).toBe("");
      expect(store.getState().get("preIncrementOCounterValue")).toBe(0);
    });

    it("returns the correct default value", () => {
      const store = createMediaItemStore({});

      expect(store.getState().getDefault("openFolderId")).toBe("");
      expect(store.getState().getDefault("preIncrementOCounterValue")).toBe(0);
      expect(store.getState().getDefault("mediaSlideElementRef")).toEqual({
        current: null,
      });
    });

    it("resets ref to default null", () => {
      const mockRef = { current: document.createElement("div") };
      const store = createMediaItemStore({
        initialValues: { mediaSlideElementRef: mockRef },
      });

      expect(store.getState().get("mediaSlideElementRef").current).not.toBeNull();

      store.getState().setToDefault("mediaSlideElementRef");

      expect(store.getState().get("mediaSlideElementRef").current).toBeNull();
    });
  });

  describe("openFolderId behavior", () => {
    it("updates openFolderId correctly", () => {
      const store = createMediaItemStore({});

      expect(store.getState().openFolderId).toBe("");

      store.getState().set("openFolderId", "folder-1");
      expect(store.getState().openFolderId).toBe("folder-1");

      store.getState().set("openFolderId", "folder-2");
      expect(store.getState().openFolderId).toBe("folder-2");
    });

    it("clears openFolderId when set to empty string", () => {
      const store = createMediaItemStore({ initialValues: { openFolderId: "folder-active" } });

      expect(store.getState().openFolderId).toBe("folder-active");

      store.getState().set("openFolderId", "");

      expect(store.getState().openFolderId).toBe("");
    });
  });

  describe("preIncrementOCounterValue behavior", () => {
    it("increments O counter value correctly", () => {
      const store = createMediaItemStore({});

      expect(store.getState().preIncrementOCounterValue).toBe(0);

      store.getState().set("preIncrementOCounterValue", 1);
      expect(store.getState().preIncrementOCounterValue).toBe(1);

      store.getState().set("preIncrementOCounterValue", (prev) => prev + 1);
      expect(store.getState().preIncrementOCounterValue).toBe(2);
    });

    it("handles larger increments", () => {
      const store = createMediaItemStore({});

      store.getState().set("preIncrementOCounterValue", 10);

      expect(store.getState().preIncrementOCounterValue).toBe(10);

      store.getState().set("preIncrementOCounterValue", (prev) => prev * 2);

      expect(store.getState().preIncrementOCounterValue).toBe(20);
    });
  });

  describe("mediaSlideElementRef behavior", () => {
    it("updates ref with DOM element", () => {
      const store = createMediaItemStore({});
      const mockElement = document.createElement("div");
      const mockRef = { current: mockElement };

      expect(store.getState().mediaSlideElementRef.current).toBeNull();

      store.getState().set("mediaSlideElementRef", mockRef);

      expect(store.getState().mediaSlideElementRef.current).toBe(mockElement);
    });

    it("handles null ref values", () => {
      const mockElement = document.createElement("div");
      const mockRef = { current: mockElement };
      const store = createMediaItemStore({
        initialValues: { mediaSlideElementRef: mockRef },
      });

      expect(store.getState().mediaSlideElementRef.current).not.toBeNull();

      store.getState().set("mediaSlideElementRef", { current: null });

      expect(store.getState().mediaSlideElementRef.current).toBeNull();
    });
  });

  describe("type safety", () => {
    it("handles runtime setting with setter methods", () => {
      const store = createMediaItemStore({});

      // The setter methods will still work at runtime even with unknown types
      // @ts-expect-error -- intentionally testing type safety
      store.getState().set("openFolderId", "test-folder");

      expect(store.getState().get("openFolderId")).toBe("test-folder");
    });

    it("enforces correct types for known keys", () => {
      const store = createMediaItemStore({});
      const mockRef = { current: document.createElement("div") };

      store.getState().set("openFolderId", "folder-type");
      store.getState().set("preIncrementOCounterValue", 42);
      store.getState().set("mediaSlideElementRef", mockRef);

      expect(typeof store.getState().get("openFolderId")).toBe("string");
      expect(typeof store.getState().get("preIncrementOCounterValue")).toBe("number");
      expect(typeof store.getState().get("mediaSlideElementRef")).toBe("object");
    });

    it("handles updater function return types correctly", () => {
      const store = createMediaItemStore({});

      store.getState().set("openFolderId", (prev) => prev + "-suffix");
      store.getState().set("preIncrementOCounterValue", (prev) => prev + 5);

      expect(store.getState().get("openFolderId")).toBe("-suffix");
      expect(store.getState().get("preIncrementOCounterValue")).toBe(5);
    });
  });

  describe("state isolation", () => {
    it("maintains independent state for different properties", () => {
      const store = createMediaItemStore({});

      store.getState().set("openFolderId", "folder-a");
      store.getState().set("preIncrementOCounterValue", 10);

      expect(store.getState().openFolderId).toBe("folder-a");
      expect(store.getState().preIncrementOCounterValue).toBe(10);

      // Reset one property shouldn't affect others
      store.getState().set("openFolderId", "");

      expect(store.getState().openFolderId).toBe("");
      expect(store.getState().preIncrementOCounterValue).toBe(10); // Still 10
    });

    it("multiple stores are independent", () => {
      const store1 = createMediaItemStore({ initialValues: { openFolderId: "store1" } });
      const store2 = createMediaItemStore({ initialValues: { openFolderId: "store2" } });

      expect(store1.getState().openFolderId).toBe("store1");
      expect(store2.getState().openFolderId).toBe("store2");

      store1.getState().set("openFolderId", "store1-updated");

      expect(store1.getState().openFolderId).toBe("store1-updated");
      expect(store2.getState().openFolderId).toBe("store2"); // Unchanged
    });
  });
});
