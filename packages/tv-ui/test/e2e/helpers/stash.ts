import { expect, type APIRequestContext } from '@playwright/test';

/** Run a GraphQL operation against mock-stash, failing the test if it errors. */
export async function graphql(request: APIRequestContext, query: string, variables: Record<string, unknown> = {}) {
  const response = await request.post('/graphql', { data: { query, variables } });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  return body.data;
}

/**
 * Replace the persisted tvConfig (stored in Stash's plugin config, see docs/state-and-config.md) with the given
 * settings, with the first-run guide overlay dismissed so it doesn't cover the page. `null` resets the config to
 * defaults.
 */
export async function setTvConfig(request: APIRequestContext, state: Record<string, unknown> | null) {
  const input = state
    ? { 'app-state': JSON.stringify({ state: { ...state, showGuideOverlay: false }, version: 3 }) }
    : {};
  await graphql(
    request,
    'mutation ($input: Map!) { configurePlugin(plugin_id: "stash-tv", input: $input) }',
    { input }
  );
}

/** Replace the persisted action button stack (see `setTvConfig`). `null` resets the config to defaults. */
export async function setActionButtons(request: APIRequestContext, actionButtonStackConfig: unknown[] | null) {
  await setTvConfig(request, actionButtonStackConfig && { actionButtonStackConfig });
}
