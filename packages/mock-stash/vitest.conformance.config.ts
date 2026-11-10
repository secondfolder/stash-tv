import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import { testedStashVersions } from "./src/stash-versions";

// The cases adapt operations with the app's own code (tv-ui's stash-schema-compat), which Vite resolves `graphql` for
// as its ES module build, while the libraries Node loads directly get its CommonJS one: two copies of graphql, whose
// schemas and types the other rejects ("from another module or realm"). Point Vite at the CommonJS one too.
const graphql = createRequire(import.meta.url).resolve("graphql");

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
    // (Projects don't inherit the root config's `resolve`, so each has the alias.)
    projects: testedStashVersions().map((version) => ({
      resolve: { alias: { graphql } },
      test: { name: `conformance-stash-${version}`, env: { MOCK_STASH_VERSION: version }, ...sharedTestOptions },
    })),
  },
});
