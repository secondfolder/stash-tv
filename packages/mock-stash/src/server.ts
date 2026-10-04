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
import { tenantOf } from "./tenant";

export { MOCK_STASH_TENANT_COOKIE, MOCK_STASH_TENANT_HEADER } from "./tenant";

export interface MockStashServer {
  /** Base URL of the server, e.g. `http://127.0.0.1:54321` (assigned port when unset). */
  url: string;
  /** GraphQL-over-HTTP endpoint. */
  httpUrl: string;
  /** graphql-ws (WebSocket) subscription endpoint. */
  wsUrl: string;
  /** The live store — mutate entities directly to arrange test scenarios. (The default store: not a tenant's.) */
  store: MockStore;
  /** Count of GraphQL operations executed, by operation name (HTTP and WS). */
  getRequestCounts(): Readonly<Record<string, number>>;
  /** Every GraphQL operation executed, in order, with its variables (HTTP and WS). */
  getRequests(): readonly { operationName: string; variables: Record<string, unknown> }[];
  /** Clear the request counts and log (e.g. to observe only post-trigger traffic). */
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

  // Fresh fixtures for each store: a store keeps (and changes) the records it's given
  const freshFixtures = () => (options.fixtures ? structuredClone(options.fixtures) : createDefaultFixtures());
  const store = createStore(freshFixtures());
  const tenantStores = new Map<string, MockStore>();
  const storeFor = (tenant: string | undefined) => {
    if (!tenant) return store;
    let tenantStore = tenantStores.get(tenant);
    if (!tenantStore) {
      tenantStore = createStore(freshFixtures());
      tenantStores.set(tenant, tenantStore);
    }
    return tenantStore;
  };
  const nodeHeaders = (headers: http.IncomingHttpHeaders) => ({
    header: (name: string) => {
      const value = headers[name];
      return Array.isArray(value) ? value.join("; ") : value;
    },
  });

  const holder: ContextHolder = { storeFor, baseUrl: "" };
  const contextFactory = createContextFactory(holder);

  // Instrument operation execution so tests can observe which GraphQL
  // operations ran (and how many times) — e.g. proving a refetch happened.
  const requestCounts: Record<string, number> = {};
  const requests: { operationName: string; variables: Record<string, unknown> }[] = [];

  const schema = getStashSchema();

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    logging: false,
    maskedErrors: false,
    cors: { origin: "*" },
    context: ({ request }: { request: Request }) =>
      contextFactory(tenantOf({ header: (name) => request.headers.get(name) })),
    plugins: [
      {
        onExecute({ args }: { args: { operationName?: string; variableValues?: unknown } }) {
          const name = args.operationName ?? "<anonymous>";
          requestCounts[name] = (requestCounts[name] ?? 0) + 1;
          const variables = args.variableValues;
          requests.push({
            operationName: name,
            variables: typeof variables === "object" && variables !== null ? structuredClone({ ...variables }) : {},
          });
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
      handleMediaRoute(req, res, storeFor(tenantOf(nodeHeaders(req.headers))));
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
      context: (ctx) => contextFactory(tenantOf(nodeHeaders(ctx.extra.request.headers))),
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
    getRequests: () => structuredClone(requests),
    resetRequestCounts: () => {
      for (const key of Object.keys(requestCounts)) delete requestCounts[key];
      requests.length = 0;
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
