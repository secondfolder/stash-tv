import { describe, expect, it } from "vitest";
import { GenderEnum } from "stash-ui/dist/src/core/generated-graphql";
import { clamp, formatDuration, getNextOption, roundTo, roundToNearest, sortPerformers } from "../../../src/helpers";

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
  it("sorts performers by name within the same gender", () => {
    const performers = [{ name: "Zoe" }, { name: "Alice" }, { name: "Marge" }];
    expect(sortPerformers(performers).map((p) => p.name)).toEqual([
      "Alice",
      "Marge",
      "Zoe",
    ]);
  });

  it("orders performers by gender, with unknown genders last", () => {
    // GENDERS order: FEMALE before MALE; undefined gender sorts after all
    const performers = [
      { name: "Bob", gender: GenderEnum.Male },
      { name: "Zara" },
      { name: "Wendy", gender: GenderEnum.Female },
      { name: "Alan", gender: GenderEnum.Male },
    ];
    expect(sortPerformers(performers).map((p) => p.name)).toEqual([
      "Wendy",
      "Alan",
      "Bob",
      "Zara",
    ]);
  });
});

describe("getNextOption", () => {
  const options: { value: string }[] = [{ value: "a" }, { value: "b" }, { value: "c" }];

  it("returns the option after the current one", () => {
    expect(getNextOption(options, "a")).toEqual({ value: "b" });
  });

  it("wraps from the last option to the first", () => {
    expect(getNextOption(options, "c")).toEqual({ value: "a" });
  });

  it("falls back to the first option for an unknown value", () => {
    expect(getNextOption(options, "unknown")).toEqual({ value: "a" });
  });

  it("returns undefined when there are no options", () => {
    expect(getNextOption<{ value: string }>([], "a")).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("names each non-zero unit, singular or plural", () => {
    expect(formatDuration(3661)).toBe("1 hour 1 minute 1 second");
    expect(formatDuration(7320)).toBe("2 hours 2 minutes");
  });

  it("rounds to whole seconds", () => {
    expect(formatDuration(29.6)).toBe("30 seconds");
  });

  it("describes zero as 0 seconds", () => {
    expect(formatDuration(0)).toBe("0 seconds");
  });
});
