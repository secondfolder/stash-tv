import { defineConfig } from "vitest/config";
import path from "node:path";

const sharedTestOptions = {
  // Radix's ESM dist imports "react/jsx-runtime" extensionless, which Node's CJS
  // React 17 can't resolve — inlining it through vite lets the alias above apply.
  server: {
    deps: {
      inline: [/@radix-ui\/\.*/],
    },
  },
  environment: "jsdom",
  environmentOptions: {
    jsdom: {
      // A real origin is required for localStorage/sessionStorage to exist
      url: "http://localhost:3000/",
    },
  },
  // React 17 + jsdom + websocket-heavy app code: forked processes isolate the
  // module-level stores (accumulator, filter state) and play nicer with TLA modules.
  pool: "forks",
  // Tests run in parallel. Apollo WebSocket clients are tracked and disposed in
  // test/setup.ts (global afterAll), so no reconnection storms at teardown.
  // @see docs/historical-plans/2026-08-30-websocket-cleanup-problem-handoff.md
  testTimeout: 20000,
  hookTimeout: 20000,
  restoreMocks: true,
  logHeapUsage: true,
  onUnhandledError: suppressPostTeardownNoise,
  onUnhandledRejection: suppressPostTeardownNoise,
};

/**
 * The VTT thumbnails plugin (bundled in stash-ui dist) sets up timers that
 * fire after jsdom teardown, causing "window is not defined" errors from
 * third-party code we can't patch. Suppression is deliberately narrow: the
 * error must come from that plugin's stack so genuine app-code errors with
 * the same message still fail the run.
 */
function suppressPostTeardownNoise(error: unknown): void {
  const stack = error instanceof Error ? error.stack ?? "" : "";
  const fromBundledThirdParty = /stash-ui|node_modules/.test(stack);
  if (
    error instanceof ReferenceError &&
    error.message === "window is not defined" &&
    fromBundledThirdParty
  ) {
    return;
  }
  // Let other errors propagate - they might be real issues
  throw error;
}

export default defineConfig({
  resolve: {
    alias: {
      // React 17's CJS builds don't resolve extensionless ESM subpath imports
      // (e.g. from Radix's .mjs dist) — point them at the CJS files.
      "react/jsx-runtime": path.resolve(__dirname, "../../node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "../../node_modules/react/jsx-dev-runtime.js"),
    },
  },
  test: {
    // Suppress console logs unless the test fails
    silent: 'passed-only',
    coverage: {
      provider: "v8",
      // Only tv-ui's own source counts — dependencies (stash-ui, react, etc.)
      // are exercised by these tests but are not ours to measure.
      include: ["src/**"],
      // Storybook files are not shipped app code.
      exclude: ["src/**/*.stories.tsx"],
    },
    // Unit and integration run as separate projects so the Apollo client mock
    // can be applied to unit tests only (integration needs the real client
    // against mock-stash). See test/setup-unit-apollo.ts.
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "test/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts", "./test/setup-unit-apollo.ts"],
          ...sharedTestOptions,
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts"],
          ...sharedTestOptions,
        },
      },
    ],
  },
});
