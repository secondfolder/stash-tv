import { getLogger } from "@logtape/logtape";
import { defaultMarkerLength, MediaItem } from "./mediaItem";

const logger = getLogger(["stash-tv", "makeMediaItemPreviewOnly"]);

/**
 * Modifying the ScenePlayer to handle playing only a scene's preview would be a lot of work and would involve a lot of
 * complexity to maintain since it would break many existing assumptions. Instead we take the slightly hacky but much
 * simpler approach of modifying the scene data itself so that ScenePlayer thinks it's just a normal scene but the only
 * available stream is the preview.
 *
 * @param previewLength the preview video's real length if known yet (see usePreviewLengths), otherwise it's estimated
 */
export function makeMediaItemPreviewOnly(
  mediaItem: MediaItem,
  {previewLength, previewSegmentDuration = 0.75, previewSegments = 12}: {
    previewLength?: number,
    previewSegmentDuration?: number,
    previewSegments?: number,
  },
): MediaItem {
  let previewUrl
  if (mediaItem.entityType === "scene") {
    previewUrl = mediaItem.entity.paths.preview
  } else if (mediaItem.entityType === "marker") {
    previewUrl = mediaItem.entity.stream
  } else {
    mediaItem satisfies never
    throw new Error("Unsupported media item entity type")
  }
  if (!previewUrl) {
    logger.warn(`Media item ${mediaItem.id} has no preview`)
    return mediaItem
  }
  const scene = mediaItem.entityType === "marker" ? mediaItem.entity.scene : mediaItem.entity
  const estimatedDuration = mediaItem.entityType === "marker"
    ? Math.min(defaultMarkerLength, scene.files[0].duration)
    : Math.min(previewSegmentDuration * previewSegments, scene.files[0].duration)
  const updatedScene = {
    ...scene,
    sceneStreams: [
      {
        "url": previewUrl,
        "mime_type": "video/mp4",
        "label": "Direct stream",
        "__typename": "SceneStreamEndpoint" as const
      }
    ],
    files: [
      {
        ...scene.files[0],
        duration: previewLength ?? estimatedDuration,
      },
      ...scene.files.slice(1)
    ],
    resume_time: null,
    captions: null,
    scene_markers: [],
  }

  if (mediaItem.entityType === "scene") {
    return {
      ...mediaItem,
      entity: updatedScene
    }
  } else {
    return {
      ...mediaItem,
      entity: {
        ...mediaItem.entity,
        scene: updatedScene
      }
    }
  }
}
