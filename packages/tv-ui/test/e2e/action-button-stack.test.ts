import { test, expect, type Page } from '@playwright/test';
import { setActionButtons } from './helpers/stash';

/**
 * E2E tests: a closed folder previews the icons of its first 4 shown buttons, and opening or closing it animates each
 * icon between the preview and the open folder. Which icons fit is down to CSS (jsdom tests don't load stylesheets)
 * and the animation needs layout, so both are only testable here.
 *
 * @see docs/action-buttons.md § "Rendering (`ActionButtonStack`)"
 */

type Box = { x: number, y: number, width: number, height: number };
type Frame = { time: number, preview: Box[], open: Box[], stackScrollable: boolean, arrowOpacity: number };

const currentSlide = (page: Page) => page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');

/**
 * Where the folder's icons are on each animation frame while `action` runs and for a while after: in the current
 * slide's folder preview (kept, unseen, while the folder is open) and in the open folder, in the order of the folder's
 * buttons. Also whether the current slide's action button stack could be scrolled, how visible the open folder's arrow
 * is, and the time in ms since recording started.
 */
async function iconFramesDuring(page: Page, action: () => Promise<void>): Promise<Frame[]> {
  await page.evaluate(() => {
    const boxes = (selector: string) => [...document.querySelectorAll(selector)].map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    });
    const frames: Frame[] = [];
    const start = performance.now();
    Object.assign(window, { iconFrames: frames });
    const record = () => {
      const stack = document.querySelector('[data-current-video="true"] .ActionButtonStack .stack');
      const arrow = document.querySelector('[data-current-video="true"] .folder .hide-icon');
      frames.push({
        time: performance.now() - start,
        arrowOpacity: arrow ? Number(getComputedStyle(arrow).opacity) : 0,
        preview: boxes('[data-current-video="true"] .folder-contents .folder-icon'),
        open: boxes('.folder-contents-popover .folder-icon'),
        stackScrollable: !!stack && (stack.scrollHeight > stack.clientHeight || stack.scrollWidth > stack.clientWidth),
      });
      if (frames.length < 60) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await action();
  await page.waitForTimeout(1200);
  return page.evaluate(() => (window as unknown as { iconFrames: Frame[] }).iconFrames);
}

const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const distance = (a: Box, b: Box) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y);

/**
 * Expect an icon to have started its animation from `start` on its way to `end`. It can already have moved a little by
 * the first frame recorded, so this allows for 10% of the way.
 */
function expectStartedFrom(first: Box, start: Box, end: Box) {
  const journey = distance(start, end);
  expect(journey, 'distance the icon animates').toBeGreaterThan(50);
  expect(distance(first, start)).toBeLessThan(journey * 0.1);
  expect(Math.abs(first.width - start.width)).toBeLessThan(Math.abs(end.width - start.width) * 0.1);
}

/** Whether the open folder's arrow is part way through fading in or out, given how visible it is when shown */
const isFading = (shownOpacity: number) => (frame: Frame) =>
  frame.arrowOpacity > 0.05 && frame.arrowOpacity < shownOpacity - 0.05;

test.describe('Action button folder preview', () => {
  test.afterEach(async ({ request }) => {
    await setActionButtons(request, null);
  });

  test('previews the icons of only its first 4 shown buttons', async ({ page, request }) => {
    // Fixture scenes have no captions, so the subtitles button isn't shown and mustn't take one of the 4 places
    const buttonTypes = ['subtitles', 'loop', 'letterboxing', 'force-landscape', 'show-scene-info', 'rate-scene'];
    await setActionButtons(request, [{
      id: 'folder',
      type: 'folder',
      pinned: false,
      contents: buttonTypes.map((buttonType) => ({ id: buttonType, type: 'button', buttonType, pinned: false })),
    }]);

    await page.goto('/');
    const slide = page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
    const icons = slide.getByRole('button', { name: 'Open folder' }).locator('.ActionButtonIcon');

    await expect(icons).toHaveCount(5);
    await expect(icons.locator('visible=true')).toHaveCount(4);
    await expect(icons.nth(4)).toBeHidden();
  });

  test.describe('animation', () => {
    test.beforeEach(async ({ page, request }) => {
      await setActionButtons(request, [{
        id: 'folder',
        type: 'folder',
        pinned: false,
        contents: ['loop', 'letterboxing', 'force-landscape', 'show-scene-info']
          .map((buttonType) => ({ id: buttonType, type: 'button', buttonType, pinned: false })),
      }]);
      await page.goto('/');
      await expect(currentSlide(page).locator('.folder-contents .folder-icon')).toHaveCount(4);
    });

    test('moves each icon from the preview into the open folder', async ({ page }) => {
      const frames = await iconFramesDuring(page, () =>
        currentSlide(page).getByRole('button', { name: 'Open folder' }).click()
      );

      const before = frames[0].preview;
      const firstOpen = frames.find((frame) => frame.open.length > 0)!;
      const last = frames[frames.length - 1];
      firstOpen.open.forEach((box, i) => expectStartedFrom(box, before[i], last.open[i]));
      // It ends up somewhere else, at full size
      expect(last.open[0].width).toBeGreaterThan(before[0].width * 2);
      expect(frames.filter((frame) => frame.open.length && frame.open[0].width < last.open[0].width).length,
        'frames spent animating').toBeGreaterThan(3);
    });

    test('moves each icon from the open folder back into the preview', async ({ page }) => {
      await currentSlide(page).getByRole('button', { name: 'Open folder' }).click();
      await page.waitForTimeout(600);

      const frames = await iconFramesDuring(page, () =>
        currentSlide(page).getByRole('button', { name: 'Close folder' }).click()
      );

      const before = frames[0].open;
      const lastOpen = frames.filter((frame) => frame.open.length > 0).at(-1)!;
      // The open folder's icons are the ones that move, and the open folder goes once they're in the preview
      lastOpen.open.forEach((box, i) => expectStartedFrom(box, lastOpen.preview[i], before[i]));
      expect(frames.filter((frame) => frame.open.length && frame.open[0].width < before[0].width).length,
        'frames spent animating').toBeGreaterThan(3);
      expect(frames.at(-1)!.open).toEqual([]);
    });

    // The preview is in the stack, which scrolls, so icons moving across it would make it scrollable (and Firefox
    // would show a scrollbar). The folder is at the top of the stack, so its open folder is above the stack.
    test("doesn't make the action button stack scrollable while closing", async ({ page }) => {
      await currentSlide(page).getByRole('button', { name: 'Open folder' }).click();
      await page.waitForTimeout(600);

      const frames = await iconFramesDuring(page, () =>
        currentSlide(page).getByRole('button', { name: 'Close folder' }).click()
      );

      expect(frames.filter((frame) => frame.stackScrollable)).toEqual([]);
    });

    test('fades in the open folder\'s arrow once the icons are on their way', async ({ page }) => {
      const frames = await iconFramesDuring(page, () =>
        currentSlide(page).getByRole('button', { name: 'Open folder' }).click()
      );

      const iconsMoving = frames.find((frame) => frame.open.length > 0)!;
      const iconsArrived = frames.find((frame) => frame.time > iconsMoving.time && frame.open[0]?.width === frames.at(-1)!.open[0].width)!;
      expect(iconsMoving.arrowOpacity, 'as the icons start moving').toBe(0);
      expect(iconsArrived.arrowOpacity).toBeGreaterThan(0);
      const shown = frames.at(-1)!.arrowOpacity;
      expect(shown).toBeGreaterThan(0);
      expect(frames.some(isFading(shown)), 'fades rather than appearing').toBe(true);
    });

    test('fades out the open folder\'s arrow before the icons are back', async ({ page }) => {
      await currentSlide(page).getByRole('button', { name: 'Open folder' }).click();
      await page.waitForTimeout(600);

      const frames = await iconFramesDuring(page, () =>
        currentSlide(page).getByRole('button', { name: 'Close folder' }).click()
      );

      const closing = frames.filter((frame) => frame.open.length > 0 && frame.open[0].width < frames[0].open[0].width);
      const shown = frames[0].arrowOpacity;
      expect(closing[0].arrowOpacity, 'fading out from the start').toBeLessThan(shown);
      expect(frames.filter((frame) => frame.open.length > 0).at(-1)!.arrowOpacity, 'when the icons are back').toBeLessThan(0.1);
      expect(frames.some(isFading(shown)), 'fades rather than disappearing').toBe(true);
    });

    test.describe('when the user prefers reduced motion', () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
      });

      test('opens the folder without animating', async ({ page }) => {
        const frames = await iconFramesDuring(page, () =>
          currentSlide(page).getByRole('button', { name: 'Open folder' }).click()
        );

        const opened = frames.filter((frame) => frame.open.length > 0);
        const last = frames.at(-1)!;
        expect(opened[0].open).toEqual(last.open);
        expect(opened[0].arrowOpacity).toBe(last.arrowOpacity);
      });

      test('closes the folder without animating', async ({ page }) => {
        await currentSlide(page).getByRole('button', { name: 'Open folder' }).click();
        await page.waitForTimeout(600);

        const frames = await iconFramesDuring(page, () =>
          currentSlide(page).getByRole('button', { name: 'Close folder' }).click()
        );

        // Each frame shows the open folder as it was, or none at all
        expect(frames.filter((frame) => frame.open.length > 0).every((frame) =>
          JSON.stringify(frame.open) === JSON.stringify(frames[0].open))).toBe(true);
        const closed = frames.findIndex((frame) => frame.open.length === 0);
        expect(frames.slice(closed).every((frame) => frame.arrowOpacity === 0)).toBe(true);
      });
    });
  });
});
