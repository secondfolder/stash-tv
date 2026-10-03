import { test, expect, type Locator, type Page } from '@playwright/test';
import { setTvConfig } from './helpers/stash';

/**
 * E2E tests: reordering channels in the Settings tab, which needs pointer events and layout.
 *
 * @see docs/channels.md § "Settings UI"
 */

/** Where the element is once it's stopped moving (e.g. the settings panel sliding in) */
async function settledBox(locator: Locator) {
  let previous = await locator.boundingBox();
  for (;;) {
    await locator.page().waitForTimeout(100);
    const box = await locator.boundingBox();
    if (box && previous && box.x === previous.x && box.y === previous.y) return box;
    previous = box;
  }
}

function currentSlide(page: Page) {
  return page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
}

/** The channels listed in the Settings tab, as their names */
function listedChannels(page: Page) {
  return page.locator('.ChannelSettings .channel .channel-name');
}

test.afterEach(async ({ request }) => {
  await setTvConfig(request, null);
});

test("keeps the temporary channel last when a channel's dragged below it", async ({ page, request }) => {
  await setTvConfig(request, {
    channels: [
      { id: 'all-scenes', sources: [{ type: 'all', entityType: 'scene', randomise: false }] },
      { id: 'all-markers', sources: [{ type: 'all', entityType: 'marker', randomise: false }] },
    ],
    lastViewedChannelId: 'all-scenes',
  });
  await page.goto('/');
  // The temporary channel, from the first scene's tag's popover
  await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
  await currentSlide(page).getByTestId('MediaSlide--sceneInfo').getByRole('link', { name: 'Beta' }).click();
  await page.getByRole('dialog', { name: 'Beta' }).getByRole('button', { name: 'Show scenes with this tag' }).click();
  await currentSlide(page).getByRole('button', { name: 'Settings' }).click();
  await expect(listedChannels(page)).toHaveText(['All scenes', 'All markers', 'Beta']);

  const handle = page.locator('.ChannelSettings .channel').filter({ hasText: 'All scenes' }).locator('.drag-handle svg');
  const handleBox = await settledBox(handle);
  const temporaryBox = await page.locator('.ChannelSettings .channel.temporary').boundingBox();
  if (!handleBox || !temporaryBox) throw new Error('Channels not shown');
  const x = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const endY = temporaryBox.y + temporaryBox.height / 2;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(x, startY + (endY - startY) * step / 20);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();

  await expect(listedChannels(page)).toHaveText(['All markers', 'All scenes', 'Beta']);
});
