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
 * Replace the persisted action button stack (stored in Stash's plugin config, see docs/state-and-config.md), with the
 * first-run guide overlay dismissed so it doesn't cover the page. `null` resets the config to defaults.
 */
export async function setActionButtons(request: APIRequestContext, actionButtonStackConfig: unknown[] | null) {
  const input = actionButtonStackConfig
    ? { 'app-state': JSON.stringify({ state: { actionButtonStackConfig, showGuideOverlay: false }, version: 2 }) }
    : {};
  await graphql(
    request,
    'mutation ($input: Map!) { configurePlugin(plugin_id: "stash-tv", input: $input) }',
    { input }
  );
}
