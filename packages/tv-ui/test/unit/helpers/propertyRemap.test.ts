import { describe, it, expect, vi, afterEach } from "vitest";
import { propertyRemap } from "../../../src/helpers/propertyRemap";

/**
 * Tests for propertyRemap — temporarily replaces properties on an object and
 * restores them via the returned cleanup function. `useViewportRotate` uses it to
 * swap width/height properties (e.g. `innerWidth: "innerHeight"`) while the UI is
 * rotated, on data properties (jsdom's `window.innerWidth`) and accessors on a
 * prototype (`Element.prototype.clientWidth`) alike.
 */

describe("propertyRemap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes the remapped value from the original via a mapping function", () => {
    const obj = { value: 10 };

    const cleanup = propertyRemap(obj, {
      value: (original: unknown) => (typeof original === "number" ? original * 3 : original),
    });

    expect(obj.value).toBe(30);

    cleanup();
  });

  it("restores original descriptors on cleanup", () => {
    const obj = { value: 10 };

    const cleanup = propertyRemap(obj, {
      value: () => 99,
    });

    expect(obj.value).toBe(99);
    cleanup();

    expect(obj.value).toBe(10);
    expect(Object.getOwnPropertyDescriptor(obj, "value")?.writable).toBe(true);
  });

  it("does not affect other instances of the same shape", () => {
    const parent = { value: 10 };
    const other = { value: 10 };

    const cleanup = propertyRemap(parent, {
      value: () => 99,
    });

    expect(other.value).toBe(10);

    cleanup();
  });

  it("swaps data properties by name", () => {
    const viewport = { innerWidth: 800, innerHeight: 600 };

    const cleanup = propertyRemap(viewport, { innerWidth: "innerHeight", innerHeight: "innerWidth" });

    expect([viewport.innerWidth, viewport.innerHeight]).toEqual([600, 800]);
    cleanup();
    expect([viewport.innerWidth, viewport.innerHeight]).toEqual([800, 600]);
  });

  it("passes an accessor property's value, not its getter, to a mapping function", () => {
    const obj = { get value() { return 10; } };

    const cleanup = propertyRemap(obj, { value: (original: unknown) => (typeof original === "number" ? original + 1 : -1) });

    expect(obj.value).toBe(11);
    cleanup();
  });

  it("remaps inherited accessors for one object only when modifying their prototype", () => {
    class Box {
      constructor(private readonly w: number, private readonly h: number) {}
      get width() { return this.w; }
      get height() { return this.h; }
    }
    const rotated = new Box(800, 600);
    const other = new Box(100, 50);

    const cleanup = propertyRemap(rotated, { width: "height", height: "width" }, Box.prototype);

    expect([rotated.width, rotated.height]).toEqual([600, 800]);
    expect([other.width, other.height]).toEqual([100, 50]);
    cleanup();
    expect([rotated.width, rotated.height]).toEqual([800, 600]);
  });

  it("restores an inherited property by removing the remap", () => {
    const prototype = { value: 10 };
    const obj: { value: number } = Object.create(prototype);

    const cleanup = propertyRemap(obj, { value: () => 99 });
    expect(obj.value).toBe(99);
    cleanup();

    expect(Object.getOwnPropertyDescriptor(obj, "value")).toBeUndefined();
    expect(obj.value).toBe(10);
  });

  it("restores the originals whichever order nested remaps are cleaned up in", () => {
    const viewport = { innerWidth: 800, innerHeight: 600 };
    const swap = propertyRemap(viewport, { innerWidth: "innerHeight", innerHeight: "innerWidth" });
    const double = propertyRemap(viewport, { innerWidth: (width: unknown) => Number(width) * 2 });
    expect(viewport.innerWidth).toBe(1200);

    swap();
    double();

    expect([viewport.innerWidth, viewport.innerHeight]).toEqual([800, 600]);
  });
});
