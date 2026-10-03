import { describe, expect, it } from "vitest";
import { hasDefaultImage } from "../../../src/components/entity-popovers/helpers";

/** @see docs/entity-popovers.md § "Cards" */
describe("hasDefaultImage", () => {
  it("recognises Stash's stand-in image for an entity without one", () => {
    expect(hasDefaultImage("http://stash:9999/tag/1/image?t=1700000000&default=true")).toBe(true);
    expect(hasDefaultImage(null)).toBe(true);
  });

  it("recognises an entity's own image", () => {
    expect(hasDefaultImage("http://stash:9999/tag/1/image?t=1700000000")).toBe(false);
  });
});
