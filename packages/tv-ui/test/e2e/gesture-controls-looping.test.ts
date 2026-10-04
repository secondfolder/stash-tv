import { setTvConfig } from './helpers/stash';
import {
  areaPoint,
  bootFeed,
  changeSlideWithKeyboard,
  expectFeedback,
  expectFeedbackGone,
  feedbackShownDuring,
  mousePointer,
  seekCurrentVideo,
  speedDrag,
  tap,
  videoState,
  videoWidth,
  type Pointer,
} from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentIndex, currentSlide } from './helpers/feed';

/**
 * E2E: on a looping video gestures never move the feed on: seeking past either end of the loop stops there (saying so)
 * or loops round, and skipping past the end goes back to the start.
 *
 * @see docs/video-player.md § "Gestures"
 */

let pointer: Pointer;

test.beforeEach(async ({ page, request }) => {
  await bootFeed(page, request, { looping: true });
  pointer = mousePointer(page);
});
test.afterEach(async ({ request }) => setTvConfig(request, null));

test.describe('Gestures on a looping video', () => {
  test('holding at 1.5x past the end loops round to the start', async ({ page }) => {
    await seekCurrentVideo(page, -1.5);
    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');

    await expect.poll(async () => (await videoState(currentSlide(page))).currentTime).toBeLessThan(2);
    expect(await currentIndex(page)).toBe(0);
    await expectFeedback(page, '1.5x', 'play');
    expect((await videoState(currentSlide(page))).playbackRate).toBe(1.5);

    await pointer.up();
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });

  test('skipping forwards stops at the end of the loop, saying so', async ({ page }) => {
    await seekCurrentVideo(page, -4);
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');
    await speedDrag(pointer, start, await videoWidth(page))(3.7);

    await expectFeedback(page, 'End of loop reached', null);
    const held = await videoState(currentSlide(page));
    expect(held.currentTime).toBeGreaterThan(11);
    expect(held.paused).toBe(true);
    await page.waitForTimeout(500);
    expect(await currentIndex(page)).toBe(0);

    await pointer.up();
    await expectFeedbackGone(page);
    expect(await currentIndex(page)).toBe(0);
    expect((await videoState(currentSlide(page))).paused).toBe(false);
  });

  test('rewinding stops at the start of the loop, saying so', async ({ page }) => {
    await seekCurrentVideo(page, 3);
    const start = await areaPoint(page, 'left');
    const width = await videoWidth(page);
    await pointer.down(start);
    await expectFeedback(page, '1s', 'backward');
    await speedDrag(pointer, start, width)(-3.6);

    await expectFeedback(page, 'Start of loop reached', null);
    expect((await videoState(currentSlide(page))).currentTime).toBeLessThan(0.5);

    // Still there at another speed
    expect(await feedbackShownDuring(page, () => speedDrag(pointer, start, width)(-2.5))).toEqual([]);
    await expectFeedback(page, 'Start of loop reached', null);

    await pointer.up();
    await expectFeedbackGone(page);
    expect(await currentIndex(page)).toBe(0);
    expect((await videoState(currentSlide(page))).paused).toBe(false);
  });

  test('a slower seek starts again from the end of the loop', async ({ page }) => {
    await seekCurrentVideo(page, -4);
    const start = await areaPoint(page, 'right');
    const dragBy = speedDrag(pointer, start, await videoWidth(page));
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');
    await dragBy(3.7);
    await expectFeedback(page, 'End of loop reached', null);

    // Straight there: on the way it would pass through speeds that play the video, which would loop it to the start
    await dragBy(-3.5, { steps: 1 });
    await expectFeedback(page, '2s', 'backward');
    await expect.poll(async () => (await videoState(currentSlide(page))).currentTime).toBeLessThan(11);

    await pointer.up();
    await expectFeedbackGone(page);
  });

  test('tapping the right near the end goes back to the start', async ({ page }) => {
    await seekCurrentVideo(page, -3);

    expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'right')))).toEqual([]);

    expect(await currentIndex(page)).toBe(0);
    expect((await videoState(currentSlide(page))).currentTime).toBeLessThan(1);
  });

  test('tapping the left near the start goes back to the start, not the slide before', async ({ page }) => {
    await changeSlideWithKeyboard(page, 'next');
    await seekCurrentVideo(page, 1);

    expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'left')))).toEqual([]);

    expect(await currentIndex(page)).toBe(1);
    expect((await videoState(currentSlide(page))).currentTime).toBeLessThan(0.8);
  });
});

test.describe('Seeking with the keyboard on a looping video', () => {
  test('shows each new speed at the end of the loop before saying it has been reached', async ({ page }) => {
    await page.keyboard.down('ArrowRight');
    await expectFeedback(page, '2x', 'play');
    for (const text of ['3x', '4x']) {
      await page.keyboard.press('ArrowUp');
      await expectFeedback(page, text, 'play');
    }
    await page.keyboard.press('ArrowUp');
    await expectFeedback(page, 'End of loop reached', null);

    for (const text of ['10s', '15s', '30s', '45s', '1m', '2m', '4m', '5m']) {
      const shown = await feedbackShownDuring(page, () => page.keyboard.press('ArrowUp'), { settle: 300 });
      expect(shown).toEqual([{ text, icon: 'forward' }, { text: 'End of loop reached', icon: null }]);
    }
    expect(await currentIndex(page)).toBe(0);

    await page.keyboard.up('ArrowRight');
    await expectFeedbackGone(page);
  });
});

test.describe('Gestures on a looping preview', () => {
  test.beforeEach(async ({ page, request }) => {
    await bootFeed(page, request, { looping: true, scenePreviewOnly: true });
  });

  test('skipping forwards stops at the end of the preview, saying so', async ({ page }) => {
    await page.keyboard.down('ArrowRight');
    await expectFeedback(page, '2x', 'play');
    for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowUp');

    await expectFeedback(page, 'End of loop reached', null);
    await page.waitForTimeout(500);
    expect((await videoState(currentSlide(page))).currentTime).toBeGreaterThan(1.8);
    expect(await currentIndex(page)).toBe(0);

    await page.keyboard.up('ArrowRight');
    await expectFeedbackGone(page);
  });
});
