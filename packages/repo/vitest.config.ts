import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    exclude: [
      "node_modules",
      "dist",
      ".idea",
      ".git",
      ".cache",
      "**/*.bench.ts",
    ],
    // Filesystem-based tests don't need heavy instrumentation
    coverage: {
      provider: "v8",
      enabled: false,
    },
    // Disable features we don't need for validation tests
    environment: "node",
    testTimeout: 10000,
  },
  // Resolve alias to prevent expensive module resolution
  resolve: {
    conditions: ["node"],
  },
});
