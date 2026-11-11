import { buildConfiguration } from "../config";
import { byName, filterMarkers, filterScenes, matchesSearch, paginate, type FindFilter } from "../filtering";
import { sceneStreamEndpoints } from "./entities";
import type { MockContext } from "../context";
import { stashVersionDetails } from "../stash-versions";

export const queryResolvers = {
  Query: {
    configuration: (_src: unknown, _args: unknown, ctx: MockContext) =>
      buildConfiguration(ctx.store),

    findSavedFilters: (
      _src: unknown,
      args: { mode?: string | null },
      ctx: MockContext,
    ) =>
      [...ctx.store.savedFilters.values()].filter(
        (f) => !args.mode || f.mode === args.mode,
      ),

    findSavedFilter: (_src: unknown, args: { id: string }, ctx: MockContext) =>
      ctx.store.savedFilters.get(args.id) ?? null,

    findScene: (_src: unknown, args: { id?: string | null }, ctx: MockContext) =>
      args.id ? ctx.store.scenes.get(args.id) ?? null : null,

    findScenes: (
      _src: unknown,
      args: { ids?: string[] | null; filter?: FindFilter | null; scene_filter?: Record<string, unknown> | null },
      ctx: MockContext,
    ) => {
      const allMatching = filterScenes(ctx.store, args);
      const totalDuration = allMatching.reduce(
        (sum, s) => sum + (s.files[0]?.duration ?? 0),
        0,
      );
      const totalFilesize = allMatching.reduce(
        (sum, s) => sum + (s.files[0]?.size ?? 0),
        0,
      );
      return {
        scenes: paginate(allMatching, args.filter),
        count: allMatching.length,
        duration: totalDuration,
        filesize: totalFilesize,
      };
    },

    findSceneMarkers: (
      _src: unknown,
      args: { ids?: string[] | null; filter?: FindFilter | null; scene_marker_filter?: Record<string, unknown> | null },
      ctx: MockContext,
    ) => {
      const allMatching = filterMarkers(ctx.store, args);
      return {
        scene_markers: paginate(allMatching, args.filter),
        count: allMatching.length,
      };
    },

    findTag: (_src: unknown, args: { id: string }, ctx: MockContext) =>
      ctx.store.tags.get(args.id) ?? null,

    findPerformer: (_src: unknown, args: { id: string }, ctx: MockContext) =>
      ctx.store.performers.get(args.id) ?? null,

    findStudio: (_src: unknown, args: { id?: string | null }, ctx: MockContext) =>
      args.id ? ctx.store.studios.get(args.id) ?? null : null,

    findTags: (
      _src: unknown,
      args: { ids?: string[] | null; filter?: FindFilter | null },
      ctx: MockContext,
    ) => {
      let tags = [...ctx.store.tags.values()];
      if (args.ids && args.ids.length > 0) {
        const wanted = new Set(args.ids.map(String));
        tags = tags.filter((t) => wanted.has(t.id));
      }
      tags = byName(tags.filter((t) => matchesSearch(args.filter?.q, [t.name, ...t.aliases])), args.filter?.direction);
      return { tags: paginate(tags, args.filter), count: tags.length };
    },

    // Searching by name or alias (`q`), sorted by name: what the app's search sends
    findPerformers: (_src: unknown, args: { filter?: FindFilter | null }, ctx: MockContext) => {
      const performers = byName(
        [...ctx.store.performers.values()].filter((p) => matchesSearch(args.filter?.q, [p.name, ...(p.aliases ?? [])])),
        args.filter?.direction,
      );
      return { performers: paginate(performers, args.filter), count: performers.length };
    },

    findStudios: (_src: unknown, args: { filter?: FindFilter | null }, ctx: MockContext) => {
      const studios = byName(
        [...ctx.store.studios.values()].filter((s) => matchesSearch(args.filter?.q, [s.name])),
        args.filter?.direction,
      );
      return { studios: paginate(studios, args.filter), count: studios.length };
    },

    sceneStreams: (_src: unknown, args: { id?: string | null }, ctx: MockContext) => {
      const scene = args.id ? ctx.store.scenes.get(args.id) : null;
      return scene ? sceneStreamEndpoints(scene, ctx.baseUrl) : [];
    },

    // As Stash's: the scene's markers grouped by primary tag, the tags in order of their first marker
    sceneMarkerTags: (_src: unknown, args: { scene_id: string }, ctx: MockContext) => {
      const markers = [...ctx.store.markers.values()]
        .filter((marker) => marker.scene_id === String(args.scene_id))
        .sort((a, b) => a.seconds - b.seconds);
      const groups = new Map<string, typeof markers>();
      for (const marker of markers) groups.set(marker.primary_tag_id, [...(groups.get(marker.primary_tag_id) ?? []), marker]);
      return [...groups].map(([tagId, scene_markers]) => ({ tag: ctx.store.tags.get(tagId), scene_markers }));
    },
    // Every marker title in use, with how many markers have it (as Stash's GetMarkerStrings: a case-insensitive
    // substring filter, grouped by title, ordered by title or by count)
    markerStrings: (_src: unknown, args: { q?: string | null; sort?: string | null }, ctx: MockContext) => {
      const query = args.q?.toLowerCase();
      const byTitle = new Map<string, { id: string; title: string; count: number }>();
      for (const marker of ctx.store.markers.values()) {
        if (query !== undefined && !marker.title.toLowerCase().includes(query)) continue;
        const entry = byTitle.get(marker.title);
        if (entry) entry.count++;
        else byTitle.set(marker.title, { id: marker.id, title: marker.title, count: 1 });
      }
      const results = [...byTitle.values()];
      return args.sort === "count"
        ? results.sort((a, b) => b.count - a.count)
        : results.sort((a, b) => a.title.localeCompare(b.title));
    },
    // As Stash's: null rather than an empty list, with none
    plugins: () => null,
    jobQueue: (_src: unknown, _args: unknown, ctx: MockContext) =>
      ctx.store.jobs.size > 0 ? [...ctx.store.jobs.values()] : null,
    // The version being served, as that Stash reports it
    version: (_src: unknown, _args: unknown, ctx: MockContext) => {
      const { version, commit } = stashVersionDetails(ctx.stashVersion);
      return { version, hash: commit.slice(0, 8), build_time: "2024-01-01 00:00:00" };
    },
    systemStatus: () => ({
      databaseSchema: null,
      databasePath: "",
      appSchema: 0,
      status: "OK",
      os: "linux",
      workingDir: "",
      homeDir: "",
      isDesktop: false,
    }),
    // The media directory, with nothing in it but files (as the real Stash the conformance tests compare with sees it)
    directory: (_src: unknown, args: { path?: string | null }) => {
      const path = args.path ?? "";
      const parent = path.replace(/\/[^/]*$/, "") || (path.startsWith("/") && path !== "/" ? "/" : null);
      return { path, parent, directories: [] };
    },
  },
};
