import { type CDPSession, type Locator, type Page } from '@playwright/test';
import { expect } from './test';
import { currentIndex, currentSlide, slideAt } from './feed';
import { setTvConfig } from './stash';

/**
 * Helpers for tests of the gestures on a slide's video (tapping, holding and dragging on it) and of the seeking they
 * share with the arrow keys. @see docs/video-player.md § "Gestures"
 */


export type Area = 'left' | 'middle' | 'right';
export interface Point {
  x: number;
  y: number;
}

/* --------------------------------- Booting -------------------------------- */

/**
 * Load the feed with the given tvConfig, recording the feedback overlay, and wait for the first video to play. (Videos
 * start from the beginning, as `setTvConfig` sets them to.)
 */
export async function bootFeed(page: Page, request: Parameters<typeof setTvConfig>[0], config: Record<string, unknown> = {}) {
  // E2E_LOG_GESTURES=1 prints the app's gesture and seeking logs, to see what a failing test did
  if (process.env.E2E_LOG_GESTURES) {
    page.on('console', (message) => {
      const text = message.text();
      if (/useGestureControls|Seek|Going to|^Video (play|pause)/.test(text)) console.log('  [browser]', text.replace(/%c|color:.*$/g, ''));
    });
    // ...and where each video was played or paused from
    await page.addInitScript(() => {
      for (const method of ['play', 'pause'] as const) {
        const original = HTMLMediaElement.prototype[method];
        Object.defineProperty(HTMLMediaElement.prototype, method, {
          value: function (this: HTMLMediaElement) {
            const slide = this.closest('[data-index]')?.getAttribute('data-index');
            const caller = new Error().stack?.split('\n').slice(2, 7).map((line) => line.trim().replace(/\(.*\/(.*?)(\?[^:]*)?:(\d+):\d+\)/, '($1:$3)'));
            console.log(`Video ${method} on slide ${slide} ${caller?.join(' <- ')}`);
            const result = original.call(this);
            Promise.resolve(result).catch((error) => console.log(`Video play on slide ${slide} failed: ${error}`));
            return result;
          },
        });
      }
      document.addEventListener('pause', ({ target }) => {
        if (!(target instanceof HTMLMediaElement)) return;
        const slide = target.closest('[data-index]')?.getAttribute('data-index');
        console.log(`Video paused event on slide ${slide} at ${target.currentTime}`);
      }, true);
    });
  }
  await setTvConfig(request, config);
  await recordFeedback(page);
  await page.goto('/');
  if (config.autoPlay === false) {
    await expect.poll(() => videoState(currentSlide(page)).then((video) => video.readyState)).toBeGreaterThanOrEqual(1);
  } else {
    await waitForPlayback(page);
  }
}

/* ------------------------------ Slides & video ----------------------------- */



/** Wait for the slide at `index` to be the current one, and its video to be playing. */
export async function expectCurrentSlide(page: Page, index: number) {
  await expect(slideAt(page, index)).toHaveAttribute('data-current-video', 'true');
  await waitForPlayback(page);
}

export async function videoState(slide: Locator) {
  return slide.locator('video').first().evaluate((video: HTMLVideoElement) => ({
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    playbackRate: video.playbackRate,
    muted: video.muted,
    readyState: video.readyState,
  }));
}

/** The playback rate of every rendered slide's video, by slide index. */
export async function playbackRates(page: Page) {
  return page.locator('[data-testid="MediaSlide--container"]').evaluateAll((slides) =>
    Object.fromEntries(slides.map((slide) => [slide.getAttribute('data-index'), slide.querySelector('video')?.playbackRate]))
  );
}

/** Wait until the current slide's video is playing and has got past its first moments. */
export async function waitForPlayback(page: Page) {
  await expect
    .poll(() => videoState(currentSlide(page)).then((video) => !video.paused && video.currentTime > 0.2), { timeout: 10_000 })
    .toBe(true);
}

/** Jump the current slide's video to `seconds` (negative counts back from the end) and wait for it to get there. */
export async function seekCurrentVideo(page: Page, seconds: number) {
  await currentSlide(page).locator('video').first().evaluate((video: HTMLVideoElement, seconds) => {
    video.currentTime = seconds < 0 ? video.duration + seconds : seconds;
    return new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
  }, seconds);
}

export async function pauseCurrentVideo(page: Page) {
  await currentSlide(page).locator('video').first().evaluate((video: HTMLVideoElement) => video.pause());
  await expect.poll(() => videoState(currentSlide(page)).then((video) => video.paused)).toBe(true);
}

/** Watch the current slide's video's time for `ms`, returning how far it moved. */
export async function timeMovedOver(page: Page, ms: number, slide = currentSlide(page)) {
  const before = (await videoState(slide)).currentTime;
  await page.waitForTimeout(ms);
  return (await videoState(slide)).currentTime - before;
}

/** Move to the next or previous slide with the keyboard shortcut, waiting for it to start playing. */
export async function changeSlideWithKeyboard(page: Page, direction: 'next' | 'previous') {
  const index = await currentIndex(page);
  await page.keyboard.press(direction === 'next' ? 'ArrowDown' : 'ArrowUp');
  await expectCurrentSlide(page, index + (direction === 'next' ? 1 : -1));
}

/* ---------------------------------- Input --------------------------------- */

/** Where on the current slide's video a gesture in the given third of it starts. */
export async function areaPoint(page: Page, area: Area): Promise<Point> {
  const box = await currentSlide(page).boundingBox();
  if (!box) throw new Error('The current slide has no box');
  const fraction = { left: 0.15, middle: 0.5, right: 0.75 }[area];
  const point = { x: box.x + box.width * fraction, y: box.y + box.height * 0.4 };
  // Gestures only work on the video (or iOS's stand-in for it), not the buttons or panels over it
  const onGestureTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return !!element?.matches('video, .text-selection-on-gesture-workaround') && !!element.closest('[data-current-video="true"]');
  }, point);
  expect(onGestureTarget, `the ${area} of the current slide is its video`).toBe(true);
  return point;
}

/**
 * Drags a hold that started at `start` to change its speed by a given amount. The speed changes with the 6th power of
 * the distance dragged, as a proportion of the video's width: dragging a tenth of the way across changes it by 1. It
 * changes by at most a third of the video's duration either way.
 *
 * The first few pixels of a drag don't count: they're use-gesture's threshold for telling a drag from a tap. They're
 * taken off in the direction the drag first went, for the rest of the drag.
 */
export function speedDrag(pointer: Pointer, start: Point, width: number) {
  const dragThreshold = 3;
  let firstDirection = 0;
  return async (change: number, options?: { steps?: number }) => {
    firstDirection ||= Math.sign(change);
    const distance = Math.sign(change) * (width / 10) * Math.abs(change) ** (1 / 6);
    await pointer.moveTo({ x: start.x + firstDirection * dragThreshold + distance, y: start.y }, options);
  };
}

export async function videoWidth(page: Page) {
  const box = await currentSlide(page).boundingBox();
  if (!box) throw new Error('The current slide has no box');
  return box.width;
}

/** A mouse or a finger: the two are handled the same, as pointer events. */
export interface Pointer {
  down(point: Point): Promise<void>;
  /** Move in a few steps (or `steps` of them), as a pointer moves through the points between */
  moveTo(point: Point, options?: { steps?: number }): Promise<void>;
  up(): Promise<void>;
}

export function mousePointer(page: Page): Pointer {
  return {
    async down({ x, y }) {
      await page.mouse.move(x, y);
      await page.mouse.down();
    },
    async moveTo({ x, y }, { steps = 5 } = {}) {
      await page.mouse.move(x, y, { steps });
    },
    async up() {
      await page.mouse.up();
    },
  };
}

/** A finger on a touch screen. The page's context must have `hasTouch`. */
export function touchPointer(page: Page): Pointer {
  let session: CDPSession | undefined;
  let position: Point = { x: 0, y: 0 };
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: Point) => {
    session ??= await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
  };
  return {
    async down(point) {
      position = point;
      await touch('touchStart', point);
    },
    async moveTo(point, { steps = 5 } = {}) {
      const from = position;
      for (let step = 1; step <= steps; step++) {
        await touch('touchMove', { x: from.x + ((point.x - from.x) * step) / steps, y: from.y + ((point.y - from.y) * step) / steps });
      }
      position = point;
    },
    async up() {
      await touch('touchEnd');
    },
  };
}

/** A press and release quick enough to count as a tap. */
export async function tap(pointer: Pointer, point: Point) {
  await pointer.down(point);
  await pointer.up();
}

/* -------------------------------- Feedback -------------------------------- */

export interface Feedback {
  text: string;
  icon: string | null;
}

declare global {
  interface Window {
    feedbackHistory?: (Feedback | null)[];
  }
}

/**
 * Record every change to what the feedback overlay shows, from page load. A fading overlay counts as gone: it's on
 * its way out and nothing replaces it.
 */
async function recordFeedback(page: Page) {
  await page.addInitScript(() => {
    const history: ({ text: string; icon: string | null } | null)[] = [];
    window.feedbackHistory = history;
    const shown = () => {
      const overlay = document.querySelector('.FeedbackOverlay:not(.fade-out)');
      if (!overlay) return null;
      return { text: overlay.textContent ?? '', icon: overlay.querySelector('svg')?.getAttribute('data-icon') ?? null };
    };
    const record = () => {
      const current = shown();
      if (JSON.stringify(current) !== JSON.stringify(history.at(-1) ?? null)) history.push(current);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-icon'],
    });
  });
}

async function feedbackHistory(page: Page) {
  return page.evaluate(() => window.feedbackHistory ?? []);
}

/** What the feedback overlay shows now (null if nothing). */
export async function shownFeedback(page: Page) {
  return (await feedbackHistory(page)).at(-1) ?? null;
}

export async function expectFeedback(page: Page, text: string, icon: string | null) {
  await expect.poll(() => shownFeedback(page), { message: 'feedback overlay' }).toEqual({ text, icon });
  // The recorder and the DOM agree
  await expect(page.locator('.FeedbackOverlay:not(.fade-out)')).toHaveText(text);
}

/** Expect the feedback overlay to be gone, and to stay gone for a while (it once got stuck after gestures). */
export async function expectFeedbackGone(page: Page, { for: ms = 750 }: { for?: number } = {}) {
  await expect.poll(() => shownFeedback(page), { message: 'feedback overlay' }).toBeNull();
  await expect(page.locator('.FeedbackOverlay:not(.fade-out)')).toHaveCount(0);
  const since = (await feedbackHistory(page)).length;
  await page.waitForTimeout(ms);
  expect((await feedbackHistory(page)).slice(since), 'feedback shown after it had gone').toEqual([]);
}

/** Run `action` and return the feedback shown while it ran (and for a moment after), in order. */
export async function feedbackShownDuring(page: Page, action: () => Promise<unknown>, { settle = 400 } = {}) {
  const since = (await feedbackHistory(page)).length;
  await action();
  await page.waitForTimeout(settle);
  return (await feedbackHistory(page)).slice(since).filter((feedback) => feedback !== null);
}

/* ------------------------------- Thumbnails ------------------------------- */

/** Whether the progress bar's thumbnail preview (Stash's VTT thumbnails plugin) is showing on the current slide. */
export async function thumbnailShowing(page: Page) {
  return currentSlide(page)
    .locator('.vjs-vtt-thumbnail-display')
    .evaluate((holder: HTMLElement) => holder.style.opacity === '1');
}
