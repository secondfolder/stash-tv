import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { startMockStash, type MockStashServer } from "mock-stash";

/**
 * Boots the app against a real in-memory Stash API for integration tests.
 *
 * Usage:
 *   setupIntegrationTest();
 *   // then, inside each test:
 *   const { App } = await loadFreshAppModules();
 *
 * The app's Apollo client is created by stash-ui's `createClient()`, which captures
 * `import.meta.env.VITE_APP_PLATFORM_URL` (in DEV mode) at link-construction time.
 * So the env var MUST be stubbed before app modules are imported, and modules MUST be
 * re-imported fresh per test (module-level stores like the media-items accumulator
 * would otherwise leak state between tests).
 */

let server: MockStashServer;

export function setupIntegrationTest() {
  beforeAll(async () => {
    server = await startMockStash();
    // Must be stubbed before any app module import — the Apollo link captures it at
    // construction (DEV mode reads VITE_APP_PLATFORM_URL).
    vi.stubEnv("VITE_APP_PLATFORM_URL", server.url);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // NOTE: the server is deliberately NOT stopped in afterAll. The app's Apollo
  // clients hold WebSocket subscriptions with infinite retry against this server;
  // stopping it before jsdom teardown produces unhandled error events that vitest
  // treats as failures. The worker process exits right after the run, releasing
  // the ephemeral port.
  return {
    get server() {
      return server;
    },
  };
}

/** Reset the module registry and re-import app modules against the running mock server. */
export async function loadFreshAppModules() {
  vi.resetModules();
  return await import("../../../src/app/App");
}
