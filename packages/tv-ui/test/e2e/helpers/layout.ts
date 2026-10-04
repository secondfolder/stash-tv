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

/**
 * Wait until nothing in `container` (it included) has moved, changed size or faded for `frames` animation frames in a
 * row, e.g. for an animation to finish. Use this rather than waiting a fixed time, which a busy machine can outlast
 * (and which is usually longer than needed). What's in it is looked for afresh each frame, so elements coming or going
 * count as changes. Fails if it's still changing after `timeout` ms.
 *
 * ⚠️ Pick a container without anything that never stops changing, e.g. a playing video's progress bar.
 */
export async function stoppedMoving(container: Locator, { frames = 10, timeout = 10_000 } = {}) {
  await container.evaluate((root, { frames, timeout }) => new Promise<void>((resolve, reject) => {
    const started = performance.now();
    let previous = '';
    let still = 0;
    const sample = () => {
      const state = [root, ...root.querySelectorAll('*')].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return `${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} ${getComputedStyle(element).opacity}`;
      }).join();
      still = state === previous ? still + 1 : 0;
      previous = state;
      if (still >= frames) resolve();
      else if (performance.now() - started > timeout) reject(new Error(`Still changing after ${timeout}ms`));
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), { frames, timeout });
}
