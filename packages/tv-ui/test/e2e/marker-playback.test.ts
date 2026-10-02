import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * E2E tests: marker slides play only their marker, never the part of the scene before it.
 *
 * Markers play the full scene's stream with an offset, so what matters is which frames the browser actually shows.
 * jsdom has no media playback, so this is only testable here.
 *
 * @see docs/video-player.md § "Start position"
 */

async function graphql(request: APIRequestContext, query: string, variables: Record<string, unknown> = {}) {
  const response = await request.post('/graphql', { data: { query, variables } });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  return body.data;
}

/**
 * Replace the persisted tvConfig (stored in Stash's plugin config, see docs/state-and-config.md), with the first-run
 * guide overlay dismissed so it doesn't cover the page. `null` resets the config to defaults.
 */
async function setTvConfig(request: APIRequestContext, state: Record<string, unknown> | null) {
  const input = state ? { 'app-state': JSON.stringify({ state: { ...state, showGuideOverlay: false }, version: 2 }) } : {};
  await graphql(request, 'mutation ($input: Map!) { configurePlugin(plugin_id: "stash-tv", input: $input) }', { input });
}

type ShownFrame = { video: number, mediaTime: number, markerStart: number | undefined };

test.describe('Marker playback', () => {
  test.afterEach(async ({ request }) => setTvConfig(request, null));

  test('starts each marker at its start, without showing the scene before it', async ({ page, request }) => {
    await setTvConfig(request, { currentFilterId: '3' }); // The "All Markers" fixture filter

    // Record each frame every <video> shows, as its position in the scene's file, alongside the start of the marker
    // the player is playing (videojs-offset's start offset). Frames painted while the video is hidden aren't seen.
    await page.addInitScript(() => {
      const shownFrames: ShownFrame[] = [];
      Object.assign(window, { shownFrames });
      const watched = new Set<HTMLVideoElement>();
      const watch = (video: HTMLVideoElement) => {
        if (watched.has(video)) return;
        const index = watched.size;
        watched.add(video);
        const onFrame: VideoFrameRequestCallback = (_now, { mediaTime }) => {
          // Video.js keeps its player on the player element, with videojs-offset's start offset on it
          const playerElm = video.closest('.video-js');
          const player = playerElm && 'player' in playerElm ? playerElm.player : undefined;
          const markerStart = typeof player === 'object' && player !== null && '_offsetStart' in player && typeof player._offsetStart === 'number'
            ? player._offsetStart
            : undefined;
          if (getComputedStyle(video).opacity !== '0') {
            shownFrames.push({ video: index, mediaTime, markerStart });
          }
          video.requestVideoFrameCallback(onFrame);
        };
        video.requestVideoFrameCallback(onFrame);
      };
      new MutationObserver(() => document.querySelectorAll('video').forEach(watch))
        .observe(document, { childList: true, subtree: true });
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="MediaSlide--container"]').first()).toBeVisible({ timeout: 10000 });

    // Covers both the first slide, playing as soon as it loads, and slides preloaded before becoming current
    const markersToPlay = 3;
    const getShownFrames = () => page.evaluate(() => (window as unknown as { shownFrames: ShownFrame[] }).shownFrames);
    for (let played = 1; played <= markersToPlay; played++) {
      await expect.poll(async () => new Set((await getShownFrames()).map(frame => frame.video)).size).toBeGreaterThanOrEqual(played);
      await page.waitForTimeout(1000); // Let the marker play for a bit
      if (played < markersToPlay) await page.keyboard.press('ArrowDown');
    }

    const shownFrames = await getShownFrames();
    expect(shownFrames.every(frame => frame.markerStart !== undefined), 'all slides are marker clips').toBe(true);
    // A little leeway since the frame shown at the start is the one at or just before the marker start
    const framesBeforeMarker = shownFrames.filter(frame => frame.mediaTime < (frame.markerStart ?? 0) - 0.1);
    expect(framesBeforeMarker, 'frames shown from before the marker start').toEqual([]);
  });
});
