/**
 * The header or cookie naming a request's tenant. Each tenant has a store of its own, created from the fixtures the
 * first time it makes a request, so clients sharing the server (e.g. E2E test workers running in parallel) don't see
 * each other's changes. Requests without either use the server's default `store`.
 *
 * A browser should name it in a cookie: a header on its cross-origin requests (e.g. the app's media, which comes
 * straight from mock-stash) would need CORS, and a cookie isn't tied to a port, so it reaches both the app's dev server
 * and mock-stash.
 *
 * In a module of its own so clients can import it without the server (e.g. Playwright, which can't load the server's
 * modules).
 */
export const MOCK_STASH_TENANT_HEADER = "x-mock-stash-tenant";
export const MOCK_STASH_TENANT_COOKIE = "mock-stash-tenant";

/** The tenant a request's headers name, if any */
export function tenantOf(headers: { header(name: string): string | null | undefined }) {
  const header = headers.header(MOCK_STASH_TENANT_HEADER);
  if (header) return header;
  const cookies = headers.header("cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === MOCK_STASH_TENANT_COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
