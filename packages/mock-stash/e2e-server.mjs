#!/usr/bin/env node

/**
 * E2E test server for mock-stash
 *
 * Boots mock-stash on a fixed port (4000) for Playwright E2E tests.
 * This is a long-running server that persists across test runs.
 */

import { startMockStash } from "./src/server.js";

console.log("Starting mock-stash E2E server on port 4000...");

const server = await startMockStash({ port: 4000 });

console.log(`Mock Stash server running at: ${server.url}`);
console.log(`GraphQL endpoint: ${server.httpUrl}`);
console.log(`WebSocket endpoint: ${server.wsUrl}`);
console.log("\nPress Ctrl+C to stop the server.");

// Keep the process alive
process.on("SIGINT", async () => {
  console.log("\nStopping mock-stash E2E server...");
  await server.stop();
  process.exit(0);
});