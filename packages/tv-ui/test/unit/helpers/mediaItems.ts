import type { MediaItem } from "../../../src/hooks/useMediaItems";

type Scene = Extract<MediaItem, { entityType: "scene" }>["entity"];

/**
 * A scene media item for components that only read a few of its fields: the given fields, with the rest left out.
 * The one cast in it stands in for the many fields of Stash's scene that a unit test doesn't need.
 */
export function sceneMediaItem(scene: Partial<Scene> = {}): MediaItem {
  const entity = { id: "scene-1", title: "A scene", captions: null, scene_markers: [], tags: [], ...scene };
  return { id: entity.id, entityType: "scene", entity: entity as Scene };
}
