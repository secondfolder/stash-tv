/**
 * Stream rewriting integration tests.
 *
 * Turning on the preview-only mode for scenes makes the current slide play its scene's preview, posing as the direct
 * stream — observable through the dev-options `window.tvCurrentMediaItem` export (the item the current slide is
 * playing). How an item is rewritten is unit tested (test/unit/helpers/makeMediaItemPreviewOnly.test.ts).
 *
 * @see docs/media-loading.md § "Preview-only modes"
 * @see docs/video-player.md § "Source Selection"
 */

import { describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";
import type { MediaItem } from "../../src/hooks/useMediaItems";

const integration = setupIntegrationTest();

function currentSceneItem(): Extract<MediaItem, { entityType: "scene" }> {
  const item = window.tvCurrentMediaItem;
  if (item?.entityType !== "scene") throw new Error("The current slide isn't showing a scene");
  return item;
}

describe("Stream rewriting integration", () => {
  it("scenePreviewOnly rewrites scene streams to a single Direct stream", async () => {
    const app = await bootApp();

    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    // Dev options expose window.tvCurrentMediaItem
    await act(async () => {
      setTvConfig("showDevOptions", true);
    });
    await act(async () => {
      setTvConfig("scenePreviewOnly", true);
    });

    await waitFor(
      () => {
        const item = currentSceneItem();
        // The only available stream is the preview, masquerading as a direct stream
        expect(item.entity.sceneStreams).toHaveLength(1);
        expect(item.entity.sceneStreams[0].label).toBe("Direct stream");
        expect(item.entity.sceneStreams[0].url).toBe(item.entity.paths.preview);
      },
      { timeout: 5000 }
    );

    await app.unmount();
  });
});
