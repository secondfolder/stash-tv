import type { MediaItem } from "../../../src/hooks/useMediaItems";

type Scene = Extract<MediaItem, { entityType: "scene" }>["entity"];
type Marker = Extract<MediaItem, { entityType: "marker" }>["entity"];

/** Some of a record's fields, by their names, with values only as complete as a test needs */
type SomeFields<Record> = { [Field in keyof Record]?: unknown };

/**
 * A scene media item for code that only reads a few of its fields: the given fields, with the rest left out. The one
 * cast in it stands in for the many fields of Stash's scene that a unit test doesn't need.
 */
export function sceneMediaItem(scene: SomeFields<Scene> = {}): MediaItem {
  const entity = { id: "scene-1", title: "A scene", captions: null, scene_markers: [], tags: [], ...scene };
  return { id: String(entity.id), entityType: "scene", entity: entity as unknown as Scene };
}

/** A marker media item for code that only reads a few of its fields (see `sceneMediaItem`) */
export function markerMediaItem(marker: SomeFields<Omit<Marker, "scene">> & { scene: SomeFields<Scene> }): MediaItem {
  const entity = { id: "marker-1", title: "A marker", seconds: 0, ...marker };
  return { id: String(entity.id), entityType: "marker", entity: entity as unknown as Marker };
}
