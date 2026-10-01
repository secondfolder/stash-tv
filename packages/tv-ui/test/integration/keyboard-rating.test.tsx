/**
 * Keyboard rating shortcut integration tests.
 *
 * Every rendered MediaSlide calls `useKeyboardRating`, but only the current
 * slide may bind the keys — these tests boot feeds with several slides in the
 * DOM and check the rating lands on the current item's scene (markers rate
 * their parent scene) and nowhere else.
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, type BootedApp } from "./helpers/harness";

const integration = setupIntegrationTest();

// The server store outlives each test, so restore every scene's rating afterwards
let initialRatings: Map<string, number | null>;
beforeEach(() => {
  initialRatings = new Map(
    [...integration.server.store.scenes.values()].map((scene) => [scene.id, scene.rating100])
  );
});
afterEach(async () => {
  for (const [id, rating] of initialRatings) {
    const scene = integration.server.store.scenes.get(id);
    if (scene) scene.rating100 = rating;
  }
  // Stash's keybinds leave the digit keys bound for 1s after `r` and then unbind them on a timer. Mousetrap is a
  // single (externalised) module shared by every boot, so wait that window out rather than let a stale timer
  // unbind keys belonging to the next test's app.
  await new Promise((resolve) => setTimeout(resolve, 1100));
});

function slides(app: BootedApp) {
  return [...app.rendered.container.querySelectorAll<HTMLElement>('[data-testid="MediaSlide--container"]')];
}

function currentSlide(app: BootedApp) {
  const current = slides(app).filter((slide) => slide.dataset.currentVideo === "true");
  expect(current).toHaveLength(1);
  return current[0];
}

function sceneIdOf(slide: HTMLElement) {
  const sceneId = slide.dataset.sceneId;
  if (!sceneId) throw new Error("MediaSlide is missing data-scene-id");
  return sceneId;
}

function serverRating(sceneId: string) {
  return integration.server.store.scenes.get(sceneId)?.rating100;
}

/** Scene ids of every rendered slide other than the current one, which must not change rating. */
function otherRenderedSceneIds(app: BootedApp, currentSceneId: string) {
  const others = [...new Set(slides(app).map(sceneIdOf))].filter((id) => id !== currentSceneId);
  // The test is only meaningful when other slides (and other scenes) are mounted alongside the current one
  expect(others.length).toBeGreaterThan(0);
  return others;
}

async function goToNextSlide(app: BootedApp) {
  const previousIndex = currentSlide(app).dataset.index;
  await userEvent.keyboard("{ArrowDown}");
  await waitFor(() => expect(currentSlide(app).dataset.index).not.toBe(previousIndex));
}

async function bootMarkersFeed() {
  // Boot once to switch the configured filter to fixture filter "3" ("All Markers", sorted by scene),
  // then boot fresh so the feed loads it
  const first = await bootApp();
  const { useTvConfig } = await import("../../src/store/tvConfig");
  await act(async () => {
    useTvConfig.getState().set("currentFilterId", "3");
  });
  await first.unmount();
  return await bootApp("Intro");
}

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

  it("unsets the current scene's rating with r 0", async () => {
    // Fixture scene-2 is the only pre-rated scene; rate the current one first so there's something to unset
    const app = await bootApp();
    const currentSceneId = sceneIdOf(currentSlide(app));
    await userEvent.keyboard("r5");
    await waitFor(() => expect(serverRating(currentSceneId)).toBe(100));
    // Let the first sequence's digit window close so `0` starts a fresh sequence
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await userEvent.keyboard("r0");

    await waitFor(() => expect(serverRating(currentSceneId)).toBeNull());

    await app.unmount();
  });

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

    const firstSequenceStart = Date.now();
    await userEvent.keyboard("r45");
    await waitFor(() => expect(serverRating(currentSceneId)).toBe(45));
    // Start the second sequence shortly before the first one's timeout and finish it shortly after
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 850 - (Date.now() - firstSequenceStart))));
    expect(Date.now() - firstSequenceStart).toBeLessThan(950);
    await userEvent.keyboard("r7");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.keyboard("2");

    await waitFor(() => expect(serverRating(currentSceneId)).toBe(72));

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

    const firstSequenceStart = Date.now();
    await userEvent.keyboard("r45");
    await waitFor(() => expect(serverRating(firstSceneId)).toBe(45));
    await goToNextSlide(app);
    const secondSceneId = sceneIdOf(currentSlide(app));
    expect(secondSceneId).not.toBe(firstSceneId);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 850 - (Date.now() - firstSequenceStart))));
    expect(Date.now() - firstSequenceStart).toBeLessThan(950);
    await userEvent.keyboard("r7");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.keyboard("2");

    await waitFor(() => expect(serverRating(secondSceneId)).toBe(72));
    expect(serverRating(firstSceneId)).toBe(45);

    await app.unmount();
  });

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
