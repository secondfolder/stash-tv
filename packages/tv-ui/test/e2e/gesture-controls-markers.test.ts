import { setTvConfig } from './helpers/stash';
import {
  areaPoint,
  bootFeed,
  expectFeedback,
  expectFeedbackGone,
  mousePointer,
  videoState,
  type Pointer,
} from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentIndex, currentSlide } from './helpers/feed';

/**
 * E2E: gestures on markers, which play a clip of their scene (the offset plugin), have no end timestamp of their own,
 * no thumbnail preview, and are looped by their own `ended` handler.
 *
 * @see docs/video-player.md § "Gestures"
 */

const markersChannel = {
  channels: [{ id: 'all-markers', sources: [{ type: 'all', entityType: 'marker', randomise: false }] }],
  lastViewedChannelId: 'all-markers',
};

let pointer: Pointer;

test.afterEach(async ({ request }) => setTvConfig(request, null));

test.describe('Gestures on a marker', () => {
  test.beforeEach(async ({ page, request }) => {
    await bootFeed(page, request, markersChannel);
    pointer = mousePointer(page);
  });

  test('holding the right plays at 1.5x until released', async ({ page }) => {
    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');
    expect((await videoState(currentSlide(page))).playbackRate).toBe(1.5);

    await pointer.up();
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });

  test('rewinding fast with the keyboard shows no thumbnail preview, as markers have none', async ({ page }) => {
    await page.keyboard.down('ArrowLeft');
    await expectFeedback(page, '2s', 'backward');
    await page.keyboard.press('ArrowDown');
    await expectFeedback(page, '3s', 'backward');
    await page.waitForTimeout(300);
    expect(await currentSlide(page).locator('.vjs-vtt-thumbnail-display').count()).toBe(0);

    await page.keyboard.up('ArrowLeft');
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });
});

test.describe('Gestures on a looping marker', () => {
  test.beforeEach(async ({ page, request }) => {
    await bootFeed(page, request, { ...markersChannel, looping: true });
    pointer = mousePointer(page);
  });

  test('holding at 1.5x through the end of its clip loops round, still holding', async ({ page }) => {
    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');

    // The first marker's clip is the last 4s of its scene: at 1.5x it loops within 3s
    const start = (await videoState(currentSlide(page))).currentTime;
    await expect.poll(async () => (await videoState(currentSlide(page))).currentTime, { timeout: 8000 }).toBeLessThan(start);
    expect(await currentIndex(page)).toBe(0);
    await expectFeedback(page, '1.5x', 'play');
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1.5 });

    await pointer.up();
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });
});
