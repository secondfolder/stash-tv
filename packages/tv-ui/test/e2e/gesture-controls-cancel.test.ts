import { type Page } from '@playwright/test';
import { setTvConfig } from './helpers/stash';
import {
  areaPoint,
  bootFeed,
  currentSlide,
  expect,
  expectFeedback,
  expectFeedbackGone,
  feedbackShownDuring,
  mousePointer,
  seekCurrentVideo,
  test,
  videoState,
  type Area,
  type Pointer,
} from './helpers/gestures';

/**
 * E2E: only the primary mouse button makes gestures, and a press whose release may never come (a context menu was
 * opened, or the window lost focus) ends without a tap rather than being left held.
 *
 * @see docs/video-player.md § "Gestures"
 */

let pointer: Pointer;

test.beforeEach(async ({ page, request }) => {
  await bootFeed(page, request);
  pointer = mousePointer(page);
  await seekCurrentVideo(page, 6);
});
test.afterEach(async ({ request }) => setTvConfig(request, null));

/** As a context menu opening would (a right-click, or Ctrl+click on macOS) */
const openContextMenu = (page: Page) =>
  currentSlide(page).locator('video').dispatchEvent('contextmenu', { bubbles: true, cancelable: true });

const blurWindow = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));

test.describe('Gestures with other mouse buttons', () => {
  for (const area of ['left', 'right'] as Area[]) {
    test(`a right-click on the ${area} doesn't skip`, async ({ page }) => {
      const { x, y } = await areaPoint(page, area);
      await page.mouse.move(x, y);
      const before = (await videoState(currentSlide(page))).currentTime;
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });

      await page.waitForTimeout(300);
      expect(Math.abs((await videoState(currentSlide(page))).currentTime - before)).toBeLessThan(1);
    });
  }

  test('holding the right button does nothing', async ({ page }) => {
    const { x, y } = await areaPoint(page, 'right');
    await page.mouse.move(x, y);
    const shown = await feedbackShownDuring(page, async () => {
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(600);
    });
    expect(shown).toEqual([]);
    const held = await videoState(currentSlide(page));
    expect(held.playbackRate).toBe(1);
    expect(held.paused).toBe(false);
    await page.mouse.up({ button: 'right' });
  });
});

test.describe('A press whose release may never come', () => {
  test('a context menu opened before the hold registers ends the press without a tap', async ({ page }) => {
    const before = (await videoState(currentSlide(page))).currentTime;
    const shown = await feedbackShownDuring(page, async () => {
      await pointer.down(await areaPoint(page, 'right'));
      await openContextMenu(page);
      await page.waitForTimeout(600);
      await pointer.up();
    });

    expect(shown).toEqual([]);
    const after = await videoState(currentSlide(page));
    expect(after.playbackRate).toBe(1);
    // A tap would have skipped forwards
    expect(after.currentTime - before).toBeLessThan(2);
  });

  test('a context menu opened during a hold ends it', async ({ page }) => {
    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');

    await openContextMenu(page);
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
    await pointer.up();
  });

  test('the window losing focus during a hold ends it', async ({ page }) => {
    await pointer.down(await areaPoint(page, 'left'));
    await expectFeedback(page, '1s', 'backward');

    await blurWindow(page);
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
    await pointer.up();
  });

  test('gestures work again after a press is ended', async ({ page }) => {
    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');
    await blurWindow(page);
    await expectFeedbackGone(page);
    await pointer.up();

    await pointer.down(await areaPoint(page, 'right'));
    await expectFeedback(page, '1.5x', 'play');
    await pointer.up();
    await expectFeedbackGone(page);
  });
});
