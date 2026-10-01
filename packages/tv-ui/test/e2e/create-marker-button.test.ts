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

/**
 * Assert every option of the open dropdown menu can be seen and clicked (see `expectUsableOnScreen`), scrolling the
 * menu's own list to each one first, as a long list scrolls. Only the list: scrolling anything else (e.g. with
 * `scrollIntoViewIfNeeded`) could bring a menu that's wrongly clipped by its surroundings into view.
 */
async function expectAllOptionsUsable(page: Page) {
  const options = page.getByRole('option');
  await expect(options.first()).toBeVisible();
  for (const option of await options.all()) {
    await option.evaluate((el) => {
      const list = el.closest('.react-select__menu-list');
      if (!list) return;
      const optionRect = el.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      // Rounded outwards: the browser rounds scrollTop, which could otherwise leave the option a fraction of a pixel short
      if (optionRect.top < listRect.top) list.scrollTop -= Math.ceil(listRect.top - optionRect.top);
      else if (optionRect.bottom > listRect.bottom) list.scrollTop += Math.ceil(optionRect.bottom - listRect.bottom);
    });
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
    await page.waitForTimeout(300); // Give anything that would resize or move the panel time to

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

  test("doesn't make the panel's contents wider than the panel", async ({ page }) => {
    const panel = await openPanel(page);

    const { scrollWidth, clientWidth } = await panel.locator('.contents').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test.describe("when the panel doesn't fit on screen", () => {
    // Too short for the marker form, so the panel is limited to the space available
    test.use({ viewport: { width: 1280, height: 420 } });

    test('scrolls its contents instead of letting them overflow', async ({ page }) => {
      const panel = await openPanel(page);
      const contents = panel.locator('.contents');

      await expect(panel).toBeInViewport({ ratio: 1 });
      const { scrollHeight, clientHeight } = await contents.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollHeight).toBeGreaterThan(clientHeight);
      const save = panel.getByRole('button', { name: 'Save' });
      await save.scrollIntoViewIfNeeded();
      await expectUsableOnScreen(save);
      // Inside the panel, not spilling out below it
      const panelBox = (await panel.boundingBox())!;
      const saveBox = (await save.boundingBox())!;
      expect(saveBox.y).toBeGreaterThanOrEqual(panelBox.y);
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
    });

    test("doesn't scroll the feed behind it when scrolling past the end of its contents", async ({ page }) => {
      const currentScene = () =>
        page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]').getAttribute('data-scene-id');
      const panel = await openPanel(page);
      const sceneBefore = await currentScene();
      const panelBox = (await panel.boundingBox())!;

      // Well past the end of the contents
      await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
      for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 100);
      await page.waitForTimeout(500);

      expect(await currentScene()).toBe(sceneBefore);
      await expect(panel).toBeInViewport({ ratio: 1 });
    });

    test("doesn't clip the add-or-edit dropdown's menu to the scrolling contents", async ({ page, request }) => {
      // Enough markers that the menu is taller than the visible part of the contents
      for (let seconds = 2; seconds <= 7; seconds++) {
        markerIds.push(await createMarker(request, `Extra ${seconds}`, seconds));
      }
      const panel = await openPanel(page);

      await panel.getByRole('combobox', { name: 'Add or edit a marker' }).click();

      await expectAllOptionsUsable(page);
      // Opening the menu mustn't scroll the page (and with it the panel) to make room for it
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0);
      await expect(panel).toBeInViewport({ ratio: 1 });
    });

    test("doesn't clip the marker form's own dropdown menus to the scrolling contents", async ({ page }) => {
      const panel = await openPanel(page);
      const primaryTagField = panel.locator('.form-group', { has: page.locator('label[for="primary_tag_id"]') });

      await primaryTagField.locator('.react-select__control').click();

      await expectAllOptionsUsable(page);
    });

    test('keeps an open menu against its input when the contents scroll', async ({ page }) => {
      const panel = await openPanel(page);
      const primaryTagField = panel.locator('.form-group', { has: page.locator('label[for="primary_tag_id"]') });
      const input = primaryTagField.locator('.react-select__control');
      await input.click();
      const menu = primaryTagField.locator('.react-select__menu');
      await expect(menu.getByRole('option').first()).toBeVisible();

      await panel.locator('.contents').evaluate((el) => { el.scrollTop += 30; });

      await expect(async () => {
        const menuBox = (await menu.boundingBox())!;
        const inputBox = (await input.boundingBox())!;
        // The menu's margin leaves a small gap, on whichever side of the input it opened
        const gapBelow = menuBox.y - (inputBox.y + inputBox.height);
        const gapAbove = inputBox.y - (menuBox.y + menuBox.height);
        expect(Math.min(Math.abs(gapBelow), Math.abs(gapAbove))).toBeLessThanOrEqual(10);
      }).toPass({ timeout: 2000 });
    });
  });

  // Popper only re-positions on scroll and window resize, so the panel must be re-positioned when it changes size
  test('keeps the panel on screen when its contents grow', async ({ page, request }) => {
    // Defaults matching the "Finale" marker, so the button opens the short list of matching markers first
    await setActionButtons(request, [{
      id: 'create-marker', type: 'button', buttonType: 'create-marker', iconId: 'bookmark', pinned: true,
      markerDefaults: { title: 'Finale', primaryTagId: 'tag-alpha', tagIds: [] },
    }]);
    await page.goto('/');
    const slide = page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
    await slide.getByRole('button', { name: 'Add/edit "Alpha" markers' }).click();
    const panel = page.locator('.action-button-side-panel');

    // Clicked without moving focus, as tapping a button on iOS doesn't: a focus change re-positions the panel anyway,
    // which would hide the bug
    await panel.getByRole('button', { name: 'Edit 0:08 Finale' }).evaluate((button: HTMLElement) => button.click());

    await expect(panel.locator('.action-button-create-marker')).toBeVisible();
    await page.waitForTimeout(500); // Longer than the panel's re-positioning after focus changes
    await expect(panel).toBeInViewport({ ratio: 1 });
  });

  // On iOS, closing the on-screen keyboard (e.g. by pressing on a label to close a dropdown) moves the panel back down
  // before the finger lifts, and the click then lands where the panel was: on the outside-click backdrop
  test("doesn't close the panel when a press starts inside it but its click lands outside", async ({ page }) => {
    const panel = await openPanel(page);

    await panel.locator('label[for="primary_tag_id"]').evaluate((label) => {
      label.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const backdrop = label.closest('.action-button-side-panel')?.previousElementSibling;
      if (!(backdrop instanceof HTMLElement)) throw new Error("Panel's outside-click backdrop not found");
      backdrop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      backdrop.click();
    });
    await page.waitForTimeout(500);

    await expect(panel.locator('.action-button-create-marker')).toBeVisible();
  });

  test('closes the panel when tapping outside it', async ({ page }) => {
    const panel = await openPanel(page);

    await page.mouse.click(20, 20);

    await expect(panel).toHaveCount(0);
  });

  test.describe('on a narrow screen', () => {
    // Narrower than Bootstrap's "sm" breakpoint, where each field's label goes on its own line above its input
    test.use({ viewport: { width: 400, height: 800 } });

    test("lines the marker form's inputs up with their labels", async ({ page }) => {
      const panel = await openPanel(page);

      for (const field of ['title', 'primary_tag_id', 'seconds']) {
        const group = panel.locator('.form-group', { has: page.locator(`label[for="${field}"]`) });
        const labelBox = (await group.locator('label').boundingBox())!;
        const inputBox = (await group.locator('.react-select__control, input#seconds').first().boundingBox())!;
        expect(Math.abs(inputBox.x - labelBox.x), `${field} input is indented from its label`).toBeLessThan(1);
      }
    });
  });

  test.describe('when the window is very short', () => {
    test.use({ viewport: { width: 1280, height: 250 } });

    // A realistic number of tags, so the tag dropdown's menu is as tall as react-select allows
    const extraTagIds: string[] = [];
    test.beforeEach(async ({ request }) => {
      for (let i = 1; i <= 15; i++) {
        const data = await graphql(request, 'mutation ($input: TagCreateInput!) { tagCreate(input: $input) { id } }', {
          input: { name: `Extra tag ${i}` },
        });
        extraTagIds.push(data.tagCreate.id);
      }
    });
    test.afterEach(async ({ request }) => {
      for (const id of extraTagIds.splice(0)) {
        await graphql(request, 'mutation ($input: TagDestroyInput!) { tagDestroy(input: $input) }', { input: { id } });
      }
    });

    // react-select scrolls whatever contains a dropdown to bring a newly opened menu into view, measuring the menu
    // before useFitDropdownMenus shortens or flips it. For a dropdown in a side panel that's the page, which is the
    // feed, so it would move to another video. Side panels turn that off.
    test("opening a dropdown in the panel doesn't scroll the page", async ({ page }) => {
      const panel = await openPanel(page);
      const currentScene = () =>
        page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]').getAttribute('data-scene-id');
      const sceneBefore = await currentScene();
      await page.evaluate(() => {
        const win = window as Window & { pageScrolled?: boolean };
        win.pageScrolled = false;
        window.addEventListener('scroll', () => { win.pageScrolled = true; });
      });

      const primaryTagField = panel.locator('.form-group', { has: page.locator('label[for="primary_tag_id"]') });
      // Wait for its options to load, so the menu opens at full size rather than as a short "Loading..." message
      await expect(primaryTagField.locator('.react-select__loading-indicator')).toHaveCount(0);
      await page.waitForTimeout(500); // and for the panel to finish animating into place
      const inputBox = (await primaryTagField.locator('.react-select__control').boundingBox())!;
      // A plain click where the input is, as a user would (no scrolling it into view first)
      await page.mouse.click(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2);
      await expect(primaryTagField.getByRole('option').first()).toBeVisible();
      await page.waitForTimeout(500); // react-select may animate its scroll

      expect(await page.evaluate(() => (window as Window & { pageScrolled?: boolean }).pageScrolled)).toBe(false);
      expect(await currentScene()).toBe(sceneBefore);
      await expectAllOptionsUsable(page);
    });
  });
});
