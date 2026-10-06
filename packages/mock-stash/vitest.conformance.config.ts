import { defineConfig } from "vitest/config";

// Conformance tests run the real Stash docker container (see test/conformance/).
// They are a separate tier: slow, docker-dependent, excluded from `yarn test`.
const sharedTestOptions = {
  environment: "node",
  include: ["test/conformance/**/*.test.ts"],
  // One container for the whole suite; tests within it share state by design.
  fileParallelism: false,
  testTimeout: 300_000,
  hookTimeout: 300_000,
};

export default defineConfig({
  test: {
    // Once per Stash version Stash TV supports (see docs/stash-compatibility.md)
    projects: [
      { test: { name: "conformance", ...sharedTestOptions } },
      { test: { name: "conformance-latest-release", env: { MOCK_STASH_VERSION: "latest-release" }, ...sharedTestOptions } },
    ],
  },
});
