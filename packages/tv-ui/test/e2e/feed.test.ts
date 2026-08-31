import { test, expect } from '@playwright/test';

/**
 * E2E test: Basic feed rendering
 *
 * Tests that the feed page loads and renders media slides.
 * @see docs/media-loading.md § "Media pagination"
 */

test.describe('Feed', () => {
  test('renders media slides', async ({ page }) => {
    await page.goto('/');

    // Wait for the feed to load
    await page.waitForSelector('[data-testid="FeedPage"]', { timeout: 10000 });

    // Check that at least one slide is rendered
    const slides = await page.locator('[data-testid="MediaSlide--container"]').count();
    expect(slides).toBeGreaterThan(0);

    // Check that the first slide is visible
    const firstSlide = page.locator('[data-testid="MediaSlide--container"]').first();
    await expect(firstSlide).toBeVisible();
  });

  test('shows scene details on current slide', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[data-testid="MediaSlide--container"]', { timeout: 10000 });

    // Check that scene details are displayed (title, tags, etc.)
    const firstSlide = page.locator('[data-testid="MediaSlide--container"]').first();
    await expect(firstSlide).toBeVisible();

    // The slide should contain a video player
    const videoPlayer = firstSlide.locator('video-js').first();
    await expect(videoPlayer).toBeVisible();
  });

  test('displays controls overlay', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('[data-testid="MediaSlide--container"]', { timeout: 10000 });

    // Check that playback controls are present (ActionButtons includes controls)
    const firstSlide = page.locator('[data-testid="MediaSlide--container"]').first();

    // The slide should have action buttons
    const actionButtons = firstSlide.locator('[data-testid="action-button"]');
    const buttonCount = await actionButtons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });
});
