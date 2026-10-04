import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";
import svgr from "vite-plugin-svgr";

// Match the app build: `*.svg?react` imports are React components. Without this
// they resolve to data-URL strings, so components render different icons in tests
// than in the app. Projects don't inherit root `plugins`, so each project sets it.
// The assertion is only for types: vite-plugin-svgr is typed against its own
// nested copy of `vite`, whose plugin types don't match vitest's copy even
// though the plugin works with both.
const sharedPlugins = [svgr() as Plugin];

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
  // Generous, so that a test that's merely slow (e.g. on a machine busy running other things, where everything can
  // take several times as long) passes rather than fails. A test that's failing still fails on its own waits first.
  // @see docs/testing.md § "Gotchas"
  testTimeout: 60000,
  hookTimeout: 60000,
  restoreMocks: true,
  logHeapUsage: true,
};

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
        plugins: sharedPlugins,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "test/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts", "./test/setup-unit-apollo.ts"],
          ...sharedTestOptions,
        },
      },
      {
        plugins: sharedPlugins,
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
