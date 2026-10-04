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
 *
 * Videos start from the beginning unless the settings say otherwise, rather than where they were last left: the app
 * saves a scene's play position to mock-stash as it plays, which outlives each test, so a video could otherwise start
 * near its end, and the feed move on to the next once it ends.
 */
export async function setTvConfig(request: APIRequestContext, state: Record<string, unknown> | null) {
  const input = state
    ? { 'app-state': JSON.stringify({ state: { startPosition: 'beginning', ...state, showGuideOverlay: false }, version: 3 }) }
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

/** Create tags with the given names in one request (each a field of its own), returning their ids in order */
export async function createTags(request: APIRequestContext, names: string[]): Promise<string[]> {
  const fields = names.map((_, i) => `tag${i}: tagCreate(input: { name: $name${i} }) { id }`);
  const variables = Object.fromEntries(names.map((name, i) => [`name${i}`, name]));
  const data = await graphql(
    request,
    `mutation (${names.map((_, i) => `$name${i}: String!`).join(', ')}) { ${fields.join(' ')} }`,
    variables
  );
  return names.map((_, i) => data[`tag${i}`].id);
}

/** Remove the tags with the given ids, in one request */
export async function destroyTags(request: APIRequestContext, ids: string[]) {
  if (!ids.length) return;
  const fields = ids.map((_, i) => `tag${i}: tagDestroy(input: { id: $id${i} })`);
  await graphql(
    request,
    `mutation (${ids.map((_, i) => `$id${i}: ID!`).join(', ')}) { ${fields.join(' ')} }`,
    Object.fromEntries(ids.map((id, i) => [`id${i}`, id]))
  );
}
