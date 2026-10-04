/**
 * Preview-only modes rewrite a media item so that the only stream Stash's player is offered is its preview, posing as
 * the direct stream.
 *
 * @see docs/media-loading.md § "Preview-only modes"
 */

import { describe, expect, it } from "vitest";
import { makeMediaItemPreviewOnly } from "../../../src/helpers/makeMediaItemPreviewOnly";
import { defaultMarkerLength } from "../../../src/helpers/mediaItem";
import { markerMediaItem, sceneMediaItem } from "./mediaItems";

const PREVIEW = "https://stash.test/scene/1/preview";
const STREAM = "https://stash.test/scene/1/stream";

function scene(duration: number) {
  return {
    paths: { preview: PREVIEW },
    sceneStreams: [{ url: STREAM, mime_type: "video/mp4", label: "Direct stream", __typename: "SceneStreamEndpoint" as const }],
    files: [{ duration }],
    resume_time: 30,
    captions: [{ language_code: "en", caption_type: "vtt" }],
    scene_markers: [{ id: "marker-1" }],
  };
}

/** The rewritten item's scene: a scene item's own, or a marker's */
function sceneOf(item: ReturnType<typeof makeMediaItemPreviewOnly>) {
  return item.entityType === "scene" ? item.entity : item.entity.scene;
}

describe("makeMediaItemPreviewOnly", () => {
  it("offers a scene's preview as its only stream, posing as the direct stream", () => {
    const item = makeMediaItemPreviewOnly(sceneMediaItem(scene(600)), {});

    expect(sceneOf(item).sceneStreams).toEqual([
      { url: PREVIEW, mime_type: "video/mp4", label: "Direct stream", __typename: "SceneStreamEndpoint" },
    ]);
  });

  it("estimates the preview's length from Stash's preview segments, no longer than the scene", () => {
    // 12 segments of 0.75s by default
    expect(sceneOf(makeMediaItemPreviewOnly(sceneMediaItem(scene(600)), {})).files[0].duration).toBe(9);
    expect(sceneOf(makeMediaItemPreviewOnly(sceneMediaItem(scene(600)), { previewSegmentDuration: 2, previewSegments: 5 })).files[0].duration).toBe(10);
    expect(sceneOf(makeMediaItemPreviewOnly(sceneMediaItem(scene(4)), {})).files[0].duration).toBe(4);
  });

  it("takes the preview's real length once it's known", () => {
    expect(sceneOf(makeMediaItemPreviewOnly(sceneMediaItem(scene(600)), { previewLength: 7.5 })).files[0].duration).toBe(7.5);
  });

  it("leaves out what doesn't apply to the preview: where to resume, captions and markers", () => {
    const rewritten = sceneOf(makeMediaItemPreviewOnly(sceneMediaItem(scene(600)), {}));

    expect(rewritten.resume_time).toBeNull();
    expect(rewritten.captions).toBeNull();
    expect(rewritten.scene_markers).toEqual([]);
  });

  it("offers a marker's own stream as its scene's only stream, estimating it as long as a marker is by default", () => {
    const markerStream = "https://stash.test/scene/1/scene_marker/1/stream";
    const item = makeMediaItemPreviewOnly(markerMediaItem({ stream: markerStream, scene: scene(600) }), {});

    expect(item.entityType).toBe("marker");
    expect(sceneOf(item).sceneStreams.map((stream) => stream.url)).toEqual([markerStream]);
    expect(sceneOf(item).files[0].duration).toBe(defaultMarkerLength);
  });

  it("leaves an item without a preview as it is", () => {
    const item = sceneMediaItem({ ...scene(600), paths: { preview: null } });

    expect(makeMediaItemPreviewOnly(item, {})).toBe(item);
  });
});
