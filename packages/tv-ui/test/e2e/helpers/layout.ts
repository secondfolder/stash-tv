import { expect, type Locator } from '@playwright/test';

/**
 * Assert that the element is entirely on screen and that nothing covers any part of it, i.e. it isn't positioned
 * off-screen or hidden behind something (`toBeVisible` checks neither). Checks its middle, edges and corners, since
 * something can cover just part of it (e.g. buttons poking through one end of a dropdown option).
 */
export async function expectUsableOnScreen(element: Locator) {
  await expect(element).toBeInViewport({ ratio: 1 });
  const coveredAt = await element.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const inset = 2; // Stay off the very edge, which can belong to a neighbour
    const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
    const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
    const covered = [];
    for (const x of xs) {
      for (const y of ys) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) {
          covered.push(`(${Math.round(x)}, ${Math.round(y)}) by ${hit ? hit.outerHTML.slice(0, 80) : 'nothing'}`);
        }
      }
    }
    return covered;
  });
  expect(coveredAt, 'parts of the element are covered by something else').toEqual([]);
}
