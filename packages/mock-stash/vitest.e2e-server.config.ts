import { defineConfig } from "vitest/config";

/**
 * Long-running mock-stash server for Playwright E2E tests.
 *
 * The server source is TypeScript (the package has no build step), so it runs
 * through Vitest — the only runner wired up to transform this package's TS.
 * `poolMatchGlobs` keeps it to a single process; the test never finishes,
 * keeping the server up until the E2E run tears it down.
 */

export default defineConfig({
  test: {
    include: ["e2e-server.test.ts"],
    testTimeout: 24 * 60 * 60 * 1000, // Run "forever": the server outlives the test
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ["default"],
    passWithNoTests: false,
  },
});
