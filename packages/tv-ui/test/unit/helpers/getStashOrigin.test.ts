import { describe, expect, it, vi, afterEach } from "vitest";
import { getStashOrigin } from "../../../src/helpers/getStashOrigin";

/**
 * Unit tests for getStashOrigin helper.
 *
 * These tests cover:
 * - Getting origin from environment variable
 * - Falling back to window.location.origin
 * - Different protocol/host scenarios
 */

describe("getStashOrigin", () => {
  // Mock import.meta.env since it's read-only
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original environment
    vi.stubEnv('STASH_ADDRESS', originalEnv.STASH_ADDRESS);
  });

  describe("environment variable priority", () => {
    it("uses STASH_ADDRESS environment variable when set", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://custom-stash:9999');

      const result = getStashOrigin();
      expect(result).toBe('http://custom-stash:9999');
    });

    it("handles HTTPS STASH_ADDRESS", () => {
      vi.stubEnv('STASH_ADDRESS', 'https://secure-stash.com');

      const result = getStashOrigin();
      expect(result).toBe('https://secure-stash.com');
    });

    it("handles STASH_ADDRESS with path", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://stash.example.com/stash');

      const result = getStashOrigin();
      expect(result).toBe('http://stash.example.com/stash');
    });

    it("handles STASH_ADDRESS with port", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://localhost:8080');

      const result = getStashOrigin();
      expect(result).toBe('http://localhost:8080');
    });
  });

  describe("fallback to window.location", () => {
    it("falls back to window.location.origin when STASH_ADDRESS not set", () => {
      vi.stubEnv('STASH_ADDRESS', undefined);

      const result = getStashOrigin();
      expect(result).toBe(window.location.origin);
    });

    it("falls back to window.location.origin when STASH_ADDRESS is empty string", () => {
      vi.stubEnv('STASH_ADDRESS', '');

      const result = getStashOrigin();
      expect(result).toBe(window.location.origin);
    });

    it("handles different window.location origins", () => {
      vi.stubEnv('STASH_ADDRESS', undefined);

      // The test origin should be http://localhost:3000 from vitest config
      const result = getStashOrigin();
      expect(result).toMatch(/https?:\/\/.+/);
      expect(typeof result).toBe('string');
    });
  });

  describe("edge cases", () => {
    it("handles STASH_ADDRESS with trailing slash", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://stash.example.com/');

      const result = getStashOrigin();
      expect(result).toBe('http://stash.example.com/');
    });

    it("handles STASH_ADDRESS with query string", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://stash.example.com?token=123');

      const result = getStashOrigin();
      expect(result).toBe('http://stash.example.com?token=123');
    });

    it("handles STASH_ADDRESS with hash", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://stash.example.com#section');

      const result = getStashOrigin();
      expect(result).toBe('http://stash.example.com#section');
    });
  });

  describe("real-world scenarios", () => {
    it("handles localhost development setup", () => {
      vi.stubEnv('STASH_ADDRESS', 'http://localhost:9999');

      const result = getStashOrigin();
      expect(result).toBe('http://localhost:9999');
      expect(result).toContain('localhost');
      expect(result).toContain('9999');
    });

    it("handles production Stash instance", () => {
      vi.stubEnv('STASH_ADDRESS', 'https://stash.example.com');

      const result = getStashOrigin();
      expect(result).toBe('https://stash.example.com');
      expect(result).toContain('https://');
    });

    it("handles Stash behind reverse proxy", () => {
      vi.stubEnv('STASH_ADDRESS', 'https://media.company.com/stash');

      const result = getStashOrigin();
      expect(result).toBe('https://media.company.com/stash');
    });
  });
});
