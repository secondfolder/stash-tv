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
  pauseCurrentVideo,
  playbackRates,
  seekCurrentVideo,
  speedDrag,
  tap,
  thumbnailShowing,
  timeMovedOver,
  videoState,
  videoWidth,
  type Pointer,
} from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentIndex, currentSlide, slideAt } from './helpers/feed';

/**
 * E2E: tapping, holding and dragging on a slide's video to play/pause, skip and seek, with the feedback overlay
 * showing the seek speed only while a hold lasts. Each is checked on the first slide and on slides reached later, as
 * every slide has its own gesture handling.
 *
 * @see docs/video-player.md § "Gestures"
 */

test.afterEach(async ({ request }) => setTvConfig(request, null));

const startingSlides = [
  { name: 'the first slide', reach: async () => {} },
  {
    name: 'a slide moved to with the keyboard',
    reach: async (page: Page) => {
      await changeSlideWithKeyboard(page, 'next');
      await changeSlideWithKeyboard(page, 'next');
    },
  },
  {
    name: 'a slide the feed moved to when the last video ended',
    reach: async (page: Page) => {
      const index = await currentIndex(page);
      await seekCurrentVideo(page, -0.3);
      await expectCurrentSlide(page, index + 1);
    },
  },
];

for (const start of startingSlides) {
  test.describe(`Gestures on ${start.name}`, () => {
    let pointer: Pointer;

    test.beforeEach(async ({ page, request }) => {
      await bootFeed(page, request);
      await start.reach(page);
      pointer = mousePointer(page);
      await seekCurrentVideo(page, 2);
    });

    test.describe('tapping', () => {
      test('the middle pauses the video, and again plays it, without any feedback', async ({ page }) => {
        const middle = await areaPoint(page, 'middle');

        expect(await feedbackShownDuring(page, () => tap(pointer, middle))).toEqual([]);
        expect((await videoState(currentSlide(page))).paused).toBe(true);
        expect(await timeMovedOver(page, 300)).toBe(0);

        expect(await feedbackShownDuring(page, () => tap(pointer, middle))).toEqual([]);
        expect((await videoState(currentSlide(page))).paused).toBe(false);
      });

      // A third of these short videos, or less to land on a marker if there's one just past that
      test('the right skips forwards', async ({ page }) => {
        const before = (await videoState(currentSlide(page))).currentTime;

        expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'right')))).toEqual([]);

        const after = await videoState(currentSlide(page));
        expect(after.currentTime - before).toBeGreaterThan(3.5);
        expect(after.currentTime - before).toBeLessThan(6);
        expect(after.paused).toBe(false);
      });

      test('the right near the end moves on to the next slide', async ({ page }) => {
        const index = await currentIndex(page);
        await seekCurrentVideo(page, -3);

        expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'right')))).toEqual([]);

        await expectCurrentSlide(page, index + 1);
      });

      test('the left skips backwards', async ({ page }) => {
        await seekCurrentVideo(page, 9);

        expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'left')))).toEqual([]);

        const after = await videoState(currentSlide(page));
        expect(after.currentTime).toBeGreaterThan(4.5);
        expect(after.currentTime).toBeLessThan(7.6);
        expect(after.paused).toBe(false);
      });

      test('the left less than a skip from the start goes back to the start', async ({ page }) => {
        const index = await currentIndex(page);
        await seekCurrentVideo(page, 3);

        expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'left')))).toEqual([]);

        expect(await currentIndex(page)).toBe(index);
        expect((await videoState(currentSlide(page))).currentTime).toBeLessThan(0.8);
      });
    });

    test.describe('holding', () => {
      test('the right plays at 1.5x until released', async ({ page }) => {
        await pointer.down(await areaPoint(page, 'right'));
        await expectFeedback(page, '1.5x', 'play');

        const held = await videoState(currentSlide(page));
        expect(held.playbackRate).toBe(1.5);
        expect(held.paused).toBe(false);
        expect(await timeMovedOver(page, 1000)).toBeGreaterThan(1.2);

        const beforeRelease = (await videoState(currentSlide(page))).currentTime;
        await pointer.up();
        await expectFeedbackGone(page);

        const released = await videoState(currentSlide(page));
        expect(released.playbackRate).toBe(1);
        expect(released.paused).toBe(false);
        // Letting go isn't a tap: it doesn't skip
        expect(released.currentTime - beforeRelease).toBeLessThan(1.5);
      });

      test('the left rewinds until released', async ({ page }) => {
        await seekCurrentVideo(page, 6);
        await pointer.down(await areaPoint(page, 'left'));
        await expectFeedback(page, '1s', 'backward');

        expect((await videoState(currentSlide(page))).paused).toBe(true);
        const moved = await timeMovedOver(page, 1000);
        expect(moved).toBeLessThan(-0.6);
        expect(moved).toBeGreaterThan(-1.5);

        const beforeRelease = (await videoState(currentSlide(page))).currentTime;
        await pointer.up();
        await expectFeedbackGone(page);

        const released = await videoState(currentSlide(page));
        expect(released.paused).toBe(false);
        expect(released.playbackRate).toBe(1);
        expect(Math.abs(released.currentTime - beforeRelease)).toBeLessThan(1.5);
      });

      test('the middle pauses until released', async ({ page }) => {
        await pointer.down(await areaPoint(page, 'middle'));
        await expectFeedback(page, '', 'pause');

        expect((await videoState(currentSlide(page))).paused).toBe(true);
        expect(await timeMovedOver(page, 500)).toBe(0);

        await pointer.up();
        await expectFeedbackGone(page);
        expect((await videoState(currentSlide(page))).paused).toBe(false);
      });
    });

    test.describe('dragging while holding', () => {
      test('right from the right speeds up, switching to skipping through the video past 4x', async ({ page }) => {
        const start = await areaPoint(page, 'right');
        const dragBy = speedDrag(pointer, start, await videoWidth(page));
        await pointer.down(start);
        await expectFeedback(page, '1.5x', 'play');

        for (const [change, speed] of [[0.5, 2], [1.5, 3], [2.5, 4]]) {
          await dragBy(change);
          await expectFeedback(page, `${speed}x`, 'play');
          expect((await videoState(currentSlide(page))).playbackRate).toBe(speed);
        }

        await dragBy(3.7);
        await expectFeedback(page, '5s', 'forward');
        const skipping = await videoState(currentSlide(page));
        expect(skipping.paused).toBe(true);
        expect(skipping.playbackRate).toBe(1);
        expect(await timeMovedOver(page, 500)).toBeGreaterThan(1.5);

        await pointer.up();
        await expectFeedbackGone(page);
        const released = await videoState(currentSlide(page));
        expect(released.paused).toBe(false);
        expect(released.playbackRate).toBe(1);
      });

      test('a drag made before the hold registers counts towards its speed', async ({ page }) => {
        const start = await areaPoint(page, 'right');
        await pointer.down(start);
        await speedDrag(pointer, start, await videoWidth(page))(1.5);

        await expectFeedback(page, '3x', 'play');
        expect((await videoState(currentSlide(page))).playbackRate).toBe(3);

        await pointer.up();
        await expectFeedbackGone(page);
      });

      test('the speed is limited by how long the video is', async ({ page }) => {
        const start = await areaPoint(page, 'right');
        const dragBy = speedDrag(pointer, start, await videoWidth(page));
        await pointer.down(start);
        await expectFeedback(page, '1.5x', 'play');

        // A third of the 12s video's length on top of 1.5x is the most: 5.5, shown rounded to 5s
        await dragBy(50);
        await expectFeedback(page, '5s', 'forward');

        await pointer.up();
        await expectFeedbackGone(page);
      });

      test('back towards where it started slows down again', async ({ page }) => {
        const start = await areaPoint(page, 'right');
        const dragBy = speedDrag(pointer, start, await videoWidth(page));
        await pointer.down(start);
        await expectFeedback(page, '1.5x', 'play');
        await dragBy(2.5);
        await expectFeedback(page, '4x', 'play');

        await dragBy(0);
        await expectFeedback(page, '1.5x', 'play');
        expect((await videoState(currentSlide(page))).playbackRate).toBe(1.5);

        await pointer.up();
        await expectFeedbackGone(page);
      });

      test('left from the right slows down, pauses, then rewinds', async ({ page }) => {
        await seekCurrentVideo(page, 6);
        const start = await areaPoint(page, 'right');
        const dragBy = speedDrag(pointer, start, await videoWidth(page));
        await pointer.down(start);
        await expectFeedback(page, '1.5x', 'play');

        await dragBy(-1);
        await expectFeedback(page, '0.5x', 'play');
        expect((await videoState(currentSlide(page))).playbackRate).toBe(0.5);

        await dragBy(-1.5);
        await expectFeedback(page, '', 'pause');
        expect((await videoState(currentSlide(page))).paused).toBe(true);
        expect(await timeMovedOver(page, 400)).toBe(0);

        await dragBy(-3.5);
        await expectFeedback(page, '2s', 'backward');
        expect(await timeMovedOver(page, 500)).toBeLessThan(-0.6);

        await pointer.up();
        await expectFeedbackGone(page);
        expect((await videoState(currentSlide(page))).paused).toBe(false);
      });

      test('from the middle plays slowly to the right and rewinds slowly to the left', async ({ page }) => {
        await seekCurrentVideo(page, 6);
        const start = await areaPoint(page, 'middle');
        const dragBy = speedDrag(pointer, start, await videoWidth(page));
        await pointer.down(start);
        await expectFeedback(page, '', 'pause');

        await dragBy(0.5);
        await expectFeedback(page, '0.5x', 'play');
        expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 0.5 });

        await dragBy(-0.5);
        await expectFeedback(page, '0.5s', 'backward');
        expect((await videoState(currentSlide(page))).paused).toBe(true);
        expect(await timeMovedOver(page, 1000)).toBeLessThan(-0.2);

        await pointer.up();
        await expectFeedbackGone(page);
        expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
      });

      test('left from the left rewinds faster, showing a thumbnail of where it is past 2s a second', async ({ page }) => {
        await seekCurrentVideo(page, 10);
        const start = await areaPoint(page, 'left');
        const dragBy = speedDrag(pointer, start, await videoWidth(page));
        await pointer.down(start);
        await expectFeedback(page, '1s', 'backward');
        expect(await thumbnailShowing(page)).toBe(false);

        await dragBy(-3.6);
        await expectFeedback(page, '5s', 'backward');
        await expect.poll(() => thumbnailShowing(page)).toBe(true);

        // Back below the thumbnail's speed it's hidden again
        await dragBy(0);
        await expectFeedback(page, '1s', 'backward');
        await expect.poll(() => thumbnailShowing(page)).toBe(false);

        await dragBy(-3.6);
        await expect.poll(() => thumbnailShowing(page)).toBe(true);
        await pointer.up();
        await expectFeedbackGone(page);
        await expect.poll(() => thumbnailShowing(page)).toBe(false);
      });

      test('up or down does nothing but seek', async ({ page }) => {
        const index = await currentIndex(page);
        const start = await areaPoint(page, 'right');
        await pointer.down(start);
        await expectFeedback(page, '1.5x', 'play');

        await pointer.moveTo({ x: start.x, y: start.y - 200 });
        await pointer.moveTo({ x: start.x, y: start.y + 100 });
        await expectFeedback(page, '1.5x', 'play');

        await pointer.up();
        await expectFeedbackGone(page);
        expect(await currentIndex(page)).toBe(index);
      });
    });
  });
}

test.describe('Gestures', () => {
  let pointer: Pointer;

  test.describe('on the first slide', () => {
    test.beforeEach(async ({ page, request }) => {
      await bootFeed(page, request);
      pointer = mousePointer(page);
    });

    test('tapping the left near the start stays at the start, with no slide before it', async ({ page }) => {
      await seekCurrentVideo(page, 1);

      await tap(pointer, await areaPoint(page, 'left'));

      await page.waitForTimeout(300);
      expect(await currentIndex(page)).toBe(0);
      expect((await videoState(currentSlide(page))).currentTime).toBeLessThan(0.8);
    });

    test('tapping the left near the start of a later slide goes back to the slide before', async ({ page }) => {
      await changeSlideWithKeyboard(page, 'next');
      await seekCurrentVideo(page, 1);

      await tap(pointer, await areaPoint(page, 'left'));

      await expectCurrentSlide(page, 0);
    });

    // The middle of a paused video is covered by its big play button, which plays it
    test('tapping the middle of a paused video plays it', async ({ page }) => {
      await pauseCurrentVideo(page);
      const box = await currentSlide(page).boundingBox();
      if (!box) throw new Error('The current slide has no box');

      const middle = { x: box.x + box.width / 2, y: box.y + box.height * 0.4 };
      expect(await feedbackShownDuring(page, () => tap(pointer, middle))).toEqual([]);

      expect((await videoState(currentSlide(page))).paused).toBe(false);
    });

    test('holding on a paused video plays it at 1.5x, and pauses it again when released', async ({ page }) => {
      await pauseCurrentVideo(page);

      await pointer.down(await areaPoint(page, 'right'));
      await expectFeedback(page, '1.5x', 'play');
      expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1.5 });

      await pointer.up();
      await expectFeedbackGone(page);
      expect(await videoState(currentSlide(page))).toMatchObject({ paused: true, playbackRate: 1 });
    });

    test('rewinding a paused video leaves it paused when released', async ({ page }) => {
      await seekCurrentVideo(page, 6);
      await pauseCurrentVideo(page);

      await pointer.down(await areaPoint(page, 'left'));
      await expectFeedback(page, '1s', 'backward');
      expect(await timeMovedOver(page, 600)).toBeLessThan(-0.3);

      await pointer.up();
      await expectFeedbackGone(page);
      expect((await videoState(currentSlide(page))).paused).toBe(true);
    });

    test('a hold on a video that was rewound to its start keeps it at the start until released', async ({ page }) => {
      await seekCurrentVideo(page, 0.5);

      await pointer.down(await areaPoint(page, 'left'));
      await expectFeedback(page, '1s', 'backward');
      await page.waitForTimeout(1000);

      expect((await videoState(currentSlide(page))).currentTime).toBe(0);
      expect(await currentIndex(page)).toBe(0);
      await pointer.up();
      await expectFeedbackGone(page);
    });

    test("a press during which the feed scrolls is not a tap, even if it doesn't leave the slide", async ({ page }) => {
      await pointer.down(await areaPoint(page, 'middle'));
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(300);
      await pointer.up();

      expect(await currentIndex(page)).toBe(0);
      expect((await videoState(currentSlide(page))).paused).toBe(false);
      await expectFeedbackGone(page, { for: 300 });

      // ...and the gestures after it work
      expect(await feedbackShownDuring(page, async () => tap(pointer, await areaPoint(page, 'middle')))).toEqual([]);
      expect((await videoState(currentSlide(page))).paused).toBe(true);
      await pointer.down(await areaPoint(page, 'right'));
      await expectFeedback(page, '1.5x', 'play');
      await pointer.up();
      await expectFeedbackGone(page);
    });

    test('a press the feed scrolls away from during is not a tap', async ({ page }) => {
      await pointer.down(await areaPoint(page, 'middle'));
      await page.mouse.wheel(0, 720);
      await expectCurrentSlide(page, 1);
      await pointer.up();

      await expectFeedbackGone(page);
      // A tap would have played it again
      expect((await videoState(slideAt(page, 0))).paused).toBe(true);
    });
  });

  test('restore the playback rate the user chose, without changing it on other slides', async ({ page, request }) => {
    await bootFeed(page, request, { playbackRate: 1.25 });
    pointer = mousePointer(page);
    expect(Object.values(await playbackRates(page))).toEqual([1.25, 1.25, 1.25]);

    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');
    await expect.poll(() => playbackRates(page)).toEqual({ 0: 1.5, 1: 1.25, 2: 1.25 });

    await pointer.up();
    await expectFeedbackGone(page);
    expect(await playbackRates(page)).toEqual({ 0: 1.25, 1: 1.25, 2: 1.25 });
    await changeSlideWithKeyboard(page, 'next');
    expect((await videoState(currentSlide(page))).playbackRate).toBe(1.25);
  });

  test('leave the video muted if it was muted during a hold', async ({ page, request }) => {
    await bootFeed(page, request, { volume: 1 });
    pointer = mousePointer(page);

    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');
    await page.keyboard.press('m');
    await expect.poll(async () => (await videoState(currentSlide(page))).muted).toBe(true);
    await pointer.up();

    await expectFeedbackGone(page);
    expect((await videoState(currentSlide(page))).muted).toBe(true);
  });

  test("leave the video's sound as it was", async ({ page, request }) => {
    await bootFeed(page, request, { volume: 1 });
    pointer = mousePointer(page);
    await seekCurrentVideo(page, 6);
    expect((await videoState(currentSlide(page))).muted).toBe(false);

    for (const area of ['right', 'left', 'middle'] as const) {
      await pointer.down(await areaPoint(page, area));
      await expect.poll(() => page.locator('.FeedbackOverlay').count()).toBe(1);
      await pointer.up();
      await expectFeedbackGone(page, { for: 0 });
      expect((await videoState(currentSlide(page))).muted).toBe(false);
    }
  });
});
