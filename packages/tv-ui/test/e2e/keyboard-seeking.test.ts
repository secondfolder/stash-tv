import { setTvConfig } from './helpers/stash';
import {
  bootFeed,
  currentSlide,
  expect,
  expectCurrentSlide,
  expectFeedback,
  expectFeedbackGone,
  feedbackShownDuring,
  seekCurrentVideo,
  test,
  timeMovedOver,
  videoState,
} from './helpers/gestures';

/**
 * E2E: the arrow keys skip and seek through the current video the way gestures on it do, sharing their seeking and
 * feedback. Holding ← or → seeks, and ↑ and ↓ change the speed while it's held.
 *
 * @see docs/video-player.md § "Gestures"
 * @see docs/keyboard-shortcuts.md
 */

test.beforeEach(async ({ page, request }) => {
  await bootFeed(page, request);
  await seekCurrentVideo(page, 2);
});
test.afterEach(async ({ request }) => setTvConfig(request, null));

/** Press a key while another is held, and wait for the feedback it should show. */
async function pressFor(page: import('@playwright/test').Page, key: string, text: string, icon: string | null) {
  await page.keyboard.press(key);
  await expectFeedback(page, text, icon);
}

test.describe('Seeking with the keyboard', () => {
  test('tapping → skips forwards without any feedback', async ({ page }) => {
    const before = (await videoState(currentSlide(page))).currentTime;

    expect(await feedbackShownDuring(page, () => page.keyboard.press('ArrowRight'))).toEqual([]);

    expect((await videoState(currentSlide(page))).currentTime - before).toBeGreaterThan(3.5);
  });

  test('holding → plays at 2x until released, without skipping', async ({ page }) => {
    await page.keyboard.down('ArrowRight');
    await expectFeedback(page, '2x', 'play');
    expect((await videoState(currentSlide(page))).playbackRate).toBe(2);

    const beforeRelease = (await videoState(currentSlide(page))).currentTime;
    await page.keyboard.up('ArrowRight');
    await expectFeedbackGone(page);
    const released = await videoState(currentSlide(page));
    expect(released).toMatchObject({ paused: false, playbackRate: 1 });
    expect(released.currentTime - beforeRelease).toBeLessThan(1.5);
  });

  test('holding ← rewinds at 2s a second until released', async ({ page }) => {
    await seekCurrentVideo(page, 8);
    await page.keyboard.down('ArrowLeft');
    await expectFeedback(page, '2s', 'backward');
    expect(await timeMovedOver(page, 1000)).toBeLessThan(-1.2);

    await page.keyboard.up('ArrowLeft');
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });

  test('↓ while holding → slows down by a tenth', async ({ page }) => {
    await page.keyboard.down('ArrowRight');
    await expectFeedback(page, '2x', 'play');

    await pressFor(page, 'ArrowDown', '1.9x', 'play');
    await pressFor(page, 'ArrowDown', '1.8x', 'play');
    expect((await videoState(currentSlide(page))).playbackRate).toBe(1.8);

    await page.keyboard.up('ArrowRight');
    await expectFeedbackGone(page);
  });

  test('↑ and ↓ while holding ← step through every speed', async ({ page }) => {
    await seekCurrentVideo(page, 0.5);
    await page.keyboard.down('ArrowLeft');
    await expectFeedback(page, '2s', 'backward');

    // Slower is further backwards, in bigger steps the faster it goes
    for (const text of ['3s', '4s', '5s', '10s', '15s', '30s', '45s', '1m', '2m', '4m', '5m']) {
      await pressFor(page, 'ArrowDown', text, 'backward');
    }
    // Faster comes back the same way, through in-between speeds
    for (const text of ['4m', '3m', '2m', '1m 30s', '1m', '45s', '30s', '15s', '10s', '5s', '4s', '3s', '2s', '1s']) {
      await pressFor(page, 'ArrowUp', text, 'backward');
    }
    // A tenth at a time either side of stopped
    for (const text of ['0.9s', '0.8s', '0.7s', '0.6s', '0.5s', '0.4s', '0.3s', '0.2s', '0.1s']) {
      await pressFor(page, 'ArrowUp', text, 'backward');
    }
    await pressFor(page, 'ArrowUp', '', 'pause');
    expect((await videoState(currentSlide(page))).paused).toBe(true);
    for (const text of ['0.1x', '0.2x', '0.3x', '0.4x', '0.5x', '0.6x', '0.7x', '0.8x', '0.9x', '1x', '1.1x']) {
      await pressFor(page, 'ArrowUp', text, 'play');
    }
    expect((await videoState(currentSlide(page))).playbackRate).toBe(1.1);
    for (const text of ['1.2x', '1.3x', '1.4x', '1.5x', '1.6x', '1.7x', '1.8x', '1.9x', '2x', '3x', '4x']) {
      await pressFor(page, 'ArrowUp', text, 'play');
    }
    expect((await videoState(currentSlide(page))).playbackRate).toBe(4);

    await page.keyboard.up('ArrowLeft');
    await expectFeedbackGone(page);
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, playbackRate: 1 });
  });

  test('holding ↑ or ↓ while holding → changes the speed by one each repeat', async ({ page }) => {
    await page.keyboard.down('ArrowRight');
    await expectFeedback(page, '2x', 'play');

    await page.keyboard.down('ArrowUp');
    await expectFeedback(page, '3x', 'play');
    await page.keyboard.down('ArrowUp'); // repeat
    await expectFeedback(page, '4x', 'play');
    await page.keyboard.up('ArrowUp');

    await page.keyboard.down('ArrowDown');
    await expectFeedback(page, '3x', 'play');
    await page.keyboard.down('ArrowDown'); // repeat
    await expectFeedback(page, '2x', 'play');
    await page.keyboard.up('ArrowDown');

    await page.keyboard.up('ArrowRight');
    await expectFeedbackGone(page);
  });

  test('holding → until the video ends moves on to the next slide at normal speed', async ({ page }) => {
    await seekCurrentVideo(page, -2);
    await page.keyboard.down('ArrowRight');
    await expectFeedback(page, '2x', 'play');

    await expectCurrentSlide(page, 1);
    await expectFeedbackGone(page, { for: 300 });
    expect((await videoState(currentSlide(page))).playbackRate).toBe(1);

    const before = (await videoState(currentSlide(page))).currentTime;
    expect(await feedbackShownDuring(page, () => page.keyboard.up('ArrowRight'))).toEqual([]);
    const after = await videoState(currentSlide(page));
    expect(after).toMatchObject({ paused: false, playbackRate: 1 });
    // Letting go doesn't skip the new slide
    expect(after.currentTime - before).toBeLessThan(1);
  });
});

test.describe('Seeking with the keyboard on a preview', () => {
  test('rewinds faster with no thumbnail preview, as previews have none', async ({ page, request }) => {
    await bootFeed(page, request, { scenePreviewOnly: true, looping: true });
    await page.keyboard.down('ArrowLeft');
    await expectFeedback(page, '2s', 'backward');

    await page.keyboard.press('ArrowDown');
    await expectFeedback(page, '3s', 'backward');
    await page.waitForTimeout(300);
    expect(await currentSlide(page).locator('.vjs-vtt-thumbnail-display').count()).toBe(0);

    await page.keyboard.up('ArrowLeft');
    await expectFeedbackGone(page);
  });
});
