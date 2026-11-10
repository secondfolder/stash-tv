import { createDefaultFixtures } from "./fixtures";
import { stashGql, type RealStash } from "./real-stash";
import type { Fixtures } from "./types";
import { IdMap, translateFilterIds } from "./id-map";

export { IdMap, ENTITY_TYPES, translateFilterIds, type EntityType } from "./id-map";

/**
 * Seeding a real Stash with mock-stash's fixtures, so the two hold the same data: for the conformance tests, which
 * compare them, and for the seeded Stash to develop against (`yarn stash:dev`). See docs/testing-mock-stash.md.
 *
 * The Stash must be set up and scanned with the fixtures' media (as `startRealStash()` leaves it), which gives it the
 * scenes. Everything else is created, and the scenes given their details, through Stash's own API.
 */

type StashLike = Pick<RealStash, "graphqlUrl">;

export async function seedRealStash(stash: StashLike, fixtures: Fixtures = createDefaultFixtures()): Promise<IdMap> {
  const ids = new IdMap();
  const gql = (query: string, variables?: Record<string, unknown>) => stashGql(stash, query, variables);

  for (const tag of fixtures.tags) {
    const data = await gql(`mutation($input: TagCreateInput!) { tagCreate(input: $input) { id } }`, {
      input: { name: tag.name, aliases: tag.aliases },
    });
    ids.set("Tag", tag.id, (data.tagCreate as { id: string }).id);
  }
  for (const tag of fixtures.tags.filter((tag) => tag.parent_ids.length > 0)) {
    await gql(`mutation($input: TagUpdateInput!) { tagUpdate(input: $input) { id } }`, {
      input: { id: ids.real("Tag", tag.id), parent_ids: tag.parent_ids.map((id) => ids.real("Tag", id)) },
    });
  }

  // Parents first, as a studio is created with its parent
  const studios = [...fixtures.studios];
  while (studios.length > 0) {
    const index = studios.findIndex((studio) => !studio.parent_studio_id || ids.has("Studio", studio.parent_studio_id));
    if (index === -1) throw new Error(`Studios whose parents don't exist: ${studios.map((studio) => studio.id).join(", ")}`);
    const [studio] = studios.splice(index, 1);
    const data = await gql(`mutation($input: StudioCreateInput!) { studioCreate(input: $input) { id } }`, {
      input: {
        name: studio.name,
        urls: studio.url ? [studio.url] : [],
        parent_id: studio.parent_studio_id ? ids.real("Studio", studio.parent_studio_id) : null,
      },
    });
    ids.set("Studio", studio.id, (data.studioCreate as { id: string }).id);
  }

  for (const performer of fixtures.performers) {
    const { id, created_at: _createdAt, updated_at: _updatedAt, ...details } = performer;
    const data = await gql(`mutation($input: PerformerCreateInput!) { performerCreate(input: $input) { id } }`, {
      input: details,
    });
    ids.set("Performer", id, (data.performerCreate as { id: string }).id);
  }

  // The scan made a scene for each media file: they're matched to the fixtures by file name
  const scanned = (await gql(`{ findScenes(filter: { per_page: -1 }) { scenes { id files { id basename } } } }`))
    .findScenes as { scenes: { id: string, files: { id: string, basename: string }[] }[] };
  for (const scene of fixtures.scenes) {
    const basename = scene.files[0]?.basename;
    const real = scanned.scenes.find((candidate) => candidate.files[0]?.basename === basename);
    if (!real) throw new Error(`The real Stash has no scene for ${basename} (${scene.id})`);
    ids.set("Scene", scene.id, real.id);
    ids.set("VideoFile", scene.files[0].id, real.files[0].id);
    await gql(`mutation($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }`, {
      input: {
        id: real.id,
        title: scene.title,
        code: scene.code,
        details: scene.details,
        director: scene.director,
        urls: scene.urls,
        date: scene.date,
        rating100: scene.rating100,
        organized: scene.organized,
        studio_id: scene.studio_id ? ids.real("Studio", scene.studio_id) : null,
        tag_ids: scene.tag_ids.map((id) => ids.real("Tag", id)),
        performer_ids: scene.performer_ids.map((id) => ids.real("Performer", id)),
      },
    });
    if (scene.o_history.length > 0) {
      await gql(`mutation($id: ID!, $times: [Timestamp!]) { sceneAddO(id: $id, times: $times) { count } }`, {
        id: real.id, times: scene.o_history,
      });
    }
    if (scene.play_history.length > 0) {
      await gql(`mutation($id: ID!, $times: [Timestamp!]) { sceneAddPlay(id: $id, times: $times) { count } }`, {
        id: real.id, times: scene.play_history,
      });
    }
    if (scene.resume_time || scene.play_duration) {
      await gql(`mutation($id: ID!, $resume_time: Float, $playDuration: Float) { sceneSaveActivity(id: $id, resume_time: $resume_time, playDuration: $playDuration) }`, {
        id: real.id, resume_time: scene.resume_time, playDuration: scene.play_duration,
      });
    }
  }

  for (const marker of fixtures.markers) {
    const data = await gql(`mutation($input: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $input) { id } }`, {
      input: {
        title: marker.title,
        seconds: marker.seconds,
        end_seconds: marker.end_seconds,
        scene_id: ids.real("Scene", marker.scene_id),
        primary_tag_id: ids.real("Tag", marker.primary_tag_id),
        tag_ids: marker.tag_ids.map((id) => ids.real("Tag", id)),
      },
    });
    ids.set("SceneMarker", marker.id, (data.sceneMarkerCreate as { id: string }).id);
  }

  for (const filter of fixtures.savedFilters) {
    const data = await gql(`mutation($input: SaveFilterInput!) { saveFilter(input: $input) { id } }`, {
      input: {
        mode: filter.mode,
        name: filter.name,
        find_filter: filter.find_filter,
        object_filter: translateFilterIds(filter.object_filter, (type, id) => ids.real(type, id)),
        ui_options: filter.ui_options,
      },
    });
    ids.set("SavedFilter", filter.id, (data.saveFilter as { id: string }).id);
  }

  await gql(`mutation($input: Map!) { configureUI(input: $input) }`, { input: translateUiConfig(fixtures.uiConfig, ids) });
  for (const [pluginId, config] of Object.entries(fixtures.pluginConfig)) {
    await gql(`mutation($plugin_id: ID!, $input: Map!) { configurePlugin(plugin_id: $plugin_id, input: $input) }`, {
      plugin_id: pluginId, input: config,
    });
  }

  return ids;
}

/** The UI config, with the default filters (saved filters, as Stash's UI saves them) given the real Stash's ids */
function translateUiConfig(uiConfig: Fixtures["uiConfig"], ids: IdMap): Record<string, unknown> {
  const translated = structuredClone(uiConfig) as Record<string, unknown> & {
    defaultFilters?: Record<string, { id?: string, object_filter?: Record<string, unknown> | null }>
  };
  for (const filter of Object.values(translated.defaultFilters ?? {})) {
    if (filter.id) filter.id = ids.real("SavedFilter", filter.id);
    filter.object_filter = translateFilterIds(filter.object_filter, (type, id) => ids.real(type, id));
  }
  return translated;
}
