import { beforeAll, it, expect } from "vitest";
import { startMockStash, type MockStashServer } from "./src/server";

/**
 * Boots mock-stash for Playwright E2E tests on `MOCK_STASH_PORT` (default 4000).
 * Run with `yarn test:e2e-server` (see vitest.e2e-server.config.ts for why this
 * runs through Vitest). The test holds the process open until killed.
 */

const preferredPort = Number(process.env.MOCK_STASH_PORT ?? 4000);

async function startOnFreePort(): Promise<MockStashServer> {
  for (let port = preferredPort; port < preferredPort + 100; port++) {
    try {
      const server = await startMockStash({ port });
      if (port !== preferredPort) {
        console.log(`Note: port ${preferredPort} is in use, using port ${port} instead.`);
      }
      return server;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error(`No free port found in ${preferredPort}–${preferredPort + 99}`);
}

let server: MockStashServer;

beforeAll(async () => {
  server = await startOnFreePort();
  console.log(`Mock Stash server running at ${server.url}`);
});

it("serves the E2E API until the test runner is stopped", async () => {
  const response = await fetch(server.httpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ version { version } }" }),
  });
  expect(response.ok).toBe(true);

  // Keep the process (and server) alive until Playwright tears it down
  await new Promise(() => {});
});
