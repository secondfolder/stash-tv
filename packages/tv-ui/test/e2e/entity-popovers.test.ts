import { type Locator, type Page } from '@playwright/test';
import { test, expect } from './helpers/test';
import { setTvConfig } from './helpers/stash';
import { box, currentSlide, infoPanel } from './helpers/feed';

/**
 * E2E tests: where an entity's popover opens (above or below what opened it), and how it's laid out, depend on layout,
 * so they're only testable here. What its buttons do is covered by the integration tests.
 *
 * @see docs/entity-popovers.md § "Placement"
 * @see docs/entity-popovers.md § "Cards"
 */

/** Open the info panel, and from it the popover of the first slide's tag ("Beta") */
async function openTagPopover(page: Page) {
  await page.goto('/');
  await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
  await expect(infoPanel(page)).toHaveClass(/active/);
  const tag = infoPanel(page).getByRole('link', { name: 'Beta' });
  await tag.click();
  const popover = page.getByRole('dialog', { name: 'Beta' });
  await expect(popover.getByRole('heading', { name: 'Beta' })).toBeVisible();
  return { tag, popover };
}

/** Where the top and bottom of the element are */
async function verticalEdges(locator: Locator) {
  const { y, height } = await box(locator);
  return { top: y, bottom: y + height };
}

test.afterEach(async ({ request }) => {
  await setTvConfig(request, null);
});

test('opens above a tag with room above it, its buttons below its card', async ({ page, request }) => {
  await setTvConfig(request, { sceneInfoLayout: [['title'], ['tags']] });
  const { tag, popover } = await openTagPopover(page);

  const card = popover.getByRole('heading', { name: 'Beta' });
  const buttons = popover.getByRole('button', { name: 'Show scenes with this tag' });
  // Within a pixel, as positions are rounded
  expect((await verticalEdges(popover)).bottom).toBeLessThanOrEqual((await verticalEdges(tag)).top + 1);
  expect((await verticalEdges(buttons)).top).toBeGreaterThan((await verticalEdges(card)).bottom);
});

test('opens below a tag without room above it, its buttons above its card', async ({ page, request }) => {
  // The tags at the top of a panel reaching almost to the top of the screen
  await page.setViewportSize({ width: 900, height: 420 });
  await setTvConfig(request, {
    sceneInfoLayout: [
      ['tags'], ['title'], ['date'], ['details'], ['performers'], ['rating'], ['o-count'], ['play-count'], ['duration'],
      ['resolution'], ['frame-rate'], ['path'],
    ],
  });
  const { tag, popover } = await openTagPopover(page);

  const card = popover.getByRole('heading', { name: 'Beta' });
  const buttons = popover.getByRole('button', { name: 'Show scenes with this tag' });
  expect((await verticalEdges(popover)).top).toBeGreaterThanOrEqual((await verticalEdges(tag)).bottom - 1);
  expect((await verticalEdges(buttons)).bottom).toBeLessThan((await verticalEdges(card)).top);
});

test("shows a tag's card without Stash's stand-in image for a tag with none of its own", async ({ page, request }) => {
  // The fixtures' tags have no images of their own
  await setTvConfig(request, { sceneInfoLayout: [['title'], ['tags']] });
  const { popover } = await openTagPopover(page);

  await expect(popover.getByRole('img', { name: 'Beta' })).toBeHidden();
  // Its favourite button, shown over the image, stays (Stash gives it no accessible name)
  await expect(popover.locator('.favorite-button')).toBeVisible();
});
