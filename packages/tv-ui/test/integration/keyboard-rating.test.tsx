/**
 * Keyboard rating shortcut integration tests.
 *
 * Every rendered MediaSlide calls `useKeyboardRating`, but only the current
 * slide may bind the keys — these tests boot feeds with several slides in the
 * DOM and check the rating lands on the current item's scene (markers rate
 * their parent scene) and nowhere else.
 *
 * Ratings typed one after another and ratings on marker slides are tested in files of their own, so they run in
 * parallel.
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */

import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bootApp } from "./helpers/harness";
import { currentSlide, goToNextSlide, goToSlide, sceneIdOf, slides } from "./helpers/feed";
import { setupKeyboardRatingTest, endRatingWindows, initialRatings, serverRating, otherRenderedSceneIds, bootWithRateButtonPinned, displayedRating } from "./helpers/keyboard-rating";

setupKeyboardRatingTest();

describe("Keyboard rating shortcuts", () => {
  it("rates only the current scene when several scene slides are rendered", async () => {
    const app = await bootApp();
    expect(slides(app).length).toBeGreaterThan(1);
    const currentSceneId = sceneIdOf(currentSlide(app));
    const others = otherRenderedSceneIds(app, currentSceneId);

    await userEvent.keyboard("r4");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(80));
    for (const id of others) {
      expect(serverRating(id)).toBe(initialRatings.get(id));
    }

    await app.unmount();
  });

  it("rates the new current scene after moving to the next slide", async () => {
    const app = await bootApp();
    const firstSceneId = sceneIdOf(currentSlide(app));
    await goToNextSlide(app);
    const secondSceneId = sceneIdOf(currentSlide(app));
    expect(secondSceneId).not.toBe(firstSceneId);

    await userEvent.keyboard("r2");

    await waitFor(() => expect(serverRating(secondSceneId)).toBe(40));
    expect(serverRating(firstSceneId)).toBe(initialRatings.get(firstSceneId));

    await app.unmount();
  });

  it("shows the new rating on the current slide", async () => {
    const app = await bootWithRateButtonPinned();
    const currentSceneId = sceneIdOf(currentSlide(app));

    await userEvent.keyboard("r4");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(80));
    await waitFor(() => expect(displayedRating(app)).toBe("4"));

    await app.unmount();
  });

  // Pages are fetched once and never watched, so a slide from a later page must still pick up the rating mutation's
  // cache update.
  // @see docs/media-loading.md § "Live item data"
  it("shows the new rating on a slide loaded from a later page", async () => {
    const app = await bootWithRateButtonPinned();
    // Default page size is 5, so the sixth slide comes from page 2
    await goToSlide(app, 5);
    const currentSceneId = sceneIdOf(currentSlide(app));

    await userEvent.keyboard("r4");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(80));
    await waitFor(() => expect(displayedRating(app)).toBe("4"));

    await app.unmount();
  });

  it("unsets the current scene's rating with r 0", async () => {
    // Fixture scene-2 is the only pre-rated scene; rate the current one first so there's something to unset
    const app = await bootApp();
    const currentSceneId = sceneIdOf(currentSlide(app));
    await userEvent.keyboard("r5");
    await waitFor(() => expect(serverRating(currentSceneId)).toBe(100));
    // Close the first sequence's digit window so `0` starts a fresh sequence
    expect(endRatingWindows()).toBe(1);

    await userEvent.keyboard("r0");

    await waitFor(() => expect(serverRating(currentSceneId)).toBeNull());

    await app.unmount();
  });
});
