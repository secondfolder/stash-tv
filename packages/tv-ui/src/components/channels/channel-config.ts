import * as yup from "yup";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { generateConfigId } from "../../helpers/config-ids";

/**
 * A channel is an entry in the user's list of things the feed can show. It's made of one or more sources, each of
 * which supplies media. Channels and sources store references (e.g. a Stash saved filter's id), never copies of what
 * they point to, so things like a renamed filter are reflected immediately.
 *
 * @see docs/channels.md
 */

export type ChannelSourceEntityType = "scene" | "marker"

/** Fields every kind of source has */
type SharedSourceFields = {
  /** Randomise the order of this source's media (ignored if its filter is already sorted randomly) */
  randomise: boolean
}

/** A filter saved in Stash */
export type StashSavedFilterSource = SharedSourceFields & {
  type: "stash-saved-filter"
  savedFilterId: string
}

/** Every scene, or every marker, in Stash */
export type AllMediaSource = SharedSourceFields & {
  type: "all"
  entityType: ChannelSourceEntityType
}

export type ChannelSource = StashSavedFilterSource | AllMediaSource

export type ChannelConfig = {
  /** Stable generated id. Not derived from a source since the same filter can be in more than one channel. */
  id: string
  /** For now a channel has exactly one source. It's an array so channels can combine sources later. */
  sources: ChannelSource[]
}

export type StartupChannel = "last-viewed" | "first"

const sourceSchema = yup.object({
  type: yup.string().oneOf(["stash-saved-filter", "all"]).required(),
  randomise: yup.boolean().required(),
  savedFilterId: yup.string().when("type", {
    is: "stash-saved-filter",
    then: schema => schema.required("Choose a filter"),
    otherwise: schema => schema.strip(),
  }),
  entityType: yup.string().when("type", {
    is: "all",
    then: schema => schema.oneOf(["scene", "marker"]).required(),
    otherwise: schema => schema.strip(),
  }),
})

export const channelConfigSchema = yup.object({
  id: yup.string().required(),
  sources: yup.array().of(sourceSchema).min(1, "Choose a filter").max(1).required(),
})

export function createNewChannelConfig(): ChannelConfig {
  return {
    id: generateConfigId(),
    sources: [],
  }
}

export function entityTypeToFilterMode(entityType: ChannelSourceEntityType) {
  return entityType === "scene" ? GQL.FilterMode.Scenes : GQL.FilterMode.SceneMarkers
}

/**
 * A saved filter that matches everything of the given mode. The `filter` prop is deprecated in favour of find_filter
 * and object_filter so an empty string is safe.
 */
export function makeEmptySavedFilter(mode: GQL.FilterMode): GQL.SavedFilter {
  return {
    id: "",
    mode,
    name: "",
    filter: "",
  }
}

export function getAllMediaSourceName(entityType: ChannelSourceEntityType) {
  return entityType === "scene" ? "All scenes" : "All markers"
}

/** What a source points at, without its settings (like `randomise`) */
export type ChannelSourceTarget =
  | Omit<StashSavedFilterSource, keyof SharedSourceFields>
  | Omit<AllMediaSource, keyof SharedSourceFields>

/** A key that changes when a source would load different media, but not when only its settings (e.g. randomise) do */
export function getSourceTargetKey(source: ChannelSourceTarget | undefined) {
  if (!source) return "none"
  if (source.type === "stash-saved-filter") return `stash-saved-filter:${source.savedFilterId}`
  if (source.type === "all") return `all:${source.entityType}`
  source satisfies never
  return "unknown"
}

type AvailableSavedFilter = Pick<GQL.SavedFilterDataFragment, "id" | "name" | "find_filter"> & {
  entityType: ChannelSourceEntityType
}

/**
 * How to show a source. Saved filters are looked up live from Stash rather than stored so renames are reflected
 * immediately.
 */
export function getChannelSourceInfo(
  source: ChannelSourceTarget,
  availableSavedFilters: AvailableSavedFilter[],
  availableSavedFiltersLoading: boolean,
): { name: string, entityType?: ChannelSourceEntityType, missing: boolean, sortedRandomly: boolean } {
  if (source.type === "all") {
    return { name: getAllMediaSourceName(source.entityType), entityType: source.entityType, missing: false, sortedRandomly: false }
  }
  if (source.type === "stash-saved-filter") {
    const savedFilter = availableSavedFilters.find(filter => filter.id === source.savedFilterId)
    if (!savedFilter) {
      return availableSavedFiltersLoading
        ? { name: "Loading…", missing: false, sortedRandomly: false }
        : { name: "Missing filter", missing: true, sortedRandomly: false }
    }
    return {
      name: savedFilter.name,
      entityType: savedFilter.entityType,
      missing: false,
      sortedRandomly: !!savedFilter.find_filter?.sort?.startsWith("random_"),
    }
  }
  source satisfies never
  return { name: "Unknown source", missing: true, sortedRandomly: false }
}

// Shown before the names of filters to tell scene and marker filters apart
const savedFilterNamePrefixes: Record<ChannelSourceEntityType, string> = {
  scene: "Scenes: ",
  marker: "Markers: ",
}

/**
 * How to label a channel: its source's name, with a prefix saying the type of a saved filter (an "All …" source's name
 * already says it).
 */
export function getChannelName(
  channel: ChannelConfig,
  availableSavedFilters: AvailableSavedFilter[],
  availableSavedFiltersLoading: boolean,
) {
  // Channels have a single source for now
  const source = channel.sources[0]
  if (!source) return { prefix: "", name: "Empty channel", sourceInfo: undefined }
  const sourceInfo = getChannelSourceInfo(source, availableSavedFilters, availableSavedFiltersLoading)
  const prefix = source.type === "stash-saved-filter" && sourceInfo.entityType
    ? savedFilterNamePrefixes[sourceInfo.entityType]
    : ""
  return { prefix, name: sourceInfo.name, sourceInfo }
}
