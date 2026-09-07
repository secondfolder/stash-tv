import { expect, afterEach, afterAll, vi } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import type { Client } from "graphql-ws";

// jest-dom v5 (pinned for React 17 compat) only auto-extends a Jest-style global
// `expect`; with vitest's explicit-import style we extend manually.
expect.extend(jestDomMatchers);

// --- Apollo WebSocket client lifecycle management ----------------------------
//
// The app's Apollo client is a module-level singleton built on a `graphql-ws`
// client configured with `retryAttempts: Infinity`. Integration tests re-import
// app modules fresh per test (`loadFreshAppModules` → `vi.resetModules()`), so a
// single test file creates MANY ws clients — all of which keep trying to connect/
// reconnect forever. Without disposal, pending connections reject during jsdom
// teardown and vitest reports them as unhandled errors.
//
// We wrap (not replace) `graphql-ws`'s `createClient` to track every client
// created in this test file, then dispose them all in `afterAll` — before jsdom
// teardown. Disposing closes open sockets and stops the retry loop, so teardown
// is deterministic and tests can run in parallel workers.
//
// @see docs/historical-plans/2026-08-30-websocket-cleanup-problem-handoff.md
const wsClients = vi.hoisted(() => new Set<import("graphql-ws").Client>());
vi.mock("graphql-ws", async (importOriginal) => {
  const actual = await importOriginal<typeof import("graphql-ws")>();
  return {
    ...actual,
    createClient: (...args: Parameters<typeof actual.createClient>) => {
      if (process.env.DEBUG_WS_MOCK) console.log("[ws-mock] createClient wrapped:", args[0]?.url);
      const client = actual.createClient(...args);
      wsClients.add(client);
      return client;
    },
  };
});
afterAll(async () => {
  await Promise.allSettled([...wsClients].map((client) => client.dispose()));
  wsClients.clear();
});
// -----------------------------------------------------------------------------

// RTL's auto-cleanup also relies on a global afterEach, which we don't have with
// explicit imports — unmount after every test centrally instead of per-file.
afterEach(cleanup);

// Node's undici fetch (which vitest keeps as global fetch in jsdom) rejects
// AbortSignals created in the jsdom realm, and Apollo Client attaches one to every
// request. Strip signals — Apollo only uses them for cleanup, which tests don't need.
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(input, { ...init, signal: undefined })) as typeof fetch;
window.fetch = globalThis.fetch;

/**
 * jsdom lacks many browser APIs the app (and reused Stash components) touch. These
 * polyfills are intentionally minimal — they only need to exist, not to be accurate.
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

class MockResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!window.ResizeObserver) {
  window.ResizeObserver = MockResizeObserver;
}

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  readonly scrollMargin: string = "";
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
if (!window.IntersectionObserver) {
  window.IntersectionObserver = MockIntersectionObserver;
}

if (!window.scrollTo) {
  window.scrollTo = () => {};
}

// jsdom implements no part of the Pointer Capture API. Radix's slider calls
// these unconditionally from its own pointer handlers, so without them a
// pointerdown/pointerup on a thumb throws inside an event listener — surfacing
// as an unhandled error that fails the run even when every test passes.
if (!Element.prototype.hasPointerCapture) {
  const captured = new WeakMap<Element, Set<number>>();
  Element.prototype.setPointerCapture = function (pointerId: number) {
    const ids = captured.get(this) ?? new Set<number>();
    ids.add(pointerId);
    captured.set(this, ids);
  };
  Element.prototype.releasePointerCapture = function (pointerId: number) {
    captured.get(this)?.delete(pointerId);
  };
  Element.prototype.hasPointerCapture = function (pointerId: number) {
    return captured.get(this)?.has(pointerId) ?? false;
  };
}

// HTMLMediaElement.play returns a promise in modern browsers
if (!HTMLMediaElement.prototype.play) {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
}
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.load = () => {};

// jsdom has no Gamepad API
if (typeof navigator.getGamepads !== "function") {
  Object.defineProperty(navigator, "getGamepads", {
    value: () => [null, null, null, null],
    writable: true,
    configurable: true,
  });
}

// useViewportRotate remaps VisualViewport.prototype — jsdom has no such class
if (typeof globalThis.VisualViewport === "undefined") {
  class VisualViewportStub {
    width = 375;
    height = 667;
    offsetLeft = 0;
    offsetTop = 0;
    pageLeft = 0;
    pageTop = 0;
    scale = 1;
    addEventListener() {}
    removeEventListener() {}
  }
  Object.defineProperty(globalThis, "VisualViewport", {
    value: VisualViewportStub,
    writable: true,
    configurable: true,
  });
  if (!("visualViewport" in window)) {
    Object.defineProperty(window, "visualViewport", {
      value: new VisualViewportStub(),
      writable: true,
      configurable: true,
    });
  }
}

// --- External Video.js plugin mocks -----------------------------------------
//
// The Chromecast plugin sets up timers/native bridges that don't exist under
// jsdom. Mock it with a no-op plugin registration.
//
vi.mock("@silvermine/videojs-chromecast", () => {
  const mockPlugin = vi.fn((videojs: { registerPlugin?: (name: string, fn: () => unknown) => void }) => {
    videojs?.registerPlugin?.("chromecast", () => undefined);
  });
  return {
    default: mockPlugin,
  };
});

