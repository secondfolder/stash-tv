import type { MockStore } from "./store";

/** Per-request resolver context. `baseUrl` is filled in once the server is listening. */
export interface MockContext {
  store: MockStore;
  baseUrl: string;
}

export interface ContextHolder {
  store: MockStore;
  baseUrl: string;
}

export function createContextFactory(holder: ContextHolder) {
  return (): MockContext => ({ store: holder.store, baseUrl: holder.baseUrl });
}
