import type { MockContext } from "../context";
import type { MarkerRecord, SceneRecord, StudioRecord, TagRecord } from "../types";

/**
 * Field resolvers for entity types whose values are computed (URLs, counts, relations).
 * Plain data fields on the records are served by GraphQL's default resolver.
 */

export function sceneStreamEndpoints(scene: SceneRecord, baseUrl: string) {
  // Label vocabulary and URL shapes verified against real Stash v0.28.1
  // (test/conformance): for small/original-resolution sources the transcode labels
  // carry no resolution suffix and URLs use ?resolution=ORIGINAL.
  return [
    { url: `${baseUrl}/scene/${scene.id}/stream`, mime_type: "video/mp4", label: "Direct stream" },
    { url: `${baseUrl}/scene/${scene.id}/stream.mp4?resolution=ORIGINAL`, mime_type: "video/mp4", label: "MP4" },
    { url: `${baseUrl}/scene/${scene.id}/stream.webm?resolution=ORIGINAL`, mime_type: "video/webm", label: "WEBM" },
    { url: `${baseUrl}/scene/${scene.id}/stream.m3u8?resolution=ORIGINAL`, mime_type: "application/vnd.apple.mpegurl", label: "HLS" },
    { url: `${baseUrl}/scene/${scene.id}/stream.mpd?resolution=ORIGINAL`, mime_type: "application/dash+xml", label: "DASH" },
  ];
}

export const entityResolvers = {
  Scene: {
    // o_counter is derived from history, matching real Stash v0.28
    o_counter: (scene: { o_history: string[] }) => scene.o_history.length,
    paths: (scene: SceneRecord, _args: unknown, ctx: MockContext) => ({
      screenshot: `${ctx.baseUrl}/scene/${scene.id}/screenshot`,
      preview: `${ctx.baseUrl}/scene/${scene.id}/preview`,
      stream: `${ctx.baseUrl}/scene/${scene.id}/stream`,
      webp: `${ctx.baseUrl}/scene/${scene.id}/webp`,
      vtt: `${ctx.baseUrl}/scene/${scene.id}_thumbs.vtt`,
      sprite: `${ctx.baseUrl}/scene/${scene.id}/sprite`,
      funscript: null,
      interactive_heatmap: null,
      caption: `${ctx.baseUrl}/scene/${scene.id}/caption`,
    }),
    sceneStreams: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      sceneStreamEndpoints(scene, ctx.baseUrl),
    scene_markers: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      [...ctx.store.markers.values()]
        .filter((m) => m.scene_id === scene.id)
        .sort((a, b) => a.seconds - b.seconds),
    tags: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      scene.tag_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null),
    performers: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      scene.performer_ids.map((id) => ctx.store.performers.get(id)).filter((p) => p != null),
    studio: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      scene.studio_id ? ctx.store.studios.get(scene.studio_id) ?? null : null,
    galleries: () => [],
    groups: () => [],
    movies: () => [],
    stash_ids: () => [],
  },

  SceneMarker: {
    scene: (marker: MarkerRecord, _args: unknown, ctx: MockContext) => ctx.store.scenes.get(marker.scene_id),
    primary_tag: (marker: MarkerRecord, _args: unknown, ctx: MockContext) => ctx.store.tags.get(marker.primary_tag_id),
    tags: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      marker.tag_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null),
    stream: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/marker/${marker.id}/stream`,
    preview: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/marker/${marker.id}/preview`,
    screenshot: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/marker/${marker.id}/screenshot`,
  },

  Tag: {
    parents: (tag: TagRecord, _args: unknown, ctx: MockContext) =>
      tag.parent_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null),
    children: (tag: TagRecord, _args: unknown, ctx: MockContext) =>
      tag.child_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null),
    // As Stash's, marked as its default image when the tag has none of its own
    image_path: (tag: TagRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/tag/${tag.id}/image${tag.has_image ? "" : "?default=true"}`,
    favorite: () => false,
    ignore_auto_tag: () => false,
    scene_count: (tag: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()].filter((s) => s.tag_ids.includes(tag.id)).length,
    scene_marker_count: (tag: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.markers.values()].filter(
        (m) => m.primary_tag_id === tag.id || m.tag_ids.includes(tag.id),
      ).length,
    image_count: () => 0,
    gallery_count: () => 0,
    performer_count: () => 0,
    studio_count: () => 0,
    group_count: () => 0,
    movie_count: () => 0,
    parent_count: (tag: { parent_ids: string[] }) => tag.parent_ids.length,
    child_count: (tag: { child_ids: string[] }) => tag.child_ids.length,
  },

  Performer: {
    scenes: () => [],
    tags: () => [],
    stash_ids: () => [],
    groups: () => [],
    movies: () => [],
    alias_list: (performer: { aliases?: string[] }) => performer.aliases ?? [],
    favorite: () => false,
    ignore_auto_tag: () => false,
    urls: () => [],
    image_path: (performer: { id: string }, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/performer/${performer.id}/image`,
    o_counter: () => 0,
    scene_count: (performer: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()].filter((s) => s.performer_ids.includes(performer.id)).length,
    image_count: () => 0,
    gallery_count: () => 0,
    group_count: () => 0,
    movie_count: () => 0,
    performer_count: () => 0,
    custom_fields: () => ({}),
  },

  Studio: {
    child_studios: (studio: StudioRecord, _args: unknown, ctx: MockContext) =>
      [...ctx.store.studios.values()].filter((s) => s.parent_studio_id === studio.id),
    parent_studio: (studio: StudioRecord, _args: unknown, ctx: MockContext) =>
      studio.parent_studio_id ? ctx.store.studios.get(studio.parent_studio_id) ?? null : null,
    aliases: () => [],
    tags: () => [],
    ignore_auto_tag: () => false,
    stash_ids: () => [],
    favorite: () => false,
    groups: () => [],
    movies: () => [],
    image_path: (studio: { id: string }, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/studio/${studio.id}/image`,
    scene_count: (studio: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()].filter((s) => s.studio_id === studio.id).length,
    image_count: () => 0,
    gallery_count: () => 0,
    performer_count: () => 0,
    group_count: () => 0,
    movie_count: () => 0,
  },

  SavedFilter: {
    // Saved filter records store find_filter/object_filter/ui_options directly; the
    // deprecated `filter` JSON string field is always empty (matching modern Stash).
    filter: () => "",
  },

  Job: {
    // pass-through record
  },
};
