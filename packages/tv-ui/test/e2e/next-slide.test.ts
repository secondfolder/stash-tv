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
