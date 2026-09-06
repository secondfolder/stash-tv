import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Suppress console logs unless the test fails
    silent: 'passed-only',
    // conformance tests are a separate tier (see vitest.conformance.config.ts)
    include: ["test/**/*.test.ts"],
    exclude: ["test/conformance/**", "**/node_modules/**", "**/dist/**"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
