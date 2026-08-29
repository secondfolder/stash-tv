import { describe, expect, it } from "vitest";
import { clamp, roundTo, roundToNearest, sortPerformers } from "../helpers";

describe("clamp", () => {
  it("clamps below the minimum", () => {
    expect(clamp(0, -5, 10)).toBe(0);
  });

  it("clamps above the maximum", () => {
    expect(clamp(0, 15, 10)).toBe(10);
  });

  it("passes through in-range values", () => {
    expect(clamp(0, 5, 10)).toBe(5);
  });

  it("handles the boundaries", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(0, 10, 10)).toBe(10);
  });
});

describe("roundTo", () => {
  it("rounds to the given number of decimals", () => {
    expect(roundTo(1.234, 1)).toBeCloseTo(1.2);
    expect(roundTo(1.26, 1)).toBeCloseTo(1.3);
  });

  it("defaults to whole numbers", () => {
    expect(roundTo(1.5)).toBe(2);
    expect(roundTo(1.4)).toBe(1);
  });
});

describe("roundToNearest", () => {
  it("rounds to nearest interval", () => {
    expect(roundToNearest(96, 5)).toBe(95);
    expect(roundToNearest(98, 5)).toBe(100);
  });

  it("defaults to nearest 1", () => {
    expect(roundToNearest(2.6)).toBe(3);
  });
});

describe("sortPerformers", () => {
  it("sorts performers by name", () => {
    const performers = [{ name: "Zoe" }, { name: "Alice" }, { name: "Marge" }];
    expect(sortPerformers(performers as never).map((p) => p.name)).toEqual([
      "Alice",
      "Marge",
      "Zoe",
    ]);
  });
});
