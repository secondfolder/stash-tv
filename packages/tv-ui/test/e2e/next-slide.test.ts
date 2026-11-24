import { type Page } from '@playwright/test';
import { setTvConfig } from './helpers/stash';
import { bootFeed } from './helpers/gestures';
import { expect, test } from './helpers/test';
import { slideAt } from './helpers/feed';

/**
 * E2E: the next slide's video shows the frame it has loaded before it plays, so the black behind it doesn't flash up
 * between the two videos when moving to it.
 *
 * @see docs/video-player.md § "Moving to the next or previous slide"
 */

test.afterEach(async ({ request }) => setTvConfig(request, null));

test("shows the next slide's video, loaded before it's played", async ({ page, request }) => {
  await bootFeed(page, request);
  const nextVideo = slideAt(page, 1).locator('video').first();
  await expect.poll(() => nextVideo.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => nextVideo.evaluate((video) => getComputedStyle(video).opacity)).toBe('1');
});

/** @see docs/video-player.md § "Moving to the next or previous slide" */
test.describe('Dimming of the slides either side', () => {
  /** The current slide's brightness, from the moment it becomes current */
  const brightnessOnceCurrent = (page: Page, index: number) => slideAt(page, index).evaluate((slide) => new Promise<string>((resolve) => {
    const check = () => slide.getAttribute('data-current-video') === 'true' ? resolve(getComputedStyle(slide).filter) : requestAnimationFrame(check);
    check();
  }));

  test.beforeEach(async ({ page, request }) => bootFeed(page, request));

  test('goes straight away on a slide jumped to with a shortcut', async ({ page }) => {
    const brightness = brightnessOnceCurrent(page, 1);
    await page.keyboard.press('ArrowDown');
    expect(await brightness).toBe('none');
  });

  test('fades out on a slide scrolled to', async ({ page }) => {
    const brightness = brightnessOnceCurrent(page, 1);
    await page.mouse.move(250, 400);
    await page.mouse.wheel(0, (page.viewportSize()?.height ?? 0) * 0.8);
    expect(await brightness).toMatch(/^brightness\(0\.\d+\)$/);
  });
});
