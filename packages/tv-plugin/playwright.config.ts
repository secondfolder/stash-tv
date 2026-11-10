import { defineConfig, devices } from "@playwright/test";
import { testedStashVersions } from "../mock-stash/src/stash-versions";
import type { PluginTestOptions } from "./test/real-stash/fixtures";

/**
 * The built plugin in a real Stash (Docker), once per Stash version Stash TV is tested against. Needs the plugin built
 * first (`yarn build` at the repo root).
 *
 * @see docs/testing-mock-stash.md § "The plugin in a real Stash"
 */
export default defineConfig<PluginTestOptions>({
  testDir: "./test/real-stash",
  // The tests in a file share one Stash, and run in order
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Each project's worker starts the real Stash of its version. CI runs each project in a job of its own.
  projects: testedStashVersions().map((version) => ({
    name: `stash-${version}`,
    use: { stashVersion: version },
  })),
});
