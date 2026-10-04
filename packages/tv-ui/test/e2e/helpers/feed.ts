import type { Locator, Page } from '@playwright/test';

/** Finding things in the feed: its slides, and what's on them */

export const slideAt = (page: Page, index: number) =>
  page.locator(`[data-testid="MediaSlide--container"][data-index="${index}"]`);

export const currentSlide = (page: Page) => page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');

export async function currentIndex(page: Page) {
  return Number(await currentSlide(page).getAttribute('data-index'));
}

/** The current slide's scene info panel */
export function infoPanel(page: Page) {
  return currentSlide(page).getByTestId('MediaSlide--sceneInfo');
}

/** Where the element is on the page, failing if it isn't rendered */
export async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error('Element not rendered');
  return result;
}
