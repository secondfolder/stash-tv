import { describe, expect, it } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import {
  createMediaItemStore,
  MediaItemStateContextProvider,
  useMediaItemState,
  hasMediaItemStateContext,
} from "../../../src/store/mediaItemState";

/**
 * Unit tests for the per-media-item state store and its React context.
 *
 * The store's distinctive behaviors (vs the global Zustand stores) are the
 * factory + context pattern: each provider mount creates an independent
 * store, so slides don't share state. Also covered: updater-function
 * resolution and setToDefault from an overridden initial value.
 */

describe("mediaItemState store", () => {
  it("resolves updater functions against the previous value", () => {
    const store = createMediaItemStore({
      initialValues: { preIncrementOCounterValue: 10 },
    });

    store.getState().set("preIncrementOCounterValue", (prev) => prev * 2);

    expect(store.getState().preIncrementOCounterValue).toBe(20);
  });

  it("resets overridden initial values to defaults with setToDefault", () => {
    const store = createMediaItemStore({
      initialValues: { openFolderId: "folder-active", preIncrementOCounterValue: 5 },
    });

    store.getState().setToDefault("openFolderId");

    expect(store.getState().openFolderId).toBe("");
    // Untouched properties keep their values
    expect(store.getState().preIncrementOCounterValue).toBe(5);
  });

  it("creates independent stores per createMediaItemStore call", () => {
    const store1 = createMediaItemStore({ initialValues: { openFolderId: "store1" } });
    const store2 = createMediaItemStore({});

    store1.getState().set("openFolderId", "store1-updated");

    expect(store1.getState().openFolderId).toBe("store1-updated");
    expect(store2.getState().openFolderId).toBe("");
  });
});

describe("MediaItemStateContext", () => {
  function Probe({ onChange }: { onChange: (state: ReturnType<typeof useMediaItemState>) => void }) {
    const state = useMediaItemState();
    onChange(state);
    return null;
  }

  it("provides an independent store per provider mount", () => {
    const seen1: ReturnType<typeof useMediaItemState>[] = [];
    const seen2: ReturnType<typeof useMediaItemState>[] = [];

    act(() => {
      render(
        <MediaItemStateContextProvider initialValues={{ openFolderId: "a" }}>
          <Probe onChange={(state) => seen1.push(state)} />
        </MediaItemStateContextProvider>
      );
    });
    act(() => {
      render(
        <MediaItemStateContextProvider initialValues={{ openFolderId: "b" }}>
          <Probe onChange={(state) => seen2.push(state)} />
        </MediaItemStateContextProvider>
      );
    });

    expect(seen1.at(-1)?.openFolderId).toBe("a");
    expect(seen2.at(-1)?.openFolderId).toBe("b");
  });

  it("useMediaItemState throws outside a provider", () => {
    // Silence the expected console error from React's error boundary-less throw
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (!String(args[0]).includes("useMediaItemState must be used within")) {
        consoleError(...args);
      }
    };

    expect(() => render(<Probe onChange={() => {}} />)).toThrow(
      "useMediaItemState must be used within a MediaItemStateContext.Provider"
    );

    console.error = consoleError;
  });

  it("hasMediaItemStateContext reports provider presence", () => {
    function ContextFlag({ onChange }: { onChange: (has: boolean) => void }) {
      onChange(hasMediaItemStateContext());
      return null;
    }

    let outsideProvider = false;
    let insideProvider = false;
    render(
      <div>
        <ContextFlag onChange={(has) => (outsideProvider = has)} />
        <MediaItemStateContextProvider>
          <ContextFlag onChange={(has) => (insideProvider = has)} />
        </MediaItemStateContextProvider>
      </div>
    );

    expect(outsideProvider).toBe(false);
    expect(insideProvider).toBe(true);
  });
});
