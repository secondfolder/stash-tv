/**
 * Test harness for tv-plugin tests
 *
 * Provides a mocked PluginApi environment simulating Stash's iframe context.
 * This enables testing plugin initialization, menu injection, settings, and
 * config persistence without requiring a real Stash instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPluginApiMock, PluginApiMock } from './plugin-api-mock';

/**
 * Sets up the plugin environment before each test.
 * This must be called before importing any plugin code that accesses window.PluginApi.
 */
export function setupPluginEnvironment() {
  const mockPluginApi = createPluginApiMock();

  // Mock window.PluginApi (Node environment)
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'PluginApi', {
      value: mockPluginApi,
      writable: true,
      configurable: true,
    });
  } else {
    // In Node environment, add to global
    (global as any).window = {};
    (global as any).window.PluginApi = mockPluginApi;
  }

  return mockPluginApi;
}

/**
 * Cleans up the plugin environment after each test.
 * Clears any mocks and resets state.
 */
export function cleanupPluginEnvironment() {
  if (typeof window !== 'undefined') {
    // @ts-expect-error - we're removing the PluginApi mock
    delete window.PluginApi;
  } else {
    // In Node environment, clean up global
    (global as any).window = {};
  }
  vi.clearAllMocks();
}

/**
 * Creates a test suite helper that automatically sets up and tears down the plugin environment.
 * Use this instead of describe() for plugin tests.
 */
export function describePlugin(name: string, fn: () => void) {
  describe(name, () => {
    let mockPluginApi: PluginApiMock;

    beforeEach(() => {
      mockPluginApi = setupPluginEnvironment();
    });

    afterEach(() => {
      cleanupPluginEnvironment();
    });

    fn();
  });
}

/**
 * Re-export types for use in test files
 */
export type { PluginApiMock };
