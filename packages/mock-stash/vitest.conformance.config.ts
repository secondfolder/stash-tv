import { defineConfig } from "vitest/config";
import { testedStashVersions } from "./src/stash-versions";

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
    // Once per Stash version Stash TV is tested against, each against the real Stash of that version (see
    // docs/stash-compatibility.md). CI runs each project in a job of its own.
    projects: testedStashVersions().map((version) => ({
      test: { name: `conformance-stash-${version}`, env: { MOCK_STASH_VERSION: version }, ...sharedTestOptions },
    })),
  },
});
