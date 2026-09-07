import { describe, it, expect, vi, afterEach } from "vitest";
import { propertyRemap } from "../../../src/helpers/propertyRemap";

/**
 * Tests for propertyRemap — temporarily replaces properties on an object and
 * restores them via the returned cleanup function. Covered: function-based
 * value remapping, cleanup restoration, and cross-instance isolation.
 *
 * Not covered: mapping a property to another property by name — the source
 * only supports that for accessor (getter) properties, and every in-repo use
 * maps via a function.
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
});
