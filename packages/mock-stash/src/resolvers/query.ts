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
    markerStrings: () => [],
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
