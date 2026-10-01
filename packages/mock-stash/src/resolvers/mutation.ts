import { addJob } from "../store";
import type { MockContext } from "../context";
import type { SceneRecord } from "../types";

function touch(scene: SceneRecord, now: string) {
  scene.updated_at = now;
}

export const mutationResolvers = {
  Mutation: {
    sceneUpdate: (
      _src: unknown,
      args: { input: Record<string, unknown> },
      ctx: MockContext,
    ) => {
      const { id } = args.input as { id: string };
      const scene = ctx.store.scenes.get(String(id));
      if (!scene) throw new Error(`scene not found: ${id}`);

      const input = args.input;
      // Fields the app writes. `null` clears a nullable value; `undefined` leaves it alone.
      if ("title" in input) scene.title = input.title as string | null;
      if ("details" in input) scene.details = input.details as string | null;
      if ("code" in input) scene.code = input.code as string | null;
      if ("director" in input) scene.director = input.director as string | null;
      if ("date" in input) scene.date = input.date as string | null;
      if ("rating100" in input) scene.rating100 = input.rating100 as number | null;
      if ("organized" in input && input.organized != null) {
        scene.organized = Boolean(input.organized);
      }
      if ("tag_ids" in input) scene.tag_ids = (input.tag_ids as string[]) ?? [];
      if ("performer_ids" in input) {
        scene.performer_ids = (input.performer_ids as string[]) ?? [];
      }
      if ("studio_id" in input) scene.studio_id = input.studio_id as string | null;
      if ("urls" in input) scene.urls = (input.urls as string[]) ?? [];

      touch(scene, ctx.store.now());
      return scene;
    },

    sceneIncrementO: (_src: unknown, args: { id: string }, ctx: MockContext) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      scene.o_history = [...scene.o_history, ctx.store.now()];
      touch(scene, ctx.store.now());
      return scene.o_history.length;
    },

    sceneDecrementO: (_src: unknown, args: { id: string }, ctx: MockContext) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      if (scene.o_history.length > 0) scene.o_history = scene.o_history.slice(0, -1);
      touch(scene, ctx.store.now());
      return scene.o_history.length;
    },

    sceneAddO: (
      _src: unknown,
      args: { id: string; times?: string[] | null },
      ctx: MockContext,
    ) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      const times = args.times?.length ? args.times : [ctx.store.now()];
      scene.o_history = [...scene.o_history, ...times];
      touch(scene, ctx.store.now());
      return { count: scene.o_history.length, history: scene.o_history };
    },

    sceneDeleteO: (
      _src: unknown,
      args: { id: string; times?: string[] | null },
      ctx: MockContext,
    ) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      if (args.times?.length) {
        for (const time of args.times) {
          const index = scene.o_history.lastIndexOf(time);
          if (index >= 0) scene.o_history.splice(index, 1);
        }
      } else if (scene.o_history.length > 0) {
        scene.o_history = scene.o_history.slice(0, -1);
      }
      touch(scene, ctx.store.now());
      return { count: scene.o_history.length, history: scene.o_history };
    },

    sceneResetO: (_src: unknown, args: { id: string }, ctx: MockContext) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      scene.o_history = [];
      touch(scene, ctx.store.now());
      return 0;
    },

    sceneSaveActivity: (
      _src: unknown,
      args: { id: string; resume_time?: number | null; playDuration?: number | null },
      ctx: MockContext,
    ) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      if (args.resume_time != null) scene.resume_time = args.resume_time;
      if (args.playDuration != null) {
        scene.play_duration = (scene.play_duration ?? 0) + args.playDuration;
      }
      touch(scene, ctx.store.now());
      return true;
    },

    sceneIncrementPlayCount: (
      _src: unknown,
      args: { id: string },
      ctx: MockContext,
    ) => {
      const scene = ctx.store.scenes.get(args.id);
      if (!scene) throw new Error(`scene not found: ${args.id}`);
      scene.play_count = (scene.play_count ?? 0) + 1;
      scene.last_played_at = ctx.store.now();
      scene.play_history = [...scene.play_history, ctx.store.now()];
      touch(scene, ctx.store.now());
      return scene.play_count;
    },

    sceneMarkerCreate: (
      _src: unknown,
      args: { input: Record<string, unknown> },
      ctx: MockContext,
    ) => {
      const input = args.input as {
        title: string;
        seconds: number;
        end_seconds?: number | null;
        scene_id: string;
        primary_tag_id: string;
        tag_ids?: string[] | null;
      };
      const scene = ctx.store.scenes.get(String(input.scene_id));
      if (!scene) throw new Error(`scene not found: ${input.scene_id}`);
      const now = ctx.store.now();
      const marker = {
        id: ctx.store.nextMarkerId(),
        scene_id: String(input.scene_id),
        title: input.title,
        seconds: input.seconds,
        end_seconds: input.end_seconds ?? null,
        primary_tag_id: String(input.primary_tag_id),
        tag_ids: input.tag_ids ?? [],
        created_at: now,
        updated_at: now,
      };
      ctx.store.markers.set(marker.id, marker);
      touch(scene, now);
      return marker;
    },

    sceneMarkerUpdate: (
      _src: unknown,
      args: { input: Record<string, unknown> },
      ctx: MockContext,
    ) => {
      const input = args.input as {
        id: string;
        title?: string | null;
        seconds?: number | null;
        end_seconds?: number | null;
        scene_id?: string | null;
        primary_tag_id?: string | null;
        tag_ids?: string[] | null;
      };
      const marker = ctx.store.markers.get(String(input.id));
      if (!marker) throw new Error(`marker not found: ${input.id}`);
      if (input.title != null) marker.title = input.title;
      if (input.seconds != null) marker.seconds = input.seconds;
      if ("end_seconds" in input) marker.end_seconds = input.end_seconds ?? null;
      if (input.scene_id != null) marker.scene_id = String(input.scene_id);
      if (input.primary_tag_id != null) marker.primary_tag_id = String(input.primary_tag_id);
      if ("tag_ids" in input) marker.tag_ids = input.tag_ids ?? [];
      marker.updated_at = ctx.store.now();
      return marker;
    },

    sceneMarkerDestroy: (
      _src: unknown,
      args: { id: string },
      ctx: MockContext,
    ) => {
      return ctx.store.markers.delete(args.id);
    },

    sceneMarkersDestroy: (
      _src: unknown,
      args: { ids: string[] },
      ctx: MockContext,
    ) => {
      for (const id of args.ids) ctx.store.markers.delete(id);
      return true;
    },

    tagCreate: (_src: unknown, args: { input: { name: string; aliases?: string[] | null } }, ctx: MockContext) => {
      const now = ctx.store.now();
      const tag = {
        id: ctx.store.nextTagId(),
        name: args.input.name,
        aliases: args.input.aliases ?? [],
        parent_ids: [],
        child_ids: [],
        created_at: now,
        updated_at: now,
      };
      ctx.store.tags.set(tag.id, tag);
      return tag;
    },

    // Like Stash, also removes the tag from everything tagged with it, and deletes markers using it as their primary tag
    tagDestroy: (_src: unknown, args: { input: { id: string } }, ctx: MockContext) => {
      const id = String(args.input.id);
      if (!ctx.store.tags.delete(id)) return false;
      for (const scene of ctx.store.scenes.values()) scene.tag_ids = scene.tag_ids.filter((tagId) => tagId !== id);
      for (const [markerId, marker] of ctx.store.markers) {
        if (marker.primary_tag_id === id) ctx.store.markers.delete(markerId);
        else marker.tag_ids = marker.tag_ids.filter((tagId) => tagId !== id);
      }
      for (const tag of ctx.store.tags.values()) {
        tag.parent_ids = tag.parent_ids.filter((tagId) => tagId !== id);
        tag.child_ids = tag.child_ids.filter((tagId) => tagId !== id);
      }
      return true;
    },

    sceneDestroy: (_src: unknown, args: { input: { id: string } }, ctx: MockContext) => {
      deleteScene(ctx, args.input.id);
      return true;
    },

    scenesDestroy: (
      _src: unknown,
      args: { input: { ids: string[] } },
      ctx: MockContext,
    ) => {
      for (const id of args.input.ids) deleteScene(ctx, id);
      return true;
    },

    configurePlugin: (
      _src: unknown,
      args: { plugin_id: string; input: Record<string, unknown> },
      ctx: MockContext,
    ) => {
      ctx.store.pluginConfig[args.plugin_id] = structuredClone(args.input);
      return ctx.store.pluginConfig[args.plugin_id];
    },

    configureUI: (
      _src: unknown,
      args: { input?: Record<string, unknown> | null; partial?: Record<string, unknown> | null },
      ctx: MockContext,
    ) => {
      if (args.input != null) {
        ctx.store.uiConfig = structuredClone(args.input);
      } else if (args.partial != null) {
        ctx.store.uiConfig = deepMerge(ctx.store.uiConfig, args.partial);
      }
      return ctx.store.uiConfig;
    },

    configureInterface: (
      _src: unknown,
      args: { input: Record<string, unknown> },
      ctx: MockContext,
    ) => {
      // The mock serves a static interface config; record the last write for assertions.
      ctx.store.lastInterfaceConfig = structuredClone(args.input);
      return ctx.store.lastInterfaceConfig;
    },

    saveFilter: (
      _src: unknown,
      args: { input: Record<string, unknown> },
      ctx: MockContext,
    ) => {
      const input = args.input as {
        id?: string | null;
        mode: string;
        name: string;
        find_filter?: Record<string, unknown> | null;
        object_filter?: Record<string, unknown> | null;
        ui_options?: Record<string, unknown> | null;
      };
      const existing = input.id ? ctx.store.savedFilters.get(String(input.id)) : undefined;
      if (existing) {
        existing.name = input.name;
        existing.mode = input.mode as typeof existing.mode;
        existing.find_filter = (input.find_filter as typeof existing.find_filter) ?? null;
        existing.object_filter = input.object_filter ?? null;
        existing.ui_options = input.ui_options ?? null;
        return existing;
      }
      const record = {
        id: ctx.store.nextFilterId(),
        mode: input.mode as "SCENES" | "SCENE_MARKERS",
        name: input.name,
        find_filter: (input.find_filter as never) ?? null,
        object_filter: input.object_filter ?? null,
        ui_options: input.ui_options ?? null,
      };
      ctx.store.savedFilters.set(record.id, record);
      return record;
    },

    destroySavedFilter: (
      _src: unknown,
      args: { input: { id: string } },
      ctx: MockContext,
    ) => {
      return ctx.store.savedFilters.delete(args.input.id);
    },

    metadataScan: (_src: unknown, _args: unknown, ctx: MockContext) => {
      const job = addJob(ctx.store, "Scan");
      // A real scan takes time and ends by emitting scanComplete; the mock completes
      // immediately (deterministic) and still notifies subscribers.
      ctx.store.scanComplete.emit();
      return job.id;
    },

    stopAllJobs: () => true,
    stopJob: () => true,
    reloadPlugins: () => true,
    reloadScrapers: () => true,
  },
};

function deleteScene(ctx: MockContext, id: string) {
  ctx.store.scenes.delete(id);
  for (const [markerId, marker] of [...ctx.store.markers.entries()]) {
    if (marker.scene_id === id) ctx.store.markers.delete(markerId);
  }
}

function deepMerge<T>(target: T, patch: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] != null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
