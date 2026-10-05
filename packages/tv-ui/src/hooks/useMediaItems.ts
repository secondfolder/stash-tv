import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { SearchableMediaItemFilter, useMediaItemFilters } from './useMediaItemFilters';
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApolloClient, InMemoryCache, useApolloClient } from "@apollo/client";
import { create } from "zustand";
import hashObject from 'object-hash';
import { getLogger } from "@logtape/logtape";
import { useTvConfig } from "../store/tvConfig";
import { getFunctionFromString } from "../helpers/getFunctionFromString";
import { MediaItem, MediaItemRef, markerMediaItem, readMediaItem, sceneMediaItem } from "../helpers/mediaItem";
import { useTrackPreviewLengths } from "./usePreviewLengths";

export type { MediaItem, MediaItemRef } from "../helpers/mediaItem";
export { defaultMarkerLength } from "../helpers/mediaItem";

declare global {
  interface Window {
    mediaItems?: MediaItem[],
    modifiedMediaItems?: MediaItem[],
  }
}

const logger = getLogger(["stash-tv", "useMediaItems"]);

// The feed is an ordered list of references kept here rather than in the Apollo cache: Stash's mutations (including
// the activity saves its ScenePlayer makes while playing) evict every cached findScenes/findSceneMarkers result, which
// is right for Stash's own lists but would keep wiping a feed's loaded pages. Entity data is never copied in here --
// slides read it live from the cache with useLiveMediaItem().
// @see docs/media-loading.md § "Architecture"

/**
 * What the feed lists. `key` identifies it by content: each useMediaItems() caller gets its own (equal) filter object,
 * so comparing by identity would have them keep resetting each other's feed.
 */
type FeedSource = { key: string; filter: SearchableMediaItemFilter; pageSize: number }

/**
 * An item for the feed to start at, the next time it loads (e.g. the scene Stash was playing from a queue opened in
 * Stash TV). Its first fetch gets the first `withinFirst` items, where the item is expected to be, rather than just a
 * page, so it's loaded in one go. Then it's dropped, whether the item was found or not.
 *
 * @see docs/media-loading.md § "Starting at an item"
 */
export type FeedStart = { itemId: string; withinFirst: number }

type FeedState = {
  source: FeedSource | undefined;
  refs: MediaItemRef[];
  // Items the server returned that we left out (markers that can't be played). They still take up positions in the
  // server's list, so they count towards where the next page starts.
  skippedIds: Set<string>;
  // How many items the server says match, as of the last page fetched
  total: number | undefined;
  fetchInFlight: boolean;
  loading: boolean;
  error: Error | undefined;
  start: FeedStart | undefined;
}

const initialFeedState: FeedState = {
  source: undefined,
  refs: [],
  skippedIds: new Set(),
  total: undefined,
  fetchInFlight: false,
  loading: false,
  error: undefined,
  start: undefined,
}

// Module-level so the components calling useMediaItems() (FeedPage, SettingsTab, VideoScroller) share one feed
const useFeedStore = create<FeedState>(() => initialFeedState)

// Stash's mutations also garbage-collect the cache after evicting its lists, which would delete entities that only
// those lists referenced -- i.e. every loaded item past the first page. Retaining them keeps the feed's items cached.
function retain(client: ApolloClient<object>, cacheId: string) {
  if (client.cache instanceof InMemoryCache) client.cache.retain(cacheId)
}
function release(client: ApolloClient<object>, cacheId: string) {
  if (client.cache instanceof InMemoryCache) client.cache.release(cacheId)
}

function markerIsPlayable(marker: GQL.FindSceneMarkersForTvQuery["findSceneMarkers"]["scene_markers"][number]): boolean {
  if (marker.seconds > marker.scene.files[0].duration) {
    logger.warn(`Marker with ID ${marker.id} has start time (${marker.seconds}s) greater than scene duration (${marker.scene.files[0].duration}s). This marker will be skipped.`, {marker})
    return false
  }
  return true
}

async function fetchPage(client: ApolloClient<object>, filter: SearchableMediaItemFilter, page: number, perPage: number) {
  // We manage pagination ourselves and so override whatever the saved filter had
  const pageFilter = { ...filter.generalFilter, page, per_page: perPage }
  // Fetched once and never watched: there's no list query for Stash's evictions to trigger refetches of
  if (filter.entityType === "scene") {
    const { data } = await client.query<GQL.FindFullScenesQuery, GQL.FindFullScenesQueryVariables>({
      query: GQL.FindFullScenesDocument,
      variables: { filter: pageFilter, scene_filter: filter.entityFilter, ids: filter.ids },
      fetchPolicy: "network-only",
    })
    return { items: data.findScenes.scenes.map(sceneMediaItem), skippedIds: [], total: data.findScenes.count }
  }
  const { data } = await client.query<GQL.FindSceneMarkersForTvQuery, GQL.FindSceneMarkersForTvQueryVariables>({
    query: GQL.FindSceneMarkersForTvDocument,
    variables: { filter: pageFilter, scene_marker_filter: filter.entityFilter },
    fetchPolicy: "network-only",
  })
  const items: MediaItem[] = []
  const skippedIds: string[] = []
  for (const marker of data.findSceneMarkers.scene_markers) {
    if (markerIsPlayable(marker)) {
      items.push(markerMediaItem(marker))
    } else {
      skippedIds.push(`marker:${marker.id}`)
    }
  }
  return { items, skippedIds, total: data.findSceneMarkers.count }
}

function resetFeed(client: ApolloClient<object>, source: FeedSource) {
  for (const ref of useFeedStore.getState().refs) release(client, ref.cacheId)
  // The start is kept: it's set before the feed it's for loads
  useFeedStore.setState(state => ({ ...initialFeedState, skippedIds: new Set(), source, loading: true, start: state.start }))
}

/** Start the feed at the given item the next time it loads (see `FeedStart`) */
export function startFeedAt(start: FeedStart) {
  useFeedStore.setState({ start })
}

/** Forget the feed's start, once it's been moved to */
function clearFeedStart() {
  useFeedStore.setState({ start: undefined })
}

async function loadNextPage(client: ApolloClient<object>) {
  const { source, refs, skippedIds, total, fetchInFlight, start } = useFeedStore.getState()
  if (!source || fetchInFlight) return;
  // Loaded items are the start of the server's list (minus deleted ones, which the server no longer counts either), so
  // this is the position of the first item not loaded yet -- even after a delete shifted every later item back one.
  // When it isn't on a page boundary the page overlaps what's loaded, and the overlap is skipped below.
  const offset = refs.length + skippedIds.size
  if (total !== undefined && offset >= total) return;
  // The first fetch for a start gets every item up to where it's expected, in whole pages so later pages line up
  const startFetch = start !== undefined && offset === 0
  const perPage = startFetch ? Math.max(1, Math.ceil(start.withinFirst / source.pageSize)) * source.pageSize : source.pageSize
  const page = Math.floor(offset / perPage) + 1
  logger.debug("Fetch media page {*}", {page, perPage})
  useFeedStore.setState({ fetchInFlight: true })
  try {
    const result = await fetchPage(client, source.filter, page, perPage)
    const state = useFeedStore.getState()
    if (state.source !== source) return; // The filter changed while this was in flight
    const loadedIds = new Set([...state.refs.map(ref => ref.id), ...state.skippedIds])
    const newRefs: MediaItemRef[] = []
    for (const item of result.items) {
      const cacheId = client.cache.identify(item.entity)
      if (loadedIds.has(item.id) || !cacheId) continue;
      retain(client, cacheId)
      newRefs.push({ id: item.id, entityType: item.entityType, cacheId })
    }
    const refs = [...state.refs, ...newRefs]
    // A start that isn't where it was expected is dropped, so a later load doesn't jump there unexpectedly
    const startFound = !startFetch || refs.some(ref => ref.id === start.itemId)
    useFeedStore.setState({
      refs,
      ...(startFound ? {} : { start: undefined }),
      skippedIds: new Set([...state.skippedIds, ...result.skippedIds]),
      total: result.total,
      fetchInFlight: false,
      loading: false,
      error: undefined,
    })
  } catch (error) {
    if (useFeedStore.getState().source !== source) return;
    logger.error("Failed to fetch media page {*}", {page, error})
    useFeedStore.setState({
      fetchInFlight: false,
      loading: false,
      error: error instanceof Error ? error : new Error(String(error)),
    })
  }
}

function removeFromFeed(client: ApolloClient<object>, id: string) {
  const { refs } = useFeedStore.getState()
  const ref = refs.find(ref => ref.id === id)
  if (!ref) return;
  release(client, ref.cacheId)
  useFeedStore.setState({ refs: refs.filter(otherRef => otherRef !== ref) })
}

function readMediaItems(client: ApolloClient<object>, refs: MediaItemRef[]) {
  return refs.flatMap(ref => readMediaItem(client.cache, ref) ?? [])
}

export function useMediaItems() {
  const { lastLoadedCurrentMediaItemFilter } = useMediaItemFilters()
  const {
    maxMedia,
    scenePreviewOnly,
    markerPreviewOnly,
    pageSize,
    showDevOptions,
    mediaItemsModifierFunction
  } = useTvConfig()
  const client = useApolloClient()
  const refs = useFeedStore(state => state.refs)
  const loading = useFeedStore(state => state.loading)
  const error = useFeedStore(state => state.error)
  const start = useFeedStore(state => state.start)

  useEffect(() => {
    if (!lastLoadedCurrentMediaItemFilter) return;
    const { entityType, generalFilter, entityFilter } = lastLoadedCurrentMediaItemFilter
    const key = hashObject({ entityType, generalFilter, entityFilter, pageSize })
    // Every useMediaItems() instance runs this, but only the first to see a change resets the shared feed
    if (useFeedStore.getState().source?.key === key) return;
    logger.debug(`Filter changed to "${lastLoadedCurrentMediaItemFilter.savedFilter?.name}", resetting media items`)
    resetFeed(client, { key, filter: lastLoadedCurrentMediaItemFilter, pageSize })
    loadNextPage(client)
  }, [client, lastLoadedCurrentMediaItemFilter, pageSize])

  const loadMoreMediaItems = useCallback(() => loadNextPage(client), [client])
  const removeMediaItem = useCallback((id: string) => removeFromFeed(client, id), [client])

  const mediaItems = useMemo(() => {
    let modifiedRefs = refs
    const modifier = showDevOptions ? getFunctionFromString(mediaItemsModifierFunction) : null
    if (typeof modifier === "function") {
      // The modifier works on full items, read from the cache as they are now (it doesn't re-run on later updates)
      try {
        const modifiedItems: unknown = modifier(readMediaItems(client, refs))
        if (Array.isArray(modifiedItems)) {
          const refsById = new Map(refs.map(ref => [ref.id, ref]))
          modifiedRefs = modifiedItems.flatMap(item => refsById.get(item?.id) ?? [])
        }
      } catch(error) {
        logger.error(`Media items modifier function threw an error`, {error})
      }
    }
    if (typeof maxMedia === "number") {
      modifiedRefs = modifiedRefs.slice(0, maxMedia)
    }
    return modifiedRefs
  }, [client, refs, showDevOptions, mediaItemsModifierFunction, maxMedia])

  useEffect(() => {
    if (showDevOptions) {
      window.mediaItems = readMediaItems(client, refs)
      window.modifiedMediaItems = readMediaItems(client, mediaItems)
    } else {
      delete window.mediaItems
      delete window.modifiedMediaItems
    }
  }, [client, showDevOptions, refs, mediaItems])

  // Where the feed should move to, once its start is loaded
  const startIndex = start ? mediaItems.findIndex(ref => ref.id === start.itemId) : -1

  const [ neverLoaded, setNeverLoaded ] = useState(true)
  useEffect(() => {
    mediaItems.length && setNeverLoaded(false)
  }, [mediaItems.length])

  useTrackPreviewLengths(
    (lastLoadedCurrentMediaItemFilter?.entityType === "scene" && scenePreviewOnly)
    || (lastLoadedCurrentMediaItemFilter?.entityType === "marker" && markerPreviewOnly)
  )

  return {
    mediaItems,
    removeMediaItem,
    loadMoreMediaItems,
    mediaItemsError: error,
    mediaItemsLoading: loading,
    mediaItemsNeverLoaded: neverLoaded,
    waitingForMediaItemsFilter: !lastLoadedCurrentMediaItemFilter,
    /** The index of the item the feed should start at, once it's loaded (see `FeedStart`) */
    startIndex: startIndex >= 0 ? startIndex : undefined,
    clearFeedStart,
  }
}
