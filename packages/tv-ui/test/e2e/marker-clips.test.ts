import { type Page } from '@playwright/test';
import { setTvConfig } from './helpers/stash';
import { bootFeed, changeSlideWithKeyboard, waitForPlayback } from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentSlide } from './helpers/feed';

/**
 * E2E: a marker plays just its clip of the scene, never the scene from its beginning (issue #1).
 *
 * @see docs/video-player.md § "Marker clips"
 */

const markersChannel = {
  channels: [{ id: 'all-markers', sources: [{ type: 'all', entityType: 'marker', randomise: false }] }],
  lastViewedChannelId: 'all-markers',
};

/**
 * Record, from before the app loads, the time in the scene's video (the `<video>` element's own, not the offset
 * plugin's) of every slide's video whenever it shows a frame or plays on.
 */
async function recordVideoTimes(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { videoTimes: Record<string, number[]> };
    record.videoTimes = {};
    for (const event of ['loadeddata', 'playing', 'timeupdate', 'seeked']) {
      document.addEventListener(event, ({ target }) => {
        if (!(target instanceof HTMLVideoElement) || !target.currentSrc) return;
        const slide = target.closest('[data-index]')?.getAttribute('data-index') ?? 'unknown';
        (record.videoTimes[slide] ??= []).push(target.currentTime);
      }, true);
    }
  });
}

const videoTimes = (page: Page, slide: number) =>
  page.evaluate((slide) => (window as unknown as { videoTimes: Record<string, number[]> }).videoTimes[slide] ?? [], slide);

/** Where the current slide's clip starts in its scene, from the offset plugin */
const clipStart = (page: Page) => currentSlide(page).locator('video-js, .video-js').first().evaluate((element) => {
  const { videojs } = window as unknown as { videojs: { getPlayer(element: Element): { startOffset(): number } } };
  return videojs.getPlayer(element).startOffset();
});

test.afterEach(async ({ request }) => setTvConfig(request, null));

test.describe('Marker clips', () => {
  test.beforeEach(async ({ page, request }) => {
    await recordVideoTimes(page);
    await bootFeed(page, request, markersChannel);
  });

  test('play from the start of the clip, never showing the scene before it', async ({ page }) => {
    const start = await clipStart(page);
    expect(start).toBeGreaterThan(0);
    await expect.poll(async () => (await videoTimes(page, 0)).length).toBeGreaterThan(3);

    const times = await videoTimes(page, 0);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(start);
  });

  test('play the next marker, loaded while off screen, from the start of its clip too', async ({ page }) => {
    await changeSlideWithKeyboard(page, 'next');
    await waitForPlayback(page);
    const start = await clipStart(page);
    expect(start).toBeGreaterThan(0);
    await expect.poll(async () => (await videoTimes(page, 1)).length).toBeGreaterThan(3);

    const times = await videoTimes(page, 1);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(start);
  });

  /** @see docs/video-player.md § "Hiding the frames shown while loading" */
  test('show the video once it plays, and again once it plays after being unloaded', async ({ page }) => {
    const videoOpacity = () => currentSlide(page).locator('video').first().evaluate((video) => getComputedStyle(video).opacity);
    await waitForPlayback(page);
    await expect.poll(videoOpacity).toBe('1');

    await changeSlideWithKeyboard(page, 'next');
    // Wait for the first slide's video to be unloaded, as its slide is no longer current
    await expect(page.locator('[data-index="0"] video').first()).not.toHaveAttribute('src', /./);
    await changeSlideWithKeyboard(page, 'previous');
    await waitForPlayback(page);
    await expect.poll(videoOpacity).toBe('1');
  });

  test("don't show their scene's markers on the progress bar", async ({ page }) => {
    // Let Stash's ScenePlayer add the scene's markers, as it does once the video's metadata has loaded
    await page.waitForTimeout(500);
    await expect(currentSlide(page).locator('.vjs-marker, .vjs-marker-range')).toHaveCount(0);
  });
});
