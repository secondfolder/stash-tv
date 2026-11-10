import type { MockContext } from "../context";
import type { MarkerRecord, SceneRecord, StudioRecord, TagRecord, PerformerRecord } from "../types";

/** Stash gives an unset text field as "" rather than null */
const text = (field: string) => (record: Record<string, unknown>) => (record[field] as string | null | undefined) ?? "";

const byName = <T extends { name: string }>(records: T[]) =>
  [...records].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

/** As Stash gives them: newest first */
const newestFirst = (times: string[]) => [...times].sort((a, b) => b.localeCompare(a));

/** The file's fingerprint Stash names generated files by */
const oshashOf = (scene: SceneRecord) =>
  scene.files[0]?.fingerprints.find((fingerprint) => fingerprint.type === "oshash")?.value ?? scene.id;

/**
 * Field resolvers for entity types whose values are computed (URLs, counts, relations).
 * Plain data fields on the records are served by GraphQL's default resolver.
 */

/**
 * As Stash's (`GetSceneStreamPaths`): the direct stream, then each transcode at the original resolution, followed by
 * each lower resolution the video is at least as big as (by its smaller side). The fixtures' are all under 480p, so
 * only "Low (240p)" ever applies.
 */
export function sceneStreamEndpoints(scene: SceneRecord, baseUrl: string) {
  const file = scene.files[0];
  const smallerSide = file ? Math.min(file.width, file.height) : 0;
  const resolutions = [{ resolution: "ORIGINAL", label: "" }, ...(smallerSide >= 240 ? [{ resolution: "LOW", label: " Low (240p)" }] : [])];
  const transcodes = [
    { extension: ".mp4", mime_type: "video/mp4", label: "MP4" },
    { extension: ".webm", mime_type: "video/webm", label: "WEBM" },
    { extension: ".m3u8", mime_type: "application/vnd.apple.mpegurl", label: "HLS" },
    { extension: ".mpd", mime_type: "application/dash+xml", label: "DASH" },
  ];
  return [
    { url: `${baseUrl}/scene/${scene.id}/stream`, mime_type: "video/mp4", label: "Direct stream" },
    ...transcodes.flatMap((transcode) => resolutions.map(({ resolution, label }) => ({
      url: `${baseUrl}/scene/${scene.id}/stream${transcode.extension}?resolution=${resolution}`,
      mime_type: transcode.mime_type,
      label: `${transcode.label}${label}`,
    }))),
  ];
}

export const entityResolvers = {
  Scene: {
    // o_counter is derived from history, matching real Stash v0.28
    o_counter: (scene: { o_history: string[] }) => scene.o_history.length,
    o_history: (scene: SceneRecord) => newestFirst(scene.o_history),
    play_history: (scene: SceneRecord) => newestFirst(scene.play_history),
    code: text("code"),
    details: text("details"),
    director: text("director"),
    // As Stash's: the sprite and its thumbnails are named by the file's oshash
    paths: (scene: SceneRecord, _args: unknown, ctx: MockContext) => ({
      screenshot: `${ctx.baseUrl}/scene/${scene.id}/screenshot`,
      preview: `${ctx.baseUrl}/scene/${scene.id}/preview`,
      stream: `${ctx.baseUrl}/scene/${scene.id}/stream`,
      webp: `${ctx.baseUrl}/scene/${scene.id}/webp`,
      vtt: `${ctx.baseUrl}/scene/${oshashOf(scene)}_thumbs.vtt`,
      sprite: `${ctx.baseUrl}/scene/${oshashOf(scene)}_sprite.jpg`,
      funscript: `${ctx.baseUrl}/scene/${scene.id}/funscript`,
      interactive_heatmap: `${ctx.baseUrl}/scene/${scene.id}/interactive_heatmap`,
      caption: `${ctx.baseUrl}/scene/${scene.id}/caption`,
    }),
    sceneStreams: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      sceneStreamEndpoints(scene, ctx.baseUrl),
    scene_markers: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      [...ctx.store.markers.values()]
        .filter((m) => m.scene_id === scene.id)
        .sort((a, b) => a.seconds - b.seconds),
    // As Stash's, by name
    tags: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      byName(scene.tag_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null)),
    performers: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      byName(scene.performer_ids.map((id) => ctx.store.performers.get(id)).filter((p) => p != null)),
    studio: (scene: SceneRecord, _args: unknown, ctx: MockContext) =>
      scene.studio_id ? ctx.store.studios.get(scene.studio_id) ?? null : null,
    galleries: () => [],
    groups: () => [],
    movies: () => [],
    stash_ids: () => [],
    custom_fields: () => ({}),
  },

  SceneMarker: {
    scene: (marker: MarkerRecord, _args: unknown, ctx: MockContext) => ctx.store.scenes.get(marker.scene_id),
    primary_tag: (marker: MarkerRecord, _args: unknown, ctx: MockContext) => ctx.store.tags.get(marker.primary_tag_id),
    tags: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      byName(marker.tag_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null)),
    // As Stash's, under the marker's scene
    stream: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/scene/${marker.scene_id}/scene_marker/${marker.id}/stream`,
    preview: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/scene/${marker.scene_id}/scene_marker/${marker.id}/preview`,
    screenshot: (marker: MarkerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/scene/${marker.scene_id}/scene_marker/${marker.id}/screenshot`,
  },

  Tag: {
    parents: (tag: TagRecord, _args: unknown, ctx: MockContext) =>
      tag.parent_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null),
    children: (tag: TagRecord, _args: unknown, ctx: MockContext) =>
      tag.child_ids.map((id) => ctx.store.tags.get(id)).filter((t) => t != null),
    // As Stash's, marked as its default image when the tag has none of its own
    image_path: (tag: TagRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/tag/${tag.id}/image${tag.has_image ? "" : "?default=true"}`,
    favorite: (tag: TagRecord) => tag.favorite ?? false,
    sort_name: text("sort_name"),
    description: text("description"),
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
    stash_ids: () => [],
    custom_fields: () => ({}),
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
    // As Stash's, marked as its default image when the performer has none of their own
    image_path: (performer: PerformerRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/performer/${performer.id}/image${performer.has_image ? "" : "?default=true"}`,
    details: text("details"),
    disambiguation: text("disambiguation"),
    ethnicity: text("ethnicity"),
    eye_color: text("eye_color"),
    fake_tits: text("fake_tits"),
    hair_color: text("hair_color"),
    measurements: text("measurements"),
    piercings: text("piercings"),
    tattoos: text("tattoos"),
    // As Stash's, the o-count of their scenes
    o_counter: (performer: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()]
        .filter((s) => s.performer_ids.includes(performer.id))
        .reduce((count, s) => count + s.o_history.length, 0),
    scene_count: (performer: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()].filter((s) => s.performer_ids.includes(performer.id)).length,
    image_count: () => 0,
    gallery_count: () => 0,
    group_count: () => 0,
    movie_count: () => 0,
    // As Stash's, how many other performers they appear with
    performer_count: (performer: { id: string }, _args: unknown, ctx: MockContext) => new Set(
      [...ctx.store.scenes.values()]
        .filter((s) => s.performer_ids.includes(performer.id))
        .flatMap((s) => s.performer_ids)
        .filter((id) => id !== performer.id),
    ).size,
    custom_fields: () => ({}),
  },

  Studio: {
    child_studios: (studio: StudioRecord, _args: unknown, ctx: MockContext) =>
      [...ctx.store.studios.values()].filter((s) => s.parent_studio_id === studio.id),
    parent_studio: (studio: StudioRecord, _args: unknown, ctx: MockContext) =>
      studio.parent_studio_id ? ctx.store.studios.get(studio.parent_studio_id) ?? null : null,
    aliases: () => [],
    // Stash replaced url with urls, still giving the first as url
    urls: (studio: StudioRecord) => (studio.url ? [studio.url] : []),
    tags: () => [],
    ignore_auto_tag: () => false,
    stash_ids: () => [],
    favorite: () => false,
    organized: () => false,
    // As Stash's, the o-count of the studio's scenes
    o_counter: (studio: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()]
        .filter((s) => s.studio_id === studio.id)
        .reduce((count, s) => count + s.o_history.length, 0),
    custom_fields: () => ({}),
    groups: () => [],
    movies: () => [],
    // As Stash's, marked as its default image when the studio has none of its own
    image_path: (studio: StudioRecord, _args: unknown, ctx: MockContext) =>
      `${ctx.baseUrl}/studio/${studio.id}/image${studio.has_image ? "" : "?default=true"}`,
    scene_count: (studio: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.scenes.values()].filter((s) => s.studio_id === studio.id).length,
    image_count: () => 0,
    gallery_count: () => 0,
    // As Stash's, the performers in the studio's scenes
    performer_count: (studio: { id: string }, _args: unknown, ctx: MockContext) => new Set(
      [...ctx.store.scenes.values()].filter((s) => s.studio_id === studio.id).flatMap((s) => s.performer_ids),
    ).size,
    group_count: () => 0,
    details: text("details"),
    // As Stash's, markers on the studio's scenes
    scene_marker_count: (studio: { id: string }, _args: unknown, ctx: MockContext) =>
      [...ctx.store.markers.values()].filter((m) => ctx.store.scenes.get(m.scene_id)?.studio_id === studio.id).length,
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
