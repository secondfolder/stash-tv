import { type Page } from '@playwright/test';
import { setTvConfig } from './helpers/stash';
import {
  areaPoint,
  bootFeed,
  changeSlideWithKeyboard,
  expectCurrentSlide,
  expectFeedback,
  expectFeedbackGone,
  feedbackShownDuring,
  mousePointer,
  seekCurrentVideo,
  speedDrag,
  timeMovedOver,
  videoState,
  videoWidth,
  type Point,
  type Pointer,
} from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentIndex, currentSlide, slideAt } from './helpers/feed';

/**
 * E2E: a gesture ends when its slide stops being the current one while it's still held, whether the video ended, a
 * keyboard shortcut moved the feed on or the feed was scrolled. Nothing of it is left behind: no feedback, no seeking
 * on the old slide, and no change to how the new slide plays.
 *
 * @see docs/video-player.md § "Gestures"
 */

test.afterEach(async ({ request }) => setTvConfig(request, null));

let pointer: Pointer;

/**
 * Check a gesture held from `start` on slide `from` ended when the feed moved on to slide `to`, then let go of it and
 * check a new gesture works on the new slide.
 */
async function expectGestureEndedBySlideChange(page: Page, { from, to, start }: { from: number; to: number; start: Point }) {
  await expectCurrentSlide(page, to);
  await expectFeedbackGone(page, { for: 300 });
  const oldSlide = await videoState(slideAt(page, from));
  expect(oldSlide.paused, 'the old slide is paused').toBe(true);
  expect(oldSlide.playbackRate).toBe(1);
  expect(await timeMovedOver(page, 300, slideAt(page, from)), "the old slide's video isn't seeking").toBe(0);
  expect((await videoState(currentSlide(page))).playbackRate).toBe(1);

  // The pointer is still down: dragging it about and letting go does nothing more
  const dragBy = speedDrag(pointer, start, await videoWidth(page));
  const feedback = await feedbackShownDuring(page, async () => {
    await dragBy(2.5);
    await dragBy(-2.5);
    await pointer.up();
  });
  expect(feedback).toEqual([]);
  expect((await videoState(slideAt(page, from))).paused).toBe(true);
  const newSlide = await videoState(currentSlide(page));
  expect(newSlide).toMatchObject({ paused: false, playbackRate: 1 });
  expect(await currentIndex(page)).toBe(to);

  // ...and a new gesture works on the new slide
  await pointer.down(await areaPoint(page, 'right'));
  await expectFeedback(page, '1.5x', 'play');
  expect((await videoState(currentSlide(page))).playbackRate).toBe(1.5);
  await pointer.up();
  await expectFeedbackGone(page);
  expect((await videoState(currentSlide(page))).playbackRate).toBe(1);
}

test.describe('A gesture held while its slide stops being current', () => {
  test.beforeEach(async ({ page, request }) => {
    await bootFeed(page, request);
    pointer = mousePointer(page);
  });

  test('ends when the video plays to its end at 1.5x', async ({ page }) => {
    await seekCurrentVideo(page, -2);
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');

    await expectGestureEndedBySlideChange(page, { from: 0, to: 1, start });
  });

  test('ends when skipping forwards reaches the end of the video', async ({ page }) => {
    await seekCurrentVideo(page, -4);
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');
    await speedDrag(pointer, start, await videoWidth(page))(3.7);
    await expectFeedback(page, '5s', 'forward');

    await expectGestureEndedBySlideChange(page, { from: 0, to: 1, start });
  });

  test('ends when the next slide shortcut is pressed', async ({ page }) => {
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');

    await page.keyboard.press('ArrowDown');

    await expectGestureEndedBySlideChange(page, { from: 0, to: 1, start });
  });

  test('ends when the previous slide shortcut is pressed', async ({ page }) => {
    await changeSlideWithKeyboard(page, 'next');
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');

    await page.keyboard.press('ArrowUp');

    await expectGestureEndedBySlideChange(page, { from: 1, to: 0, start });
  });

  test('ends when the feed is scrolled', async ({ page }) => {
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');

    await page.mouse.wheel(0, 720);

    await expectGestureEndedBySlideChange(page, { from: 0, to: 1, start });
  });

  test('ends while rewinding, leaving the old slide where it got to', async ({ page }) => {
    await seekCurrentVideo(page, 6);
    const start = await areaPoint(page, 'left');
    await pointer.down(start);
    await expectFeedback(page, '1s', 'backward');

    await page.keyboard.press('ArrowDown');

    await expectGestureEndedBySlideChange(page, { from: 0, to: 1, start });
  });

  test('ends while paused by a hold, playing the new slide', async ({ page }) => {
    const start = await areaPoint(page, 'middle');
    await pointer.down(start);
    await expectFeedback(page, '', 'pause');

    await page.keyboard.press('ArrowDown');

    await expectGestureEndedBySlideChange(page, { from: 0, to: 1, start });
  });

  test("doesn't stop gestures working on the old slide when it's current again", async ({ page }) => {
    const start = await areaPoint(page, 'right');
    await pointer.down(start);
    await expectFeedback(page, '1.5x', 'play');
    await page.keyboard.press('ArrowDown');
    await expectCurrentSlide(page, 1);
    await pointer.up();

    await changeSlideWithKeyboard(page, 'previous');
    await pointer.down(await areaPoint(page, 'left'));
    await expectFeedback(page, '1s', 'backward');
    await pointer.up();
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });
});

test.describe('A gesture held past where a clip of the video ends', () => {
  test.beforeEach(async ({ page, request }) => {
    await bootFeed(page, request, { endPosition: 'fixed-length', playLength: 4 });
    pointer = mousePointer(page);
  });

  test('keeps playing until released, then the feed moves on', async ({ page }) => {
    await seekCurrentVideo(page, 2);
    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');

    await expect.poll(async () => (await videoState(currentSlide(page))).currentTime).toBeGreaterThan(5);
    expect(await currentIndex(page)).toBe(0);

    await pointer.up();
    await expectFeedbackGone(page, { for: 0 });
    await expectCurrentSlide(page, 1);
  });
});
