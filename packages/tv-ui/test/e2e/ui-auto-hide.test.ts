import { type Page } from '@playwright/test';
import { setTvConfig } from './helpers/stash';
import { bootFeed, expectCurrentSlide, pauseCurrentVideo, seekCurrentVideo } from './helpers/gestures';
import { box, currentIndex, currentSlide, slideAt } from './helpers/feed';
import { expect, test } from './helpers/test';

/**
 * E2E: the UI fades out, taking the cursor with it, once a mouse user has been idle, and comes back when the mouse
 * moves. Whether it's actually hidden and what the cursor is are down to CSS, which jsdom tests don't load.
 *
 * @see docs/state-and-config.md § "UI visibility & auto-hide"
 */

const DELAY_SECONDS = 1;
/** How long the UI can take to be hidden: the delay, then a slow fade out */
const HIDDEN_TIMEOUT = DELAY_SECONDS * 1000 + 3000;

test.afterEach(async ({ request }) => setTvConfig(request, null));

const settingsButton = (page: Page) => currentSlide(page).getByRole('button', { name: 'Settings' });

/** The cursor shown over the middle of the current slide's video */
const cursorOverVideo = (page: Page) => currentSlide(page).locator('video').first().evaluate(
  (video) => getComputedStyle(video).cursor,
);

/** How long the settings button's fade (its opacity transition) takes, in seconds. Found by its class, as it's hidden */
const fadeDuration = (page: Page) => currentSlide(page).locator('.ActionButton.settings').evaluate((button) => {
  const { transitionProperty, transitionDuration } = getComputedStyle(button);
  const durations = transitionDuration.split(', ');
  return parseFloat(durations[transitionProperty.split(', ').indexOf('opacity')] ?? durations[0]);
});

async function moveMouseOverVideo(page: Page, offset = 0) {
  const video = await box(currentSlide(page).locator('video').first());
  await page.mouse.move(video.x + video.width / 2 + offset, video.y + video.height / 2);
}

test('the UI and cursor fade out once the mouse is idle, and come back when it moves', async ({ page, request }) => {
  await bootFeed(page, request, { uiAutoHideDelay: DELAY_SECONDS });

  await moveMouseOverVideo(page);
  await expect(settingsButton(page)).toBeVisible();

  await expect(settingsButton(page)).toBeHidden({ timeout: HIDDEN_TIMEOUT });
  expect(await cursorOverVideo(page)).toBe('none');
  // The button to hide the UI is only dimmed, so it can still be found
  await expect(currentSlide(page).getByRole('button', { name: 'Hide UI' })).toBeVisible();

  await moveMouseOverVideo(page, 10);
  await expect(settingsButton(page)).toBeVisible();
  expect(await cursorOverVideo(page)).not.toBe('none');
});

test("the next slide's UI starts shown rather than fading in, then hides once the mouse is idle", async ({ page, request }) => {
  await bootFeed(page, request, { uiAutoHideDelay: DELAY_SECONDS });
  await moveMouseOverVideo(page);
  await expect(settingsButton(page)).toBeHidden({ timeout: HIDDEN_TIMEOUT });
  const index = await currentIndex(page);
  const nextSlide = slideAt(page, index + 1);
  // Record the next slide's settings button's opacity on every frame from when the slide becomes current
  await page.evaluate((nextIndex) => {
    const opacities: number[] = [];
    (window as unknown as { nextSlideOpacities: number[] }).nextSlideOpacities = opacities;
    const record = () => {
      const slide = document.querySelector(`[data-testid="MediaSlide--container"][data-index="${nextIndex}"]`);
      const button = slide?.querySelector('.settings');
      if (slide?.getAttribute('data-current-video') === 'true' && button) opacities.push(Number(getComputedStyle(button).opacity));
      if (opacities.length < 10) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, index + 1);

  // Ending the video moves the feed on without any interaction
  await seekCurrentVideo(page, -0.3);
  await expectCurrentSlide(page, index + 1);

  const opacities = await page.evaluate(() => (window as unknown as { nextSlideOpacities: number[] }).nextSlideOpacities);
  expect(opacities.length).toBeGreaterThan(0);
  expect(opacities.every((opacity) => opacity === 1)).toBe(true);
  await expect(nextSlide.getByRole('button', { name: 'Settings' })).toBeHidden({ timeout: HIDDEN_TIMEOUT });
});

test('the UI fades out more slowly when the mouse goes idle than when the user hides it', async ({ page, request }) => {
  await bootFeed(page, request, { uiAutoHideDelay: DELAY_SECONDS });

  await moveMouseOverVideo(page);
  await expect(settingsButton(page)).toBeHidden({ timeout: HIDDEN_TIMEOUT });
  const idleFade = await fadeDuration(page);

  await moveMouseOverVideo(page, 10);
  await currentSlide(page).getByRole('button', { name: 'Hide UI' }).click();
  await expect(settingsButton(page)).toBeHidden();
  const hideFade = await fadeDuration(page);

  expect(idleFade).toBe(1);
  expect(hideFade).toBeLessThan(idleFade);
});

test('the UI stays while the mouse rests over a control', async ({ page, request }) => {
  await bootFeed(page, request, { uiAutoHideDelay: DELAY_SECONDS });

  await settingsButton(page).hover();
  await page.waitForTimeout(DELAY_SECONDS * 1000 + 1000);

  await expect(settingsButton(page)).toBeVisible();
});

test('the UI stays while the video is paused', async ({ page, request }) => {
  await bootFeed(page, request, { uiAutoHideDelay: DELAY_SECONDS });
  await pauseCurrentVideo(page);

  await moveMouseOverVideo(page);
  await page.waitForTimeout(DELAY_SECONDS * 1000 + 1000);

  await expect(settingsButton(page)).toBeVisible();
});
