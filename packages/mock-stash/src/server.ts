import http from "node:http";
import type { AddressInfo } from "node:net";
import { createYoga } from "graphql-yoga";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { getStashSchema } from "./schema";
import { createStore, type MockStore } from "./store";
import { createDefaultFixtures } from "./fixtures";
import { ensureMediaFixtures } from "./generate-media";
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
  /** Count of GraphQL operations executed, by operation name (HTTP and WS). */
  getRequestCounts(): Readonly<Record<string, number>>;
  /** Zero the request counts (e.g. to observe only post-trigger traffic). */
  resetRequestCounts(): void;
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
  // Fixtures are gitignored (ffmpeg regenerates them byte-identically), and
  // `createDefaultFixtures` reads their sizes — so this must run first.
  ensureMediaFixtures();

  const store = createStore(options.fixtures ?? createDefaultFixtures());

  const holder: ContextHolder = { store, baseUrl: "" };
  const contextFactory = createContextFactory(holder);

  // Instrument operation execution so tests can observe which GraphQL
  // operations ran (and how many times) — e.g. proving a refetch happened.
  const requestCounts: Record<string, number> = {};

  const schema = getStashSchema();

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    logging: false,
    maskedErrors: false,
    cors: { origin: "*" },
    context: contextFactory,
    plugins: [
      {
        onExecute({ args }: { args: { operationName?: string; variableValues?: unknown } }) {
          const name = args.operationName ?? "<anonymous>";
          requestCounts[name] = (requestCounts[name] ?? 0) + 1;
          if (process.env.DEBUG_MOCK_REQUESTS) {
            console.log(`[mock-stash] ${name}`, JSON.stringify(args.variableValues));
          }
        },
      },
    ],
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

  // Reject on listen errors (e.g. EADDRINUSE) rather than hanging forever.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  // Attached only once listening: ws re-emits the HTTP server's errors, and
  // graphql-ws would log a listen failure as a noisy "internal error".
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

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  holder.baseUrl = baseUrl;

  return {
    url: baseUrl,
    httpUrl: `${baseUrl}/graphql`,
    wsUrl: `ws://127.0.0.1:${address.port}/graphql`,
    store,
    getRequestCounts: () => structuredClone(requestCounts),
    resetRequestCounts: () => {
      for (const key of Object.keys(requestCounts)) delete requestCounts[key];
    },
    triggerScanComplete: () => store.scanComplete.emit(),
    stop: async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
