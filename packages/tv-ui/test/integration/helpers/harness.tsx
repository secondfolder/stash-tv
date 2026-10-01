import { afterEach, beforeAll, beforeEach, vi, expect } from "vitest";
import { act, cleanup, configure, render, waitFor } from "@testing-library/react";
import React from "react";
import { ApolloProvider } from "@apollo/client";
import { startMockStash, type MockStashServer } from "mock-stash";

/**
 * Boots the app against a real in-memory Stash API for integration tests.
 *
 * Usage:
 *   setupIntegrationTest();
 *   // then, inside each test:
 *   const app = await bootApp();
 *
 * The app's Apollo client is created by stash-ui's `createClient()`, which captures
 * `import.meta.env.VITE_APP_PLATFORM_URL` (in DEV mode) at link-construction time.
 * So the env var MUST be stubbed before app modules are imported, and modules MUST be
 * re-imported fresh per test (module-level stores like the media-items accumulator
 * would otherwise leak state between tests).
 */

let server: MockStashServer;

// RTL's default 1s for `waitFor`/`findBy*` is too tight here: the app and the mock server share one thread, so a
// mutation's round trip plus the re-render it causes (~200ms alone) can take several times longer when the whole suite
// runs in parallel. A longer timeout only slows down tests that are failing anyway.
configure({ asyncUtilTimeout: 5000 });

export function setupIntegrationTest() {
  beforeAll(async () => {
    server = await startMockStash();
    // Must be stubbed before any app module import — the Apollo link captures it at
    // construction (DEV mode reads VITE_APP_PLATFORM_URL).
    vi.stubEnv("VITE_APP_PLATFORM_URL", server.url);
  });

  afterEach(() => {
    // Unmount anything a failed test left mounted *before* resetting the document below. Vitest runs afterEach hooks
    // in reverse registration order, so the global RTL cleanup in setup.ts would otherwise run after this reset and
    // the unmount would leak state (e.g. a modal's inline styles) into the next test's boot.
    cleanup();
    localStorage.clear();
    // jsdom's document outlives each boot. Opening a modal writes inline state onto <html>/<body> (e.g.
    // `--fixed-right-padding`, which under the stubbed VisualViewport is a bogus 649px that react-spring then fails
    // to parse when the next boot mounts the settings drawer), so reset it like a page reload would.
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    document.body.className = "";
    // Config written through the app's hybrid storage lands in the server's
    // plugin config; reset it so tests can't rehydrate each other's state.
    server.store.pluginConfig = {};
    server.store.uiConfig = {};
    server.resetRequestCounts();
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

/**
 * Restore the server's scenes and markers after each test, for tests that change them (ratings, tags, o-counts,
 * deletes…): the server store outlives each test.
 */
export function restoreServerMediaAfterEach(integration: ReturnType<typeof setupIntegrationTest>) {
  let scenes: MockStashServer["store"]["scenes"];
  let markers: MockStashServer["store"]["markers"];
  beforeEach(() => {
    scenes = structuredClone(integration.server.store.scenes);
    markers = structuredClone(integration.server.store.markers);
  });
  afterEach(() => {
    const { store } = integration.server;
    store.scenes.clear();
    for (const [id, scene] of scenes) store.scenes.set(id, scene);
    store.markers.clear();
    for (const [id, marker] of markers) store.markers.set(id, marker);
  });
}

/**
 * The tvConfig the app has saved to the server's plugin config (its Stash-persisted half). The app saves without
 * waiting for the write, so a test that changes persisted config must wait for it to land here before it ends:
 * otherwise the write can land after the `afterEach` reset and leak into the next test's boot.
 */
export function savedTvConfig(integration: ReturnType<typeof setupIntegrationTest>): Record<string, unknown> {
  const saved = integration.server.store.pluginConfig["stash-tv"]?.["app-state"];
  if (typeof saved !== "string") return {};
  const parsed: unknown = JSON.parse(saved);
  if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) return {};
  const { state } = parsed;
  return typeof state === "object" && state !== null ? { ...state } : {};
}

/** Reset the module registry and re-import app modules against the running mock server. */
export async function loadFreshAppModules() {
  vi.resetModules();
  return await import("../../../src/app/App");
}

export interface BootedApp {
  rendered: ReturnType<typeof render>;
  apolloClient: Awaited<ReturnType<typeof import("../../../src/hooks/getApolloClient").getApolloClient>>;
  /** Unmount the app (Apollo clients are deliberately not stopped — see setupIntegrationTest). */
  unmount: () => Promise<void>;
}

/**
 * Boot the full app against the mock server and wait for it to be ready.
 *
 * `readyText` must be text that only renders once the config gate has opened and
 * the first page of media has loaded — "Aurora Ascending" (first-page fixture)
 * by default. Tests that boot into a different filter should pass text that
 * filter serves.
 */
export async function bootApp(readyText = "Aurora Ascending"): Promise<BootedApp> {
  const { default: App } = await loadFreshAppModules();
  const { getApolloClient } = await import("../../../src/hooks/getApolloClient");

  const apolloClient = getApolloClient();
  let rendered!: ReturnType<typeof render>;
  await act(async () => {
    rendered = render(
      <ApolloProvider client={apolloClient}>
        <App />
      </ApolloProvider>
    );
  });

  await waitFor(
    () => {
      expect(rendered.container.textContent ?? "").toContain(readyText);
    },
    { timeout: 10000 }
  );

  return {
    rendered,
    apolloClient,
    unmount: async () => {
      await act(async () => {
        rendered.unmount();
      });
    },
  };
}
