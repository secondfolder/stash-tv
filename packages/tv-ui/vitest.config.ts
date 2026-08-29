import { defineConfig } from "vitest/config";
import path from "node:path";

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
    include: [
      "src/**/*.test.{ts,tsx}",
      "test/unit/**/*.test.{ts,tsx}",
      "test/integration/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["./test/setup.ts"],
    // React 17 + jsdom + websocket-heavy app code: forked processes isolate the
    // module-level stores (accumulator, filter state) and play nicer with TLA modules.
    pool: "forks",
    testTimeout: 20000,
    hookTimeout: 20000,
    restoreMocks: true,
  },
});
