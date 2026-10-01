import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * E2E tests: dropdowns inside the create-marker button's side panel open where the user can see and use them.
 *
 * The side panel is a Popper-positioned popover with an outside-click backdrop behind it, and grows to fit content
 * overflowing it (e.g. an open dropdown menu). None of that has layout in jsdom, so it's only testable here.
 *
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 * @see docs/action-buttons.md § "Create-Marker Button"
 */

const firstSceneId = 'scene-7'; // The first slide (the newest scene)

async function graphql(request: APIRequestContext, query: string, variables: Record<string, unknown> = {}) {
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
async function setActionButtons(request: APIRequestContext, actionButtonStackConfig: unknown[] | null) {
  const input = actionButtonStackConfig
    ? { 'app-state': JSON.stringify({ state: { actionButtonStackConfig, showGuideOverlay: false }, version: 2 }) }
    : {};
  await graphql(
    request,
    'mutation ($input: Map!) { configurePlugin(plugin_id: "stash-tv", input: $input) }',
    { input }
  );
}

async function createMarker(request: APIRequestContext, title: string, seconds: number): Promise<string> {
  const data = await graphql(
    request,
    `mutation ($input: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $input) { id } }`,
    { input: { scene_id: firstSceneId, title, seconds, primary_tag_id: 'tag-alpha', tag_ids: [] } }
  );
  return data.sceneMarkerCreate.id;
}

/**
 * Assert that the element is entirely on screen and is what the user would actually hit when clicking its middle,
 * i.e. it isn't positioned off-screen or hidden behind something (`toBeVisible` checks neither).
 */
async function expectUsableOnScreen(element: Locator) {
  await expect(element).toBeInViewport({ ratio: 1 });
  const isTopmost = await element.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  });
  expect(isTopmost, 'element is covered by something else').toBe(true);
}

async function openPanel(page: Page) {
  await page.goto('/');
  const slide = page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
  await slide.getByRole('button', { name: 'Create marker for scene' }).click();
  const panel = page.locator('.action-button-side-panel');
  await expect(panel.locator('.action-button-create-marker')).toBeVisible();
  return panel;
}

test.describe('Create-marker side panel', () => {
  const markerIds: string[] = [];

  test.beforeEach(async ({ request }) => {
    await setActionButtons(request, [
      { id: 'create-marker', type: 'button', buttonType: 'create-marker', iconId: 'add-marker', markerDefaults: null, pinned: true },
    ]);
    markerIds.push(await createMarker(request, 'Intro', 1), await createMarker(request, 'Finale', 8));
  });

  test.afterEach(async ({ request }) => {
    for (const id of markerIds.splice(0)) {
      await graphql(request, 'mutation ($id: ID!) { sceneMarkerDestroy(id: $id) }', { id });
    }
    await setActionButtons(request, null);
  });

  test('opens the "Edit an existing marker" dropdown where it can be seen and used', async ({ page }) => {
    const panel = await openPanel(page);

    await panel.getByLabel('Edit an existing marker').click();

    const option = page.getByRole('option', { name: '0:08 Finale' });
    await expectUsableOnScreen(option);
    await option.click();
    await expect(panel.locator('.edit-existing-marker .react-select__single-value')).toHaveText('0:08 Finale');
  });

  test("opens the marker form's primary tag dropdown where it can be seen and used", async ({ page }) => {
    const panel = await openPanel(page);
    const primaryTagField = panel.locator('.form-group', { has: page.locator('label[for="primary_tag_id"]') });

    await primaryTagField.locator('.react-select__control').click();

    const option = page.getByRole('option', { name: 'Delta' });
    await expectUsableOnScreen(option);
    await option.click();
    await expect(primaryTagField).toContainText('Delta');
  });
});
