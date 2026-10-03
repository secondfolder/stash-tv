
import { useApolloClient, type ApolloClient, type NormalizedCacheObject } from "@apollo/client";
import { useContext, useEffect, useMemo, useState } from "react";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";
import { useTvConfig } from "../store/tvConfig";
import { useWindowSize } from "./useWindowSize";
import { create } from "zustand";
import { useConditionalMemo } from "./useMemoConditional";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { useFindSavedFilters } from "stash-ui/dist/src/core/StashService";
import {
  ChannelConfig,
  entityTypeToFilterMode,
  getSourceTargetKey,
  isTemporaryChannel,
  makeEmptySavedFilter,
  StartupChannel,
  TEMPORARY_CHANNEL_ID,
  TemporaryFilter,
  withTemporaryChannel,
} from "../components/channels/channel-config";

/** In Stash a filter has a different format when it's saved vs when it's used in a search. The stash codebase doesn't
 * seem to do a great job of naming these different formats to make that clear. When a filter is saved it usually just
 * referred to as a saved filter but when it's used in a search it's referred to as a by the type of entity being
 * searched, like a media item filter.
 *
 * To make this clearer we use "saved filter" to refer to a filter in its saved format (or "saved media item filter" for
 * specifically a media item filter) and "searchable filter" to refer to a filter in its searchable format (or "searchable
 * media item filter" for specifically a media item filter).
 *
 * The rest of the Stash TV codebase pretty much only deals with the searchable format so we just hide this distinction
 * and only present the searchable format outside of this file which we simply refer to as a "filter" (or "media item filter"
 * for specifically a media item filter).
 */

type SavedMediaItemFilter = GQL.SavedFilter

export type SearchableMediaItemFilter = {
  savedFilter?: SavedMediaItemFilter,
  generalFilter: GQL.FindFullScenesQueryVariables["filter"],
} & (
  {
    entityFilter: GQL.FindFullScenesQueryVariables["scene_filter"]
    entityType: "scene"
  } |
  {
    entityFilter: GQL.FindSceneMarkersForTvQueryVariables["scene_marker_filter"]
    entityType: "marker"
  }
)

type EntityType = SearchableMediaItemFilter["entityType"]

const useGlobalFilterState = create<{
  loadingResponsibilityClaimed: boolean,
  /** The channel the feed is showing. `undefined` until the startup channel has been chosen, `null` if there's none
   * (no channels have been set up) in which case Stash's default filter is shown. */
  activeChannelId: string | null | undefined,
  currentSavedFilter: SavedMediaItemFilter | undefined,
  loading: boolean,
  error: unknown,
  randomSeed?: number,
}>(() => ({
  loadingResponsibilityClaimed: false,
  activeChannelId: undefined,
  currentSavedFilter: undefined,
  loading: false,
  error: undefined,
  randomSeed: getRandomSeed(),
}))

/**
 * Pick the channel to show when Stash TV loads.
 *
 * @see docs/channels.md § "Startup channel"
 */
export function getStartupChannel(
  channels: ChannelConfig[],
  startupChannel: StartupChannel,
  lastViewedChannelId: string | undefined,
) {
  if (startupChannel === "last-viewed") {
    const lastViewed = channels.find(channel => channel.id === lastViewedChannelId)
    if (lastViewed) return lastViewed
  }
  return channels[0]
}

/** Switch the feed to the given channel */
export function setActiveChannel(channelId: string) {
  useGlobalFilterState.setState({ activeChannelId: channelId });
  // The temporary channel won't be there next time, so the last channel chosen before it is shown instead
  const { channels, set: setTvConfig } = useTvConfig.getState()
  const channel = channels.find(channel => channel.id === channelId)
  if (channel && !isTemporaryChannel(channel)) {
    setTvConfig("lastViewedChannelId", channelId)
  }
}

/** Switch the feed to a temporary channel showing the given filter, replacing the temporary channel if there's one */
export function showTemporaryFilter(filter: TemporaryFilter) {
  useTvConfig.getState().set("channels", channels => withTemporaryChannel(channels, filter))
  setActiveChannel(TEMPORARY_CHANNEL_ID)
}

export function useMediaItemFilters() {
  const {
    activeChannelId,
    currentSavedFilter,
    loading: mediaItemFiltersLoading,
    error: mediaItemFiltersError,
    randomSeed,
  } = useGlobalFilterState()
  const apolloClient = useApolloClient() as ApolloClient<NormalizedCacheObject>;

  const {
    configuration: {
      ui: {
        defaultFilters: {
          scenes: stashDefaultScenesFilter
        } = {}
      } = {}
    } = {},
    loading: stashConfigurationLoading
  } = useContext(ConfigurationContext)

  const {
    data: { findSavedFilters: availableSavedSceneFilters = []} = {},
    loading: loadingAvailableSavedSceneFilters,
  } = useFindSavedFilters(GQL.FilterMode.Scenes);

  const {
    data: { findSavedFilters: availableSavedMarkerFilters = []} = {},
    loading: loadingAvailableSavedMarkerFilters,
  } = useFindSavedFilters(GQL.FilterMode.SceneMarkers);

  const loadingDataRequiredBeforeLoadingCurrentFilter = stashConfigurationLoading || loadingAvailableSavedSceneFilters || loadingAvailableSavedMarkerFilters;

  const {
    onlyShowMatchingOrientation,
    channels,
    startupChannel,
    lastViewedChannelId,
  } = useTvConfig();
  const { orientation } = useWindowSize()

  const activeChannel = channels.find(channel => channel.id === activeChannelId)
  // Channels have a single source for now
  const activeSource = activeChannel?.sources[0]
  const activeSourceTargetKey = getSourceTargetKey(activeSource)
  const randomise = !!activeSource?.randomise

  let limitOrientation: "landscape" | "portrait" | undefined = undefined
  if (onlyShowMatchingOrientation && orientation !== "square") {
    limitOrientation = orientation
  }

  const currentSearchableFilter = useMemo(
    () => currentSavedFilter ? convertSavedToSearchableFilter(currentSavedFilter, { randomise }) : undefined,
    [currentSavedFilter, randomise, randomise && randomSeed, limitOrientation]
  )
  const lastLoadedCurrentMediaItemFilter = useConditionalMemo(
    () => currentSearchableFilter,
    [currentSearchableFilter],
    !loadingDataRequiredBeforeLoadingCurrentFilter && !mediaItemFiltersLoading
  )

  const [isResponsibleForLoading, setIsResponsibleForLoading] = useState(false);

  // Only one instance of this hook loads filters, the rest just read the shared state
  useEffect(() => {
    if (useGlobalFilterState.getState().loadingResponsibilityClaimed) return;
    useGlobalFilterState.setState({ loadingResponsibilityClaimed: true, loading: true });
    setIsResponsibleForLoading(true);
  }, [])

  // Choose the startup channel on initial load, and move to another channel if the active one is deleted
  useEffect(() => {
    if (!isResponsibleForLoading) return;
    if (activeChannelId === undefined) {
      useGlobalFilterState.setState({
        activeChannelId: getStartupChannel(channels, startupChannel, lastViewedChannelId)?.id ?? null
      })
    } else if (!activeChannel && (activeChannelId !== null || channels.length)) {
      useGlobalFilterState.setState({ activeChannelId: channels[0]?.id ?? null })
    }
  }, [isResponsibleForLoading, activeChannelId, activeChannel, channels])

  // Load the active channel's filter whenever what it points at changes
  useEffect(() => {
    if (!isResponsibleForLoading || loadingDataRequiredBeforeLoadingCurrentFilter) return;
    if (activeChannelId === undefined || (activeChannelId !== null && !activeChannel)) return;

    let cancelled = false
    useGlobalFilterState.setState({ loading: true, error: undefined });

    // Place most of the logic into a separate function so we can use async/await
    async function loadActiveSource(): Promise<SavedMediaItemFilter> {
      if (!activeSource) {
        // No channels so we use the default Stash filter, or if there's none an empty filter
        if (stashDefaultScenesFilter) {
          return {
            ...stashDefaultScenesFilter,
            filter: '', // The filter prop is deprecated in favour of find_filter and object_filter, and it's not
              // provided when getting a default saved filter so we can safely set an empty string here.
          }
        }
        return makeEmptySavedFilter(GQL.FilterMode.Scenes)
      }
      if (activeSource.type === "all") {
        return makeEmptySavedFilter(entityTypeToFilterMode(activeSource.entityType))
      }
      if (activeSource.type === "stash-saved-filter") {
        const id = activeSource.savedFilterId
        const {name, entityType} = availableSavedFilters.find(f => f.id === id) || {}
        if (name && entityType) {
          // Optimistically set the filter so change is immediately reflected in the UI
          useGlobalFilterState.setState({
            currentSavedFilter: {
              id,
              mode: entityTypeToFilterMode(entityType),
              name: name,
              filter: '', // See the comment above about the `filter` prop
            }
          });
        }
        const savedFilter = await fetchSavedFilterFromStash(apolloClient, id);
        if (!savedFilter) {
          throw new Error("The filter used by this channel no longer exists in Stash. Edit or delete the channel in settings.")
        }
        return {
          ...savedFilter,
          filter: '', // See the comment above about the `filter` prop
        }
      }
      if (activeSource.type === "temporary-filter") {
        return {
          ...activeSource.filter,
          id: "",
          filter: '', // See the comment above about the `filter` prop
        }
      }
      activeSource satisfies never
      throw new Error(`Unsupported channel source: ${JSON.stringify(activeSource)}`)
    }

    loadActiveSource()
      .then(savedFilter => {
        if (cancelled) return;
        useGlobalFilterState.setState({ randomSeed: getRandomSeed(), currentSavedFilter: savedFilter, loading: false });
      })
      .catch(error => {
        if (cancelled) return;
        useGlobalFilterState.setState({ error, currentSavedFilter: undefined, loading: false });
      })

    return () => { cancelled = true }
  }, [isResponsibleForLoading, loadingDataRequiredBeforeLoadingCurrentFilter, activeChannelId, activeSourceTargetKey, stashDefaultScenesFilter]);

  async function fetchSavedFilterFromStash(apolloClient: ApolloClient<NormalizedCacheObject>, filterId: string): Promise<GQL.SavedFilterDataFragment | null> {
    const { data } = await apolloClient.query<GQL.FindSavedFilterQuery, GQL.FindSavedFilterQueryVariables>({
      query: GQL.FindSavedFilterDocument,
      variables: { id: filterId },
    });

    return data?.findSavedFilter ?? null;
  }

  function convertSavedToSearchableFilter(
    savedFilter: SavedMediaItemFilter,
    { randomise }: { randomise: boolean },
  ): SearchableMediaItemFilter {
    function getGeneralFilter() {
      const filter = new ListFilterModel(savedFilter.mode)
      filter.configureFromSavedFilter(savedFilter);
      const updatedFilter = { ...filter.makeFindFilter() };

      if (updatedFilter.sort?.match(/^random_\d*$/) || randomise) {
        updatedFilter.sort = `random_${randomSeed}`
      }

      return updatedFilter;
    }

    function addSceneFiltersMods(sceneFilter: GQL.FindFullScenesQueryVariables["scene_filter"]) {
      if (limitOrientation) {
        sceneFilter = sceneFilter || {};
        sceneFilter.orientation = {
          "value": [
            limitOrientation.toUpperCase() as GQL.OrientationEnum,
            "SQUARE" as GQL.OrientationEnum
          ]
        };
      }
      return sceneFilter;
    }

    function getSceneFilter() {
      const filter = new ListFilterModel(savedFilter.mode)
      filter.configureFromSavedFilter(savedFilter);

      return addSceneFiltersMods(
        filter.makeFilter()
      )
    }

    function getMarkerFilter() {
      const filter = new ListFilterModel(savedFilter.mode)
      filter.configureFromSavedFilter(savedFilter);

      const markerFilter: GQL.FindSceneMarkersForTvQueryVariables["scene_marker_filter"] = filter.makeFilter();
      markerFilter.scene_filter = addSceneFiltersMods(markerFilter.scene_filter);

      return markerFilter;
    }

    const sharedProps = {
      savedFilter,
      generalFilter: getGeneralFilter(),
    }

    if (savedFilter.mode === GQL.FilterMode.Scenes) {
      return {
        ...sharedProps,
        entityFilter: getSceneFilter(),
        entityType: "scene",
      }
    } else if (savedFilter.mode === GQL.FilterMode.SceneMarkers) {
      return {
        ...sharedProps,
        entityFilter: getMarkerFilter(),
        entityType: "marker",
      }
    } else {
      throw new Error(`Unsupported saved filter mode: ${savedFilter.mode}`);
    }
  }

  const availableSavedFilters = useMemo(
    () => {
      const savedFilters = []
      const savedFiltersByType: [EntityType, GQL.SavedFilterDataFragment[]][] = [
        ["scene", availableSavedSceneFilters],
        ["marker", availableSavedMarkerFilters],
      ]
      for (const [entityType, savedFiltersOfType] of savedFiltersByType) {
        for (const savedFilter of savedFiltersOfType) {
          savedFilters.push({
            ...savedFilter,
            entityType
          })
        }
      }
      return savedFilters;
    },
    [availableSavedSceneFilters, availableSavedMarkerFilters]
  );

  return {
    mediaItemFiltersLoading: loadingDataRequiredBeforeLoadingCurrentFilter || mediaItemFiltersLoading,
    /** Whether the saved filters available in Stash are still loading */
    availableSavedFiltersLoading: loadingAvailableSavedSceneFilters || loadingAvailableSavedMarkerFilters,
    mediaItemFiltersError,
    currentMediaItemFilter: currentSearchableFilter,
    lastLoadedCurrentMediaItemFilter,
    activeChannel,
    setActiveChannel,
    showTemporaryFilter,
    availableSavedFilters
  }
}

function getRandomSeed() {
  return Math.round(Math.random() * 1000000)
};
