import { expect, afterEach } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

// jest-dom v5 (pinned for React 17 compat) only auto-extends a Jest-style global
// `expect`; with vitest's explicit-import style we extend manually.
expect.extend(jestDomMatchers);

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
