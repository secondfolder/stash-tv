import type { MockStore } from "./store";
import type { StashVersion } from "./stash-versions";

/** Per-request resolver context. `baseUrl` is filled in once the server is listening. */
export interface MockContext {
  store: MockStore;
  baseUrl: string;
  /** The Stash version the server serves */
  stashVersion: StashVersion;
}

export interface ContextHolder {
  /** The store for a tenant's requests, or the server's default store for requests without one */
  storeFor(tenant: string | undefined): MockStore;
  baseUrl: string;
  stashVersion: StashVersion;
}

export function createContextFactory(holder: ContextHolder) {
  return (tenant: string | undefined): MockContext => ({ store: holder.storeFor(tenant), baseUrl: holder.baseUrl, stashVersion: holder.stashVersion });
}
