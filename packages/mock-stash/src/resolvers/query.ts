import { buildConfiguration } from "../config";
import { filterMarkers, filterScenes, paginate, type FindFilter } from "../filtering";
import { sceneStreamEndpoints } from "./entities";
import type { MockContext } from "../context";

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
      args: { ids?: string[] | null; filter?: { q?: string | null; per_page?: number | null; page?: number | null } | null },
      ctx: MockContext,
    ) => {
      let tags = [...ctx.store.tags.values()];
      if (args.ids && args.ids.length > 0) {
        const wanted = new Set(args.ids.map(String));
        tags = tags.filter((t) => wanted.has(t.id));
      }
      const q = args.filter?.q?.trim().toLowerCase();
      if (q) {
        tags = tags.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.aliases.some((a) => a.toLowerCase().includes(q)),
        );
      }
      tags.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
      const perPage = args.filter?.per_page ?? 25;
      const page = args.filter?.page ?? 1;
      const paged = perPage === -1 ? tags : tags.slice((page - 1) * perPage, page * perPage);
      return { tags: paged, count: tags.length };
    },

    sceneStreams: (_src: unknown, args: { id?: string | null }, ctx: MockContext) => {
      const scene = args.id ? ctx.store.scenes.get(args.id) : null;
      return scene ? sceneStreamEndpoints(scene, ctx.baseUrl) : [];
    },

    sceneMarkerTags: () => [],
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
    plugins: () => [],
    jobQueue: (_src: unknown, _args: unknown, ctx: MockContext) => [
      ...ctx.store.jobs.values(),
    ],
    version: () => ({
      version: "v0.28.1",
      hash: "0000000000000000000000000000000000000000",
      build_time: "2024-01-01 00:00:00",
    }),
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
    directory: () => ({ path: "", parent: null, directories: [] }),
  },
};
