import http from "node:http";
import type { AddressInfo } from "node:net";
import { createYoga } from "graphql-yoga";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { getStashSchema } from "./schema";
import { createStore, type MockStore } from "./store";
import { createDefaultFixtures } from "./fixtures";
import { handleMediaRoute } from "./media";
import { createContextFactory, type ContextHolder } from "./context";
import type { Fixtures } from "./types";

export interface MockStashServer {
  /** Base URL of the server, e.g. `http://127.0.0.1:54321` (assigned port when unset). */
  url: string;
  /** GraphQL-over-HTTP endpoint. */
  httpUrl: string;
  /** graphql-ws (WebSocket) subscription endpoint. */
  wsUrl: string;
  /** The live store — mutate entities directly to arrange test scenarios. */
  store: MockStore;
  /** Emit a scanComplete event to all subscribers (as a finished scan would). */
  triggerScanComplete(): void;
  stop(): Promise<void>;
}

export interface StartMockStashOptions {
  /** Fixed port; default is an ephemeral port, so parallel servers never collide. */
  port?: number;
  /** Full fixture override (defaults to `createDefaultFixtures()`). */
  fixtures?: Fixtures;
}

/**
 * Boots a complete in-memory Stash API: GraphQL over HTTP (including multipart uploads)
 * + graphql-ws subscriptions (the protocol the app uses) + media streaming routes —
 * all on one ephemeral port, seeded from deterministic fixtures.
 */
export async function startMockStash(
  options: StartMockStashOptions = {},
): Promise<MockStashServer> {
  const store = createStore(options.fixtures ?? createDefaultFixtures());

  const holder: ContextHolder = { store, baseUrl: "" };
  const contextFactory = createContextFactory(holder);

  const schema = getStashSchema();

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    logging: false,
    maskedErrors: false,
    cors: { origin: "*" },
    context: contextFactory,
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock-stash.local");
    if (
      (url.pathname.startsWith("/scene/") || url.pathname.startsWith("/marker/")) &&
      req.method !== "POST"
    ) {
      handleMediaRoute(req, res, store);
      return;
    }
    yoga(req as never, res as never);
  });

  const wss = new WebSocketServer({ server, path: "/graphql" });
  const enveloped = yoga.getEnveloped({});
  useServer(
    {
      schema,
      execute: enveloped.execute,
      subscribe: enveloped.subscribe,
      context: contextFactory,
    },
    wss,
  );

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  holder.baseUrl = baseUrl;

  return {
    url: baseUrl,
    httpUrl: `${baseUrl}/graphql`,
    wsUrl: `ws://127.0.0.1:${address.port}/graphql`,
    store,
    triggerScanComplete: () => store.scanComplete.emit(),
    stop: async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
