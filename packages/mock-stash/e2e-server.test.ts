import { beforeAll, it, expect } from "vitest";
import { startMockStash } from "./src/server";

/**
 * Boots mock-stash on port 4000 for Playwright E2E tests. Run with
 * `yarn test:e2e-server` (see vitest.e2e-server.config.ts for why this runs
 * through Vitest). The test holds the process open until killed.
 */

beforeAll(async () => {
  const server = await startMockStash({ port: 4000 });
  console.log(`Mock Stash server running at ${server.url}`);
});

it("serves the E2E API until the test runner is stopped", async () => {
  const response = await fetch("http://localhost:4000/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ version { version } }" }),
  });
  expect(response.ok).toBe(true);

  // Keep the process (and server) alive until Playwright tears it down
  await new Promise(() => {});
});
