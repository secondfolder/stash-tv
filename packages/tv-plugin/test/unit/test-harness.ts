/**
 * Test harness for tv-plugin tests
 *
 * Installs a mocked PluginApi on the global window before dynamically
 * importing the real `main.tsx`, so the plugin's module-level registration
 * and first-run setup run against the mock.
 */

import { vi } from "vitest";
import { createPluginApiMock } from "./plugin-api-mock";

/**
 * Install the mocked PluginApi globally and import a fresh copy of main.tsx.
 *
 * `configuration` controls what the mocked Configuration query resolves to,
 * which drives the plugin's first-run setup logic at import time.
 */
export async function importPlugin(configuration: {
  plugins?: Record<string, unknown>;
  interface?: { menuItems?: string[] };
}) {
  const mock = createPluginApiMock();
  mock.query.mockResolvedValue({
    data: {
      configuration: {
        plugins: configuration.plugins ?? {},
        interface: configuration.interface ?? { menuItems: [] },
      },
    },
  });

  vi.resetModules();
  (globalThis as { window: unknown }).window = { PluginApi: mock.pluginApi };

  await import("../../main");

  return mock;
}
