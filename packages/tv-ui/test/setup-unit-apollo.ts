import { vi } from "vitest";

/**
 * Apollo client mock, applied to the **unit** project only (see vitest.config.ts).
 *
 * Unit tests should never create real Apollo clients or make network requests:
 * the tvConfig store hydrates via `stashConfigStorage`, which lazily builds an
 * Apollo client and queries the (absent) Stash API. Even though those failures
 * are caught, Apollo's internal Concast promises can surface them as unhandled
 * rejections. Integration tests use the real client against `mock-stash`
 * instead — that's why this mock must NOT be in the shared `test/setup.ts`.
 *
 * @see docs/testing.md § "Test-only exceptions to app-code rules"
 */

// Minimal successful Configuration query result — `getStashTvConfig` reads
// `data.configuration.plugins`, so `{ data: {} }` would throw.
const emptyConfigResult = () => ({ data: { configuration: { plugins: {} } } });

vi.mock("../src/hooks/getApolloClient", () => ({
  getApolloClient: vi.fn(() => ({
    query: vi.fn(() => Promise.resolve(emptyConfigResult())),
    mutate: vi.fn(() => Promise.resolve({ data: {} })),
    subscribe: vi.fn(() => ({
      subscribe: vi.fn(() => ({
        unsubscribe: vi.fn(),
      })),
    })),
    resetStore: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    cache: {
      reset: vi.fn(),
    },
  })),
}));

// No tags, as for an empty library: what Stash's tag selects (e.g. in action button settings) load their options with
const noTags = () => Promise.resolve({ data: { findTags: { count: 0, tags: [] } } });

// Also mock the stash-ui StashService client used directly by some reused
// components — same reasoning, no real connections from unit tests. Its own
// query helpers use its real client, not `getClient()`, so those the reused
// components call are mocked too.
vi.mock("stash-ui/dist/src/core/StashService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stash-ui/dist/src/core/StashService")>();
  return {
    ...actual,
    queryFindTagsForSelect: vi.fn(noTags),
    queryFindTagsByIDForSelect: vi.fn(noTags),
    getClient: vi.fn(() => ({
      query: vi.fn(() => Promise.resolve(emptyConfigResult())),
      mutate: vi.fn(() => Promise.resolve({ data: {} })),
      subscribe: vi.fn(() => ({
        subscribe: vi.fn(() => ({
          unsubscribe: vi.fn(),
        })),
      })),
      stop: vi.fn(),
      cache: { reset: vi.fn() },
    })),
  };
});
