import { parse } from "graphql";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import type { ConformanceCase, OperationCase, Step } from "./case";

/**
 * Every conformance case, in the order the session runs them. Each group leaves both servers as it found them, so a
 * later group can rely on the seeded data. Cases use the app's own operations (generated-graphql) wherever the app
 * sends that operation, so what's compared is what the app reads; a hand-written document is only for one it doesn't.
 *
 * `conformance-coverage.test.ts` checks every operation mock-stash implements has a case here.
 *
 * @see docs/testing-mock-stash.md § "Conformance"
 */

const gql = (source: string) => parse(source);

const ALL = { per_page: -1, sort: "title", direction: "ASC" };

/** Reads a scene through the app's own query, to see what a mutation changed */
const readScene = (sceneId: string): Pick<OperationCase, "document" | "variables"> => ({
  document: GQL.FindSceneDocument,
  variables: (id) => ({ id: id("Scene", sceneId) }),
});

const updateScene = (sceneId: string, input: Record<string, unknown>): Step => ({
  document: GQL.SceneUpdateDocument,
  variables: (id) => ({ input: { id: id("Scene", sceneId), ...input } }),
});

/** Puts a scene's o-history back as the fixtures have it (scene-1's) */
const restoreOHistory: Step[] = [
  { document: GQL.SceneResetODocument, variables: (id) => ({ id: id("Scene", "scene-1") }) },
  {
    document: GQL.SceneAddODocument,
    variables: (id) => ({ id: id("Scene", "scene-1"), times: ["2024-03-02T10:00:00Z", "2024-03-03T11:00:00Z"] }),
  },
];

export const CASES: ConformanceCase[] = [
  // ---------------------------------------------------------------------------------------------------------------
  // The seeded data: everything the fixtures hold, read through the app's own queries. These check the seeding before
  // anything relies on it.
  {
    group: "seeded data",
    name: "every scene, with its files, tags, performers, studio and markers",
    document: GQL.FindFullScenesForTvDocument,
    variables: () => ({ filter: ALL }),
  },
  {
    group: "seeded data",
    name: "every marker",
    document: GQL.FindSceneMarkersForTvDocument,
    variables: () => ({ filter: { ...ALL, sort: "scene_id" } }),
  },
  {
    group: "seeded data",
    name: "every tag",
    document: GQL.FindTagsForSelectDocument,
    variables: () => ({ filter: { per_page: -1, sort: "name", direction: "ASC" } }),
  },
  {
    group: "seeded data",
    name: "every saved filter",
    document: GQL.FindSavedFiltersDocument,
    variables: () => ({}),
  },
  {
    group: "seeded data",
    name: "the configuration's UI and plugin settings",
    document: GQL.ConfigurationDocument,
    // The rest is Stash's own settings, which the mock serves defaults for
    project: (data) => ({ ui: data.configuration.ui, plugins: data.configuration.plugins }),
  },

  // ---------------------------------------------------------------------------------------------------------------
  {
    group: "queries",
    name: "findScene",
    ...readScene("scene-2"),
  },
  {
    group: "queries",
    name: "findScenes, filtered by a tag",
    document: GQL.FindFullScenesForTvDocument,
    variables: (id) => ({ filter: ALL, scene_filter: { tags: { value: [id("Tag", "tag-alpha")], modifier: "INCLUDES" } } }),
  },
  {
    group: "queries",
    name: "findScenes, a page at a time",
    document: GQL.FindFullScenesForTvDocument,
    variables: () => ({ filter: { per_page: 3, page: 2, sort: "date", direction: "DESC" } }),
  },
  {
    group: "queries",
    name: "findSceneMarkers, filtered by a tag",
    document: GQL.FindSceneMarkersForTvDocument,
    variables: (id) => ({
      filter: { ...ALL, sort: "scene_id" },
      scene_marker_filter: { tags: { value: [id("Tag", "tag-beta")], modifier: "INCLUDES" } },
    }),
  },
  {
    group: "queries",
    name: "findTag",
    document: GQL.FindTagDocument,
    variables: (id) => ({ id: id("Tag", "tag-gamma") }),
  },
  {
    group: "queries",
    name: "findTags, searching",
    document: GQL.FindTagsForSelectDocument,
    variables: () => ({ filter: { q: "ta", per_page: -1, sort: "name", direction: "ASC" } }),
  },
  {
    group: "queries",
    name: "findPerformer",
    document: GQL.FindPerformerDocument,
    variables: (id) => ({ id: id("Performer", "performer-alice") }),
  },
  {
    group: "queries",
    name: "findStudio",
    document: GQL.FindStudioDocument,
    variables: (id) => ({ id: id("Studio", "studio-prism") }),
  },
  {
    group: "queries",
    name: "findSavedFilter",
    document: GQL.FindSavedFilterDocument,
    variables: (id) => ({ id: id("SavedFilter", "2") }),
  },
  {
    group: "queries",
    name: "findSavedFilters, of one mode",
    document: GQL.FindSavedFiltersDocument,
    variables: () => ({ mode: "SCENE_MARKERS" }),
  },
  {
    group: "queries",
    name: "sceneStreams",
    document: GQL.SceneStreamsDocument,
    variables: (id) => ({ id: id("Scene", "scene-1") }),
  },
  {
    group: "queries",
    name: "sceneStreams, on its own",
    document: gql(`query($id: ID) { sceneStreams(id: $id) { url mime_type label } }`),
    variables: (id) => ({ id: id("Scene", "scene-2") }),
  },
  {
    group: "queries",
    name: "markerStrings, by title",
    document: GQL.MarkerStringsDocument,
    variables: () => ({ q: "o", sort: "title" }),
    // Each result's id is just a key Stash makes up for it
    project: (data) => data.markerStrings.map(({ title, count }: { title: string, count: number }) => ({ title, count })),
  },
  {
    group: "queries",
    name: "sceneMarkerTags",
    document: gql(`query($scene_id: ID!) { sceneMarkerTags(scene_id: $scene_id) { tag { id name } scene_markers { id title seconds } } }`),
    variables: (id) => ({ scene_id: id("Scene", "scene-1") }),
  },
  {
    group: "queries",
    name: "plugins",
    document: GQL.PluginsDocument,
  },
  {
    group: "queries",
    name: "version",
    document: GQL.VersionDocument,
    // When it was built is the image's
    project: (data) => ({ version: data.version.version, hash: data.version.hash }),
  },
  {
    group: "queries",
    name: "systemStatus",
    document: GQL.SystemStatusDocument,
    // The rest describes the machine Stash runs on
    project: (data) => ({ status: data.systemStatus.status }),
  },
  {
    group: "queries",
    name: "directory",
    document: GQL.DirectoryDocument,
    variables: () => ({ path: "/media" }),
  },
  {
    group: "queries",
    name: "jobQueue, with nothing running",
    document: GQL.JobQueueDocument,
  },

  // ---------------------------------------------------------------------------------------------------------------
  {
    group: "scene edits",
    name: "sceneUpdate",
    document: GQL.SceneUpdateDocument,
    variables: (id) => ({
      input: {
        id: id("Scene", "scene-3"),
        rating100: 60,
        organized: true,
        title: "Cascade Calmer",
        tag_ids: [id("Tag", "tag-beta"), id("Tag", "tag-delta")],
        performer_ids: [],
        studio_id: id("Studio", "studio-prism"),
      },
    }),
  },
  {
    group: "scene edits",
    name: "the scene, as the app then reads it",
    ...readScene("scene-3"),
    after: [updateScene("scene-3", {
      rating100: null, organized: false, title: "Cascade Calm", studio_id: null, performer_ids: [],
    }), {
      document: GQL.SceneUpdateDocument,
      variables: (id) => ({ input: { id: id("Scene", "scene-3"), tag_ids: [id("Tag", "tag-gamma")], performer_ids: [id("Performer", "performer-carol")] } }),
    }],
  },

  // ---------------------------------------------------------------------------------------------------------------
  {
    group: "o-count and plays",
    name: "sceneAddO, at given times",
    document: GQL.SceneAddODocument,
    variables: (id) => ({ id: id("Scene", "scene-1"), times: ["2024-04-01T09:00:00Z"] }),
  },
  {
    group: "o-count and plays",
    name: "sceneDeleteO, at a given time",
    document: GQL.SceneDeleteODocument,
    variables: (id) => ({ id: id("Scene", "scene-1"), times: ["2024-04-01T09:00:00Z"] }),
  },
  {
    group: "o-count and plays",
    name: "sceneIncrementO",
    document: gql(`mutation($id: ID!) { sceneIncrementO(id: $id) }`),
    variables: (id) => ({ id: id("Scene", "scene-1") }),
  },
  {
    group: "o-count and plays",
    name: "sceneDecrementO",
    document: gql(`mutation($id: ID!) { sceneDecrementO(id: $id) }`),
    variables: (id) => ({ id: id("Scene", "scene-1") }),
  },
  {
    group: "o-count and plays",
    name: "sceneResetO",
    document: GQL.SceneResetODocument,
    variables: (id) => ({ id: id("Scene", "scene-1") }),
    after: restoreOHistory,
  },
  {
    group: "o-count and plays",
    name: "the o-history, as the app then reads it",
    ...readScene("scene-1"),
  },
  {
    group: "o-count and plays",
    name: "sceneSaveActivity",
    document: GQL.SceneSaveActivityDocument,
    variables: (id) => ({ id: id("Scene", "scene-4"), resume_time: 4.5, playDuration: 2 }),
  },
  {
    group: "o-count and plays",
    name: "sceneAddPlay, at a given time",
    document: GQL.SceneAddPlayDocument,
    variables: (id) => ({ id: id("Scene", "scene-4"), times: ["2024-05-01T12:00:00Z"] }),
  },
  {
    group: "o-count and plays",
    name: "sceneIncrementPlayCount",
    document: gql(`mutation($id: ID!) { sceneIncrementPlayCount(id: $id) }`),
    variables: (id) => ({ id: id("Scene", "scene-4") }),
  },
  {
    group: "o-count and plays",
    name: "the resume time and plays, as the app then reads them",
    ...readScene("scene-4"),
    // When it was played is the time the case ran
    project: (data) => ({
      ...data.findScene,
      last_played_at: data.findScene.last_played_at !== null,
      play_history: data.findScene.play_history.length,
    }),
    after: [
      { document: GQL.SceneSaveActivityDocument, variables: (id) => ({ id: id("Scene", "scene-4"), resume_time: 0 }) },
    ],
  },
  {
    group: "o-count and plays",
    name: "sceneResetPlayCount",
    document: gql(`mutation($id: ID!) { sceneResetPlayCount(id: $id) }`),
    variables: (id) => ({ id: id("Scene", "scene-4") }),
  },

  // ---------------------------------------------------------------------------------------------------------------
  {
    group: "markers and tags",
    name: "sceneMarkerCreate",
    document: GQL.SceneMarkerCreateDocument,
    variables: (id) => ({
      title: "Conformance", seconds: 5, end_seconds: 6, scene_id: id("Scene", "scene-4"),
      primary_tag_id: id("Tag", "tag-delta"), tag_ids: [id("Tag", "tag-alpha")],
    }),
    creates: (data) => [{ type: "SceneMarker", alias: "created-marker", id: data.sceneMarkerCreate.id }],
  },
  {
    group: "markers and tags",
    name: "sceneMarkerUpdate",
    document: GQL.SceneMarkerUpdateDocument,
    variables: (id) => ({
      id: id("SceneMarker", "created-marker"), title: "Conformance, updated", seconds: 3, end_seconds: null,
      scene_id: id("Scene", "scene-4"), primary_tag_id: id("Tag", "tag-epsilon"), tag_ids: [],
    }),
  },
  {
    group: "markers and tags",
    name: "sceneMarkerDestroy",
    document: GQL.SceneMarkerDestroyDocument,
    variables: (id) => ({ id: id("SceneMarker", "created-marker") }),
  },
  {
    group: "markers and tags",
    name: "sceneMarkerCreate, without an end or tags",
    document: GQL.SceneMarkerCreateDocument,
    variables: (id) => ({ title: "Conformance 2", seconds: 1, scene_id: id("Scene", "scene-5"), primary_tag_id: id("Tag", "tag-beta") }),
    creates: (data) => [{ type: "SceneMarker", alias: "created-marker-2", id: data.sceneMarkerCreate.id }],
  },
  {
    group: "markers and tags",
    name: "sceneMarkersDestroy",
    document: GQL.SceneMarkersDestroyDocument,
    variables: (id) => ({ ids: [id("SceneMarker", "created-marker-2")] }),
  },
  {
    group: "markers and tags",
    name: "tagCreate",
    document: GQL.TagCreateDocument,
    variables: () => ({ input: { name: "Conformance", aliases: ["Conformity"] } }),
    creates: (data) => [{ type: "Tag", alias: "created-tag", id: data.tagCreate.id }],
  },
  {
    group: "markers and tags",
    name: "tagUpdate",
    document: GQL.TagUpdateDocument,
    variables: (id) => ({ input: { id: id("Tag", "created-tag"), name: "Conformance, updated", parent_ids: [id("Tag", "tag-alpha")] } }),
  },
  {
    group: "markers and tags",
    name: "the parent tag, as the app then reads it",
    document: GQL.FindTagDocument,
    variables: (id) => ({ id: id("Tag", "tag-alpha") }),
  },
  {
    group: "markers and tags",
    name: "tagDestroy",
    document: GQL.TagDestroyDocument,
    variables: (id) => ({ id: id("Tag", "created-tag") }),
  },

  // ---------------------------------------------------------------------------------------------------------------
  {
    group: "config and saved filters",
    name: "configurePlugin",
    document: GQL.ConfigurePluginDocument,
    variables: () => ({ plugin_id: "conformance", input: { flag: true, nested: { a: 1 } } }),
  },
  {
    group: "config and saved filters",
    name: "configureUI, in part",
    document: GQL.ConfigureUiDocument,
    variables: () => ({ partial: { conformance: { a: 1 } } }),
  },
  {
    group: "config and saved filters",
    name: "the plugin and UI config, as the app then reads it",
    document: GQL.ConfigurationDocument,
    project: (data) => ({ ui: data.configuration.ui, plugins: data.configuration.plugins }),
    after: [
      { document: GQL.ConfigurePluginDocument, variables: () => ({ plugin_id: "conformance", input: {} }) },
    ],
  },
  {
    group: "config and saved filters",
    name: "configureInterface",
    document: GQL.ConfigureInterfaceDocument,
    variables: () => ({ input: { menuItems: ["scenes", "markers", "tv"] } }),
    project: (data) => data.configureInterface.menuItems,
  },
  {
    group: "config and saved filters",
    name: "saveFilter",
    document: GQL.SaveFilterDocument,
    variables: (id) => ({
      input: {
        mode: "SCENES", name: "Conformance", find_filter: { q: "", sort: "date", direction: "DESC" },
        object_filter: { tags: { value: { items: [{ id: id("Tag", "tag-beta"), label: "Beta" }], excluded: [], depth: -1 }, modifier: "INCLUDES" } },
        ui_options: null,
      },
    }),
    creates: (data) => [{ type: "SavedFilter", alias: "created-filter", id: data.saveFilter.id }],
  },
  {
    group: "config and saved filters",
    name: "destroySavedFilter",
    document: GQL.DestroySavedFilterDocument,
    variables: (id) => ({ input: { id: id("SavedFilter", "created-filter") } }),
  },

  // ---------------------------------------------------------------------------------------------------------------
  // A job's timing can't match, so these compare what's sent rather than when
  {
    group: "jobs",
    name: "scanCompleteSubscribe, during a scan",
    kind: "subscription",
    document: GQL.ScanCompleteSubscribeDocument,
    trigger: [{ document: GQL.MetadataScanDocument, variables: () => ({ input: {} }) }],
    waitMs: 5_000,
    project: (events) => events.length > 0,
  },
  {
    group: "jobs",
    name: "metadataScan",
    document: GQL.MetadataScanDocument,
    variables: () => ({ input: {} }),
    // Its job's id
    project: (data) => typeof data.metadataScan,
  },
  {
    group: "jobs",
    name: "jobsSubscribe, during a scan",
    kind: "subscription",
    document: GQL.JobsSubscribeDocument,
    trigger: [{ document: GQL.MetadataScanDocument, variables: () => ({ input: {} }) }],
    waitMs: 5_000,
    project: (events) => events.some((event: { data?: { jobsSubscribe?: { type?: string } } }) => event.data?.jobsSubscribe?.type === "ADD"),
  },
  {
    group: "jobs",
    name: "loggingSubscribe",
    kind: "subscription",
    document: GQL.LoggingSubscribeDocument,
    trigger: [{ document: GQL.ReloadPluginsDocument }],
    waitMs: 1_000,
    // Whether it subscribes: what Stash logs is its own
    project: (events) => events.filter((event: { errors?: unknown }) => event.errors).length,
  },
  {
    group: "jobs",
    name: "stopJob",
    document: GQL.StopJobDocument,
    variables: () => ({ job_id: "1" }),
  },
  {
    group: "jobs",
    name: "stopAllJobs",
    document: GQL.StopAllJobsDocument,
  },
  {
    group: "jobs",
    name: "reloadPlugins",
    document: GQL.ReloadPluginsDocument,
  },
  {
    group: "jobs",
    name: "reloadScrapers",
    document: GQL.ReloadScrapersDocument,
  },

  // ---------------------------------------------------------------------------------------------------------------
  // Last: a deleted scene can't be put back as it was
  {
    group: "deleting scenes",
    name: "sceneDestroy",
    document: GQL.SceneDestroyDocument,
    variables: (id) => ({ id: id("Scene", "scene-8") }),
  },
  {
    group: "deleting scenes",
    name: "scenesDestroy, with their markers",
    document: GQL.ScenesDestroyDocument,
    variables: (id) => ({ ids: [id("Scene", "scene-7"), id("Scene", "scene-3")] }),
  },
  {
    group: "deleting scenes",
    name: "the scenes and markers left",
    document: GQL.FindSceneMarkersForTvDocument,
    variables: () => ({ filter: { ...ALL, sort: "scene_id" } }),
  },
];
