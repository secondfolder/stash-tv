import { expandStudioIds, expandTagIds, markerTagIds, type MockStore } from "./store";
import type { MarkerRecord, SceneRecord } from "./types";

/**
 * find_filter / object_filter semantics.
 *
 * This implements the subset of Stash's filtering behaviour that Stash TV exercises
 * (and a bit more for good measure). Anything unimplemented is ignored rather than
 * erroring — `test/conformance` exists to catch where that subset diverges from reality.
 */

interface FindFilter {
  q?: string | null;
  page?: number | null;
  per_page?: number | null;
  sort?: string | null;
  direction?: "ASC" | "DESC" | null;
}

export type { FindFilter };

interface IntCriterion {
  value: number[];
  modifier: string;
}

interface HierarchicalMultiCriterion {
  value: string[];
  modifier: string;
  depth?: number | null;
}

interface MultiCriterion {
  value: string[];
  modifier: string;
}

interface OrientationCriterion {
  value: string[];
}

interface SceneFilter {
  orientation?: OrientationCriterion | null;
  tags?: HierarchicalMultiCriterion | null;
  performers?: MultiCriterion | null;
  studios?: HierarchicalMultiCriterion | null;
  organized?: boolean | null;
  rating100?: IntCriterion | null;
  o_counter?: IntCriterion | null;
  play_count?: IntCriterion | null;
}

interface MarkerFilter {
  tags?: HierarchicalMultiCriterion | null;
  scene_tags?: HierarchicalMultiCriterion | null;
  performers?: MultiCriterion | null;
  scenes?: MultiCriterion | null;
}

function sceneSearchText(store: MockStore, scene: SceneRecord): string {
  const tags = scene.tag_ids.map((id) => store.tags.get(id)?.name).filter(Boolean);
  const performers = scene.performer_ids
    .map((id) => store.performers.get(id)?.name)
    .filter(Boolean);
  const studio = scene.studio_id ? store.studios.get(scene.studio_id)?.name ?? "" : "";
  return [
    scene.title ?? "",
    scene.code ?? "",
    scene.details ?? "",
    studio,
    ...tags,
    ...performers,
    ...scene.files.map((f) => f.path),
  ]
    .join("\n")
    .toLowerCase();
}

function matchesCriterion(
  value: number,
  criterion: IntCriterion,
): boolean {
  const [a, b] = criterion.value;
  switch (criterion.modifier) {
    case "EQUALS":
      return value === a;
    case "NOT_EQUALS":
      return value !== a;
    case "GREATER_THAN":
      return value > a;
    case "LESS_THAN":
      return value < a;
    case "BETWEEN":
      return value >= a && value <= (b ?? a);
    case "NOT_BETWEEN":
      return !(value >= a && value <= (b ?? a));
    default:
      return true;
  }
}

function matchesIdList(
  actual: string[],
  criterion: { value: string[]; modifier: string },
): boolean {
  switch (criterion.modifier) {
    case "INCLUDES":
      return actual.some((id) => criterion.value.includes(id));
    case "EXCLUDES":
      return !actual.some((id) => criterion.value.includes(id));
    case "INCLUDES_ALL":
      return criterion.value.every((id) => actual.includes(id));
    default:
      return true;
  }
}

function sceneOrientation(scene: SceneRecord): "LANDSCAPE" | "PORTRAIT" | "SQUARE" {
  const { width, height } = scene.files[0] ?? { width: 0, height: 0 };
  if (width > height) return "LANDSCAPE";
  if (height > width) return "PORTRAIT";
  return "SQUARE";
}

export function sceneMatchesFilter(
  store: MockStore,
  scene: SceneRecord,
  sceneFilter: SceneFilter | null | undefined,
): boolean {
  if (!sceneFilter) return true;

  if (sceneFilter.orientation && sceneFilter.orientation.value.length > 0) {
    if (!sceneFilter.orientation.value.includes(sceneOrientation(scene))) return false;
  }

  if (sceneFilter.organized != null && scene.organized !== sceneFilter.organized) {
    return false;
  }

  if (sceneFilter.tags) {
    const expanded = expandTagIds(store, sceneFilter.tags.value);
    if (
      !matchesIdList(scene.tag_ids, {
        value: [...expanded],
        modifier: sceneFilter.tags.modifier,
      })
    ) {
      return false;
    }
  }

  if (sceneFilter.performers) {
    if (!matchesIdList(scene.performer_ids, sceneFilter.performers)) return false;
  }

  if (sceneFilter.studios) {
    // With their sub-studios. A scene without a studio isn't from any of them.
    const expanded = expandStudioIds(store, sceneFilter.studios.value);
    if (!matchesIdList(scene.studio_id ? [scene.studio_id] : [], { value: [...expanded], modifier: sceneFilter.studios.modifier })) {
      return false;
    }
  }

  if (sceneFilter.rating100 && scene.rating100 != null) {
    if (!matchesCriterion(scene.rating100, sceneFilter.rating100)) return false;
  }
  if (sceneFilter.rating100 && scene.rating100 == null) {
    // rating criterion against an unrated scene only matches when explicitly excluded
    if (sceneFilter.rating100.modifier === "NOT_EQUALS") return true;
    return false;
  }

  if (sceneFilter.o_counter && !matchesCriterion(scene.o_history.length, sceneFilter.o_counter)) {
    return false;
  }
  if (sceneFilter.play_count && !matchesCriterion(scene.play_count ?? 0, sceneFilter.play_count)) {
    return false;
  }

  return true;
}

export function filterScenes(
  store: MockStore,
  args: {
    ids?: string[] | null;
    filter?: FindFilter | null;
    scene_filter?: SceneFilter | null;
  },
): SceneRecord[] {
  let scenes = [...store.scenes.values()];

  if (args.ids && args.ids.length > 0) {
    const wanted = new Set(args.ids.map(String));
    scenes = scenes.filter((s) => wanted.has(s.id));
  }

  const q = args.filter?.q?.trim().toLowerCase();
  if (q) {
    scenes = scenes.filter((s) => sceneSearchText(store, s).includes(q));
  }

  scenes = scenes.filter((s) => sceneMatchesFilter(store, s, args.scene_filter));
  return sortScenes(scenes, args.filter?.sort, args.filter?.direction);
}

export function paginate<T>(items: T[], filter: FindFilter | null | undefined): T[] {
  const perPage = filter?.per_page ?? 25;
  if (perPage === -1) return items;
  const page = filter?.page ?? 1;
  return items.slice((page - 1) * perPage, page * perPage);
}

function comparatorFor<T>(getValue: (item: T) => number | string | null) {
  return (a: T, b: T): number => {
    const av = getValue(a);
    const bv = getValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv, "en", { sensitivity: "base", numeric: true });
    }
    return (av as number) - (bv as number);
  };
}

export function sortScenes(
  scenes: SceneRecord[],
  sort: string | null | undefined,
  direction: "ASC" | "DESC" | null | undefined,
): SceneRecord[] {
  const result = [...scenes];

  const randomMatch = sort?.match(/^random_(\d+)$/);
  if (sort === "random" || randomMatch) {
    const seed = randomMatch ? Number(randomMatch[1]) : 0;
    return seededShuffle(result, seed);
  }

  let comparator: (a: SceneRecord, b: SceneRecord) => number;
  switch (sort) {
    case "title":
      comparator = comparatorFor((s) => s.title);
      break;
    case "path":
      comparator = comparatorFor((s) => s.files[0]?.path ?? null);
      break;
    case "random":
      comparator = () => 0;
      break;
    default:
    case "date":
      comparator = comparatorFor((s) => s.date ?? "");
      break;
    case "o_counter":
      comparator = comparatorFor((s) => s.o_history.length);
      break;
    case "play_count":
      comparator = comparatorFor((s) => s.play_count ?? 0);
      break;
    case "play_duration":
      comparator = comparatorFor((s) => s.play_duration ?? 0);
      break;
    case "resume_time":
      comparator = comparatorFor((s) => s.resume_time ?? 0);
      break;
    case "rating":
    case "rating100":
      comparator = comparatorFor((s) => s.rating100 ?? -1);
      break;
    case "filesize":
      comparator = comparatorFor((s) => s.files[0]?.size ?? 0);
      break;
    case "duration":
      comparator = comparatorFor((s) => s.files[0]?.duration ?? 0);
      break;
    case "file_mod_time":
    case "created_at":
      comparator = comparatorFor((s) => s.created_at);
      break;
    case "updated_at":
      comparator = comparatorFor((s) => s.updated_at);
      break;
  }

  result.sort(comparator);
  if (direction === "DESC") result.reverse();
  return result;
}

export function filterMarkers(
  store: MockStore,
  args: {
    ids?: string[] | null;
    filter?: FindFilter | null;
    scene_marker_filter?: MarkerFilter | null;
  },
): MarkerRecord[] {
  let markers = [...store.markers.values()];

  if (args.ids && args.ids.length > 0) {
    const wanted = new Set(args.ids.map(String));
    markers = markers.filter((m) => wanted.has(m.id));
  }

  const q = args.filter?.q?.trim().toLowerCase();
  if (q) {
    markers = markers.filter((m) => {
      const scene = store.scenes.get(m.scene_id);
      const sceneTitle = scene?.title ?? "";
      return [m.title, sceneTitle].join("\n").toLowerCase().includes(q);
    });
  }

  const markerFilter = args.scene_marker_filter;
  if (markerFilter) {
    if (markerFilter.tags) {
      const tagsCriterion = markerFilter.tags;
      const expanded = [...expandTagIds(store, tagsCriterion.value)];
      markers = markers.filter((m) =>
        matchesIdList(markerTagIds(m), {
          value: expanded,
          modifier: tagsCriterion.modifier,
        }),
      );
    }
    if (markerFilter.scene_tags) {
      const sceneTagsCriterion = markerFilter.scene_tags;
      const expanded = [...expandTagIds(store, sceneTagsCriterion.value)];
      markers = markers.filter((m) => {
        const scene = store.scenes.get(m.scene_id);
        return scene
          ? matchesIdList(scene.tag_ids, {
              value: expanded,
              modifier: sceneTagsCriterion.modifier,
            })
          : true;
      });
    }
    if (markerFilter.performers) {
      markers = markers.filter((m) => {
        const scene = store.scenes.get(m.scene_id);
        return scene
          ? matchesIdList(scene.performer_ids, markerFilter.performers!)
          : true;
      });
    }
    if (markerFilter.scenes) {
      markers = markers.filter((m) =>
        matchesIdList([m.scene_id], markerFilter.scenes!),
      );
    }
  }

  return sortMarkers(store, markers, args.filter?.sort, args.filter?.direction);
}

export function sortMarkers(
  store: MockStore,
  markers: MarkerRecord[],
  sort: string | null | undefined,
  direction: "ASC" | "DESC" | null | undefined,
): MarkerRecord[] {
  const result = [...markers];

  const randomMatch = sort?.match(/^random_(\d+)$/);
  if (sort === "random" || randomMatch) {
    const seed = randomMatch ? Number(randomMatch[1]) : 0;
    return seededShuffle(result, seed);
  }

  let comparator: (a: MarkerRecord, b: MarkerRecord) => number;
  switch (sort) {
    case "scenes_updated_at":
      comparator = (a, b) =>
        (store.scenes.get(a.scene_id)?.updated_at ?? "").localeCompare(
          store.scenes.get(b.scene_id)?.updated_at ?? "",
        );
      break;
    case "title":
    case "name":
      comparator = comparatorFor((m) => {
        if (sort === "title") return m.title;
        return store.tags.get(m.primary_tag_id)?.name ?? "";
      });
      break;
    case "date":
      comparator = comparatorFor((m) => store.scenes.get(m.scene_id)?.date ?? "");
      break;
    case "seconds":
      comparator = comparatorFor((m) => m.seconds);
      break;
    case "scene_id":
    default:
      comparator = (a, b) => {
        const sceneComparison = a.scene_id.localeCompare(b.scene_id, "en", { numeric: true });
        if (sceneComparison !== 0) return sceneComparison;
        return a.seconds - b.seconds;
      };
  }

  result.sort(comparator);
  if (direction === "DESC") result.reverse();
  return result;
}

/** Deterministic shuffle (mulberry32) so `random_N` sorts are stable across runs. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed || 1;
  const nextRandom = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
