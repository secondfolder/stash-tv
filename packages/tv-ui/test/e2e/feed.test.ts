import { test, expect } from '@playwright/test';

/**
 * E2E tests: the feed boots in a real browser against the mock Stash API.
 * @see docs/media-loading.md § "Data flow"
 */

test.describe('Feed', () => {
  test('renders media slides from the mock Stash API', async ({ page }) => {
    await page.goto('/');

    // Wait for the feed to load
    await page.waitForSelector('[data-testid="FeedPage"]', { timeout: 10000 });

    // Slides render (auto-retrying visibility — slides arrive async). The feed is
    // virtualized, so only the visible slide plus its buffer mounts — with 5
    // first-page items that's at least 3 slide containers.
    const slides = page.locator('[data-testid="MediaSlide--container"]');
    await expect(slides.first()).toBeVisible({ timeout: 10000 });
    expect(await slides.count()).toBeGreaterThanOrEqual(3);
  });

  test("shows the first scene's details and a player on the current slide", async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[data-testid="MediaSlide--container"]', { timeout: 10000 });

    // The current slide is the first page's newest scene by date desc
    const firstSlide = page.locator('[data-testid="MediaSlide--container"]').first();
    await expect(firstSlide).toBeVisible();
    await expect(firstSlide).toContainText('Grotto Glow', { timeout: 10000 });

    // ...and it contains a video player
    await expect(firstSlide.locator('video-js').first()).toBeVisible();
  });

  test('displays action buttons on the current slide', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[data-testid="MediaSlide--container"]', { timeout: 10000 });

    // The default stack: ui-visibility, settings, show-scene-info, force-landscape,
    // volume, letterboxing, and folders of nested buttons. The root class is the
    // action button component's contract (no data-testid is threaded through the
    // per-type button components).
    const actionButtons = page.locator('.ActionButton');
    await expect(actionButtons.first()).toBeVisible({ timeout: 10000 });
    expect(await actionButtons.count()).toBeGreaterThan(5);
  });
});
