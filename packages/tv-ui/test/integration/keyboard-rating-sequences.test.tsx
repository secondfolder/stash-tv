/**
 * Keyboard rating shortcuts typed one after another: decimal ratings' two-digit sequences, and the 1s window Stash
 * gives each sequence after its `r`.
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */

import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bootApp } from "./helpers/harness";
import { currentSlide, sceneIdOf } from "./helpers/feed";
import { setupKeyboardRatingTest, initialRatings, freezeClock, ratingsSent, serverRating, otherRenderedSceneIds } from "./helpers/keyboard-rating";

const integration = setupKeyboardRatingTest();

describe("Keyboard rating shortcuts", () => {
  it("uses two-digit sequences when Stash's rating system is decimal", async () => {
    integration.server.store.uiConfig = {
      ...integration.server.store.uiConfig,
      ratingSystemOptions: { type: "decimal", starPrecision: "full" },
    };
    const app = await bootApp();
    const currentSceneId = sceneIdOf(currentSlide(app));
    const others = otherRenderedSceneIds(app, currentSceneId);

    await userEvent.keyboard("r45");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(45));
    for (const id of others) {
      expect(serverRating(id)).toBe(initialRatings.get(id));
    }

    await app.unmount();
  });

  // The second sequence is pressed as soon as the first lands — typically still inside Stash's 1s window where the
  // first `r` left the digit keys bound — so both the re-bind on `r` and the re-render after the first update matter.
  it("applies two star ratings set one after the other", async () => {
    const app = await bootApp();
    const currentSceneId = sceneIdOf(currentSlide(app));

    await userEvent.keyboard("r4");
    await waitFor(() => expect(serverRating(currentSceneId)).toBe(80));
    await userEvent.keyboard("r2");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(40));

    await app.unmount();
  });

  it("applies two decimal ratings set one after the other", async () => {
    integration.server.store.uiConfig = {
      ...integration.server.store.uiConfig,
      ratingSystemOptions: { type: "decimal", starPrecision: "full" },
    };
    const app = await bootApp();
    const currentSceneId = sceneIdOf(currentSlide(app));

    await userEvent.keyboard("r45");
    await waitFor(() => expect(serverRating(currentSceneId)).toBe(45));
    await userEvent.keyboard("r72");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(72));

    await app.unmount();
  });

  // Stash's hook ends a sequence 1s after its `r`. Re-pressing `r` must restart that window — otherwise the first
  // sequence's timeout fires part way through the second one and silently drops it (reproduced against a real
  // Stash instance, where a second rating started 800–950ms after the first always failed).
  it("applies a second rating whose sequence spans the first sequence's 1s timeout", async () => {
    integration.server.store.uiConfig = {
      ...integration.server.store.uiConfig,
      ratingSystemOptions: { type: "decimal", starPrecision: "full" },
    };
    const app = await bootApp();
    const currentSceneId = sceneIdOf(currentSlide(app));
    const user = freezeClock();

    await user.keyboard("r45");
    // Start the second sequence shortly before the first one's timeout and finish it shortly after
    vi.advanceTimersByTime(850);
    await user.keyboard("r7");
    vi.advanceTimersByTime(300);
    await user.keyboard("2");
    vi.useRealTimers();

    // The first rating's round trip couldn't be awaited with the clock frozen, so both updates may be in flight at
    // once and land in either order; what matters is that the second sequence produced one
    await waitFor(() => expect(ratingsSent(currentSceneId)).toEqual([45, 72]));

    await app.unmount();
  });

  // Each slide has its own hook instance but the bindings are global, so a sequence started on the previous slide
  // must not be able to end (unbind) one started on the new slide.
  it("applies a rating on a new slide started within 1s of a rating on the previous slide", async () => {
    integration.server.store.uiConfig = {
      ...integration.server.store.uiConfig,
      ratingSystemOptions: { type: "decimal", starPrecision: "full" },
    };
    const app = await bootApp();
    const firstSceneId = sceneIdOf(currentSlide(app));
    const firstIndex = currentSlide(app).dataset.index;
    const user = freezeClock();

    await user.keyboard("r45");
    // goToNextSlide, but typed with the clock-advancing userEvent. VideoScroller throttles index changes to one per
    // 100ms, so let that window pass for a trailing update to land
    await user.keyboard("{ArrowDown}");
    vi.advanceTimersByTime(100);
    await waitFor(() => expect(currentSlide(app).dataset.index).not.toBe(firstIndex));
    const secondSceneId = sceneIdOf(currentSlide(app));
    expect(secondSceneId).not.toBe(firstSceneId);
    // Start the second sequence shortly before the first one's timeout (850ms in, counting the 100ms above) and
    // finish it shortly after
    vi.advanceTimersByTime(750);
    await user.keyboard("r7");
    vi.advanceTimersByTime(300);
    await user.keyboard("2");
    vi.useRealTimers();

    await waitFor(() => expect(serverRating(secondSceneId)).toBe(72));
    expect(serverRating(firstSceneId)).toBe(45);

    await app.unmount();
  });
});
