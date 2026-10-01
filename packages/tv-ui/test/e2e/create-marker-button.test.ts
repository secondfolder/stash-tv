import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * E2E tests: dropdowns inside the create-marker button's side panel open where the user can see and use them.
 *
 * The side panel is a Popper-positioned popover with an outside-click backdrop behind it. Dropdown menus in it open
 * above their input when there's no room below, without moving the panel. None of that has layout in jsdom, so it's
 * only testable here.
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
 * Assert that the element is entirely on screen and that nothing covers any part of it, i.e. it isn't positioned
 * off-screen or hidden behind something (`toBeVisible` checks neither). Checks its middle, edges and corners, since
 * something can cover just part of it (e.g. buttons poking through one end of a dropdown option).
 */
async function expectUsableOnScreen(element: Locator) {
  await expect(element).toBeInViewport({ ratio: 1 });
  const coveredAt = await element.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const inset = 2; // Stay off the very edge, which can belong to a neighbour
    const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
    const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
    const covered = [];
    for (const x of xs) {
      for (const y of ys) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) {
          covered.push(`(${Math.round(x)}, ${Math.round(y)}) by ${hit ? hit.outerHTML.slice(0, 80) : 'nothing'}`);
        }
      }
    }
    return covered;
  });
  expect(coveredAt, 'parts of the element are covered by something else').toEqual([]);
}

/** Assert every option of the open dropdown menu can be seen and clicked (see `expectUsableOnScreen`). */
async function expectAllOptionsUsable(page: Page) {
  const options = page.getByRole('option');
  await expect(options.first()).toBeVisible();
  for (const option of await options.all()) {
    await expectUsableOnScreen(option);
  }
}

async function openPanel(page: Page) {
  await page.goto('/');
  const slide = page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
  await slide.getByRole('button', { name: 'Add/edit scene marker' }).click();
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

  test('opens the add-or-edit dropdown where it can be seen and used', async ({ page, request }) => {
    // Enough markers that the menu reaches down over the form's time fields, whose buttons have their own z-index
    for (let seconds = 2; seconds <= 5; seconds++) {
      markerIds.push(await createMarker(request, `Extra ${seconds}`, seconds));
    }
    const panel = await openPanel(page);

    await panel.getByRole('combobox', { name: 'Add or edit a marker' }).click();

    await expectAllOptionsUsable(page);
    const option = page.getByRole('option', { name: 'Edit 0:08 Finale' });
    await option.click();
    await expect(panel.locator('.marker-select .react-select__single-value')).toHaveText('Edit 0:08 Finale');
  });

  test("doesn't move the panel when a dropdown opens", async ({ page }) => {
    const panel = await openPanel(page);
    // Let the panel's open animation finish
    await page.waitForTimeout(500);
    const before = await panel.boundingBox();

    await panel.getByRole('combobox', { name: 'Add or edit a marker' }).click();
    await expect(page.getByRole('option', { name: 'Edit 0:08 Finale' })).toBeVisible();
    await page.waitForTimeout(300); // The overflow modifier checks for size changes every 100ms

    expect(await panel.boundingBox()).toEqual(before);
  });

  test('opens a dropdown above its input when there is no room below', async ({ page }) => {
    const panel = await openPanel(page);
    // The marker form's last field, near the bottom of the panel and so of the screen
    const tagsField = panel.locator('.form-group', { has: page.locator('label[for="tag_ids"]') });
    const input = tagsField.locator('.react-select__control');

    await input.click();

    const menu = tagsField.locator('.react-select__menu');
    await expect(menu.getByRole('option').first()).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    const inputBox = (await input.boundingBox())!;
    // Check the test still covers what it's meant to: the menu wouldn't have fit below the input
    expect(inputBox.y + inputBox.height + menuBox.height, 'menu would fit below').toBeGreaterThan(page.viewportSize()!.height);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(inputBox.y);
    await expect(menu).toBeInViewport({ ratio: 1 });
    await expectUsableOnScreen(menu.getByRole('option').first());
  });

  test("opens the marker form's primary tag dropdown where it can be seen and used", async ({ page }) => {
    const panel = await openPanel(page);
    const primaryTagField = panel.locator('.form-group', { has: page.locator('label[for="primary_tag_id"]') });

    await primaryTagField.locator('.react-select__control').click();

    // Its menu opens over the time fields below it
    await expectAllOptionsUsable(page);
    const option = page.getByRole('option', { name: 'Delta' });
    await option.click();
    await expect(primaryTagField).toContainText('Delta');
  });
});
