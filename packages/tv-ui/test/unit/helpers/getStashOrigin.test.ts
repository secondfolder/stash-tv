import { describe, expect, it, afterEach, vi } from "vitest";
import { getStashOrigin } from "../../../src/helpers/getStashOrigin";

/**
 * Unit tests for getStashOrigin — a single expression returning
 * STASH_ADDRESS verbatim (no normalization) or falling back to the page
 * origin when unset/empty.
 */

describe("getStashOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns STASH_ADDRESS verbatim, without normalizing", () => {
    vi.stubEnv("STASH_ADDRESS", "http://stash.example.com/stash/");

    expect(getStashOrigin()).toBe("http://stash.example.com/stash/");
  });

  it("falls back to window.location.origin when STASH_ADDRESS is not set", () => {
    vi.stubEnv("STASH_ADDRESS", undefined);

    expect(getStashOrigin()).toBe(window.location.origin);
  });

  it("falls back to window.location.origin when STASH_ADDRESS is an empty string", () => {
    vi.stubEnv("STASH_ADDRESS", "");

    expect(getStashOrigin()).toBe(window.location.origin);
  });
});
