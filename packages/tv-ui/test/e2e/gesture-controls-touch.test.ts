import { setTvConfig } from './helpers/stash';
import {
  areaPoint,
  bootFeed,
  expectCurrentSlide,
  expectFeedback,
  expectFeedbackGone,
  feedbackShownDuring,
  seekCurrentVideo,
  speedDrag,
  tap,
  touchPointer,
  videoState,
  videoWidth,
  type Pointer,
} from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentIndex, currentSlide, slideAt } from './helpers/feed';

/**
 * E2E: gestures with a finger on a touch screen, where a quick swipe scrolls the feed instead, and on iOS, where they're
 * picked up by an element over the video rather than the video itself.
 *
 * @see docs/video-player.md § "Gestures"
 */

const iPhoneUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const devices = [
  { name: 'a touch screen', use: { hasTouch: true, viewport: { width: 400, height: 700 } } },
  { name: 'an iPhone', use: { hasTouch: true, isMobile: true, viewport: { width: 400, height: 700 }, userAgent: iPhoneUserAgent } },
];

for (const device of devices) {
  test.describe(`Gestures on ${device.name}`, () => {
    test.use(device.use);

    let pointer: Pointer;

    test.beforeEach(async ({ page, request }) => {
      await bootFeed(page, request);
      pointer = touchPointer(page);
      await seekCurrentVideo(page, 2);
    });
    test.afterEach(async ({ request }) => setTvConfig(request, null));

    test('tapping the middle pauses the video, without any feedback', async ({ page }) => {
      expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'middle')))).toEqual([]);

      expect((await videoState(currentSlide(page))).paused).toBe(true);
    });

    test('tapping the right skips forwards', async ({ page }) => {
      const before = (await videoState(currentSlide(page))).currentTime;

      expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'right')))).toEqual([]);

      expect((await videoState(currentSlide(page))).currentTime - before).toBeGreaterThan(3.5);
    });

    test('holding the right plays at 1.5x until released', async ({ page }) => {
      await pointer.down(await areaPoint(page, 'right'));
      await expectFeedback(page, '1.5x', 'play');
      expect((await videoState(currentSlide(page))).playbackRate).toBe(1.5);

      await pointer.up();
      await expectFeedbackGone(page);
      expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
    });

    test('dragging a hold changes its speed, without scrolling the feed', async ({ page }) => {
      await seekCurrentVideo(page, 6);
      const start = await areaPoint(page, 'right');
      const dragBy = speedDrag(pointer, start, await videoWidth(page));
      await pointer.down(start);
      await expectFeedback(page, '1.5x', 'play');

      await dragBy(-3.5);
      await expectFeedback(page, '2s', 'backward');
      await pointer.moveTo({ x: start.x, y: start.y - 300 });

      await pointer.up();
      await expectFeedbackGone(page);
      expect(await currentIndex(page)).toBe(0);
      expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
    });

    test('a quick swipe up scrolls to the next slide, without tapping or seeking', async ({ page }) => {
      const middle = await areaPoint(page, 'middle');
      const start = { x: middle.x, y: middle.y + 150 };

      const feedback = await feedbackShownDuring(page, async () => {
        await pointer.down(start);
        await pointer.moveTo({ x: start.x, y: start.y - 400 });
        await pointer.up();
        await expectCurrentSlide(page, 1);
      });

      expect(feedback).toEqual([]);
      // A tap would have played it again
      expect((await videoState(slideAt(page, 0))).paused).toBe(true);
      expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });

      // ...and gestures work on the next slide
      await pointer.down(await areaPoint(page, 'right'));
      await expectFeedback(page, '1.5x', 'play');
      await pointer.up();
      await expectFeedbackGone(page);
    });
  });
}
