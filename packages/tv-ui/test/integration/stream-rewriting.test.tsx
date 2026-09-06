/**
 * Stream rewriting integration tests.
 *
 * Tests the preview-only mode where scene data is rewritten so the only
 * available stream is the scene preview ("Direct stream") with an estimated
 * duration — observable through the dev-options `window.mediaItems` export.
 *
 * @see docs/media-loading.md § "Preview-only modes"
 * @see docs/video-player.md § "Stream labels"
 */

import { describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";
import type { MediaItem } from "../../src/hooks/useMediaItems";

const integration = setupIntegrationTest();

function sceneItems(): Extract<MediaItem, { entityType: "scene" }>[] {
  const items = window.mediaItems ?? [];
  return items.filter(
    (item): item is Extract<MediaItem, { entityType: "scene" }> => item.entityType === "scene"
  );
}

describe("Stream rewriting integration", () => {
  it("scenePreviewOnly rewrites scene streams to a single Direct stream", async () => {
    const app = await bootApp();

    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    // Dev options expose window.mediaItems (the final, transformed item list)
    await act(async () => {
      setTvConfig("showDevOptions", true);
    });
    await act(async () => {
      setTvConfig("scenePreviewOnly", true);
    });

    await waitFor(
      () => {
        const items = sceneItems();
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          // The only available stream is the preview, masquerading as a direct stream
          expect(item.entity.sceneStreams).toHaveLength(1);
          expect(item.entity.sceneStreams[0].label).toBe("Direct stream");
          expect(item.entity.sceneStreams[0].url).toBe(item.entity.paths.preview);
        }
      },
      { timeout: 5000 }
    );

    // Duration is estimated from the preview segment config until real metadata
    // loads (fixtures: 12s scene, 12 × 0.75s segments → 9s estimate)
    const [first] = sceneItems();
    expect(first.entity.files[0].duration).toBe(9);
    // Playback-affecting fields that preview mode must neutralise
    expect(first.entity.resume_time).toBeNull();
    expect(first.entity.scene_markers).toEqual([]);

    await app.unmount();
  });
});
