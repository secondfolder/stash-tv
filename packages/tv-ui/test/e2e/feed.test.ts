import { test, expect } from './helpers/test';
import {
  bootFeed,
  changeSlideWithKeyboard,
  videoState,
} from './helpers/gestures';
import { setTvConfig } from './helpers/stash';
import { currentSlide, slideAt } from './helpers/feed';

/**
 * E2E tests: the feed boots in a real browser against the mock Stash API.
 * @see docs/media-loading.md § "Data flow"
 */

test.describe('Feed', () => {
  test.afterEach(async ({ request }) => setTvConfig(request, null));

  // A smoke test of the whole stack in a real browser: the dev server, its proxy to mock-stash, and the media it serves
  test('plays the newest scene on the current slide, with its action buttons, in a real browser', async ({ page, request }) => {
    await bootFeed(page, request);

    // The first page's newest scene, playing
    await expect(currentSlide(page)).toContainText('Grotto Glow');
    expect(await videoState(currentSlide(page))).toMatchObject({ paused: false });
    await expect(currentSlide(page).getByRole('button', { name: 'Show scene info' })).toBeVisible();
    // The next slide is rendered too, ready to scroll to
    await expect(slideAt(page, 1)).toBeAttached();
  });

  // Leaving a slide unloads its video once it has shown its last frame as the poster, which takes a moment: going back
  // within it used to unload the video anyway, stopping it
  test('keeps playing a slide gone back to straight after leaving it', async ({ page, request }) => {
    await bootFeed(page, request);

    for (let attempt = 0; attempt < 4; attempt++) {
      await changeSlideWithKeyboard(page, 'next');
      await changeSlideWithKeyboard(page, 'previous');
      await page.waitForTimeout(1000);
      expect(await videoState(currentSlide(page))).toMatchObject({ paused: false, readyState: 4 });
    }
  });
});
