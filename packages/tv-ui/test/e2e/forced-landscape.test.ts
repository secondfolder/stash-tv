import { test, expect } from './helpers/test';

/**
 * E2E: forced landscape rotates the UI by making the page's viewport measurements report the rotated size, so layout
 * code sees a landscape viewport on a portrait screen. Only a real browser has the accessor properties this remaps
 * (`window.innerWidth`, `Element.prototype.clientWidth`…), so it's checked here rather than in jsdom.
 *
 * @see AGENTS.md § "Notable Features"
 */

test.describe('Forced landscape', () => {
  test.beforeEach(async ({ page }) => {
    // forceLandscape is a device setting, kept in localStorage rather than Stash's config
    await page.addInitScript(() => {
      localStorage.setItem('app-state-local', JSON.stringify({ state: { forceLandscape: true }, version: 2 }));
    });
  });

  test('swaps the viewport width and height the page reports', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="MediaSlide--container"]', { timeout: 10000 });

    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([700, 400]);
    expect(await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.clientHeight]))
      .toEqual([700, 400]);
  });

  test("leaves other elements' sizes alone", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="MediaSlide--container"]', { timeout: 10000 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(700);

    const size = await page.evaluate(() => {
      const box = document.createElement('div');
      box.style.cssText = 'position: absolute; width: 123px; height: 45px';
      document.body.append(box);
      const measured = [box.clientWidth, box.clientHeight];
      box.remove();
      return measured;
    });

    expect(size).toEqual([123, 45]);
  });
});
