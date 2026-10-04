/**
 * Keyboard rating shortcuts on marker slides, which rate the marker's scene.
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */

import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { currentSlide, goToNextSlide, sceneIdOf, slides, bootMarkersFeed } from "./helpers/feed";
import { setupKeyboardRatingTest, initialRatings, serverRating, otherRenderedSceneIds } from "./helpers/keyboard-rating";

setupKeyboardRatingTest();

describe("Keyboard rating shortcuts", () => {
  it("applies two ratings set one after the other on a marker's scene", async () => {
    const app = await bootMarkersFeed();
    const currentSceneId = sceneIdOf(currentSlide(app));

    await userEvent.keyboard("r5");
    await waitFor(() => expect(serverRating(currentSceneId)).toBe(100));
    await userEvent.keyboard("r1");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(20));

    await app.unmount();
  });

  it("rates the current marker's parent scene and no other rendered scene", async () => {
    const app = await bootMarkersFeed();
    expect(slides(app).length).toBeGreaterThan(1);
    // Fixture markers sorted by scene: marker-1 and marker-2 belong to scene-1, then scene-2's markers follow
    const currentSceneId = sceneIdOf(currentSlide(app));
    expect(currentSceneId).toBe("scene-1");
    const others = otherRenderedSceneIds(app, currentSceneId);

    await userEvent.keyboard("r3");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(60));
    for (const id of others) {
      expect(serverRating(id)).toBe(initialRatings.get(id));
    }

    await app.unmount();
  });

  it("rates the new current marker's scene after moving past the previous scene's markers", async () => {
    const app = await bootMarkersFeed();
    const firstSceneId = sceneIdOf(currentSlide(app));
    // Two markers per scene in the fixtures, so two steps lands on the next scene's first marker
    await goToNextSlide(app);
    await goToNextSlide(app);
    const laterSceneId = sceneIdOf(currentSlide(app));
    expect(laterSceneId).not.toBe(firstSceneId);

    await userEvent.keyboard("r1");

    await waitFor(() => expect(serverRating(laterSceneId)).toBe(20));
    expect(serverRating(firstSceneId)).toBe(initialRatings.get(firstSceneId));

    await app.unmount();
  });
});
