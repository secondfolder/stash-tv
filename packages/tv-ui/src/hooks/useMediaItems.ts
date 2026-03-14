import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useMediaItemFilters } from './useMediaItemFilters';
import { useContext, useEffect, useMemo, useState } from "react";
import { getMediaItemIdForVideoJsPlayer } from "../helpers";
import { useTvConfig } from "../store/tvConfig";
import hashObject from 'object-hash';
import { getLogger } from "@logtape/logtape";
import { getFunctionFromString } from "../helpers/getFunctionFromString";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";

export type MediaItem = {
  id: string;
} & (
  {
    entityType: "scene";
    entity: GQL.SceneDataFragment;
  } |
  {
    entityType: "marker";
    entity: GQL.FindSceneMarkersForTvQuery["findSceneMarkers"]["scene_markers"][number] & {
      duration: number;
    }
  }
)

declare global {
  interface Window {
    mediaItems?: MediaItem[],
    modifiedMediaItems?: MediaItem[],
  }
}

export const defaultMarkerLength = 20;

export function useMediaItems() {
  const logger = getLogger(["stash-tv", "useMediaItems"]);
  const { lastLoadedCurrentMediaItemFilter } = useMediaItemFilters()
  const {
    maxMedia,
    scenePreviewOnly,
    markerPreviewOnly,
    pageSize: mediaItemsPerPage,
    showDevOptions,
    mediaItemsModifierFunction
  } = useTvConfig()
  const { configuration: stashConfig } = useContext(ConfigurationContext)
  const previewOnly = (lastLoadedCurrentMediaItemFilter?.entityType === "scene" && scenePreviewOnly)
    || (lastLoadedCurrentMediaItemFilter?.entityType === "marker" && markerPreviewOnly)

  const hydratedMediaItemsModifierFunction = getFunctionFromString(mediaItemsModifierFunction)

  const [ neverLoaded, setNeverLoaded ] = useState(true)

  let response
  let mediaItems: MediaItem[]
  if (!lastLoadedCurrentMediaItemFilter || lastLoadedCurrentMediaItemFilter.entityType === "scene") {
    const scenesResponse = GQL.useFindFullScenesQuery({
      variables: {
        filter: {
          ...lastLoadedCurrentMediaItemFilter?.generalFilter,
          // We manage pagination ourselves and so override whatever the saved filter had
          page: 1,
          per_page: mediaItemsPerPage,
        },
        scene_filter: lastLoadedCurrentMediaItemFilter?.entityFilter
      },
      skip: !lastLoadedCurrentMediaItemFilter,
    })
    mediaItems = useMemo(
      () => scenesResponse.data?.findScenes.scenes.map(scene => ({
        id: `scene:${scene.id}`,
        entityType: "scene" as const,
        entity: scene,
      })) || [],
      [scenesResponse.data?.findScenes.scenes]
    )
    response = scenesResponse

  } else if (lastLoadedCurrentMediaItemFilter.entityType === "marker") {
    const markersResponse = GQL.useFindSceneMarkersForTvQuery({
      variables: {
        filter: {
          ...lastLoadedCurrentMediaItemFilter.generalFilter,
          // We manage pagination ourselves and so override whatever the saved filter had
          page: 1,
          per_page: mediaItemsPerPage,
        },
        scene_marker_filter: lastLoadedCurrentMediaItemFilter.entityFilter
      },
    })

    mediaItems = useMemo(
      () => markersResponse.data?.findSceneMarkers.scene_markers
        .filter(marker => {
          if (marker.seconds > marker.scene.files[0].duration) {
            logger.warn(`Marker with ID ${marker.id} has start time (${marker.seconds}s) greater than scene duration (${marker.scene.files[0].duration}s). This marker will be skipped.`, {marker})
            return false
          }
          return true
        })
        .map(marker => ({
          id: `marker:${marker.id}`,
          entityType: "marker" as const,
          entity: {
            ...marker,
            get duration() {
              const endTime = marker.end_seconds ?? Math.min(marker.seconds + defaultMarkerLength, marker.scene.files[0].duration);
              return endTime - marker.seconds;
            }
          }
        }))
        || [],
      [markersResponse.data?.findSceneMarkers.scene_markers]
    )
    response = markersResponse
  } else {
    logger.debug("lastLoadedCurrentMediaItemFilter:", lastLoadedCurrentMediaItemFilter)
    throw new Error("Unsupported media item filter entity type")
  }
  useEffect(() => {
    logger.debug(`lastLoadedCurrentMediaItemFilter changed to "${lastLoadedCurrentMediaItemFilter?.savedFilter?.name}", resetting media items`)
  }, [lastLoadedCurrentMediaItemFilter])


  useEffect(() => {
    if (showDevOptions) {
      window.mediaItems = [...mediaItems]
    } else {
      delete window.mediaItems
    }
  }, [mediaItems])

  if (showDevOptions && typeof hydratedMediaItemsModifierFunction === "function") {
    try {
      const modifiedMediaItems = hydratedMediaItemsModifierFunction(mediaItems)
      if (Array.isArray(modifiedMediaItems)) {
        mediaItems = modifiedMediaItems
      }
    } catch(error) {
      logger.error(`Media items modifier function threw an error`, {error})
    }
  }

  useEffect(() => {
    if (showDevOptions) {
      window.modifiedMediaItems = [...mediaItems]
    } else {
      delete window.modifiedMediaItems
    }
  }, [mediaItems])

  const {
    fetchMore,
    error: mediaItemsError,
    loading: mediaItemsLoading,
  } = response

  useEffect(() => {
    mediaItems.length && setNeverLoaded(false)
  }, [mediaItems.length])

  // Stash doesn't provide the lengths of preview videos so we track that ourselves by saving the video's duration as
  // soon as its metadata loads
  const [previewLengths, setPreviewLengths] = useState<{[sceneId: string]: number}>({})
  useEffect(() => {
    if (!previewOnly) return;
    const saveDurationOnceMetadataLoaded = (event: Event) => {
      if (!(event?.target instanceof HTMLVideoElement)) return;
      const videoElm = event.target
      try {
        const mediaItemId = getMediaItemIdForVideoJsPlayer(videoElm);
        logger.debug("Saving preview length for media item {*}", {mediaItemId, duration: videoElm.duration})
        setPreviewLengths(
          prev => ({
            ...prev,
            [mediaItemId]: videoElm.duration
          })
        )
      } catch (error) {
        console.warn("Failed to get media item ID for video element", error)
      }
    }
    window.addEventListener('loadedmetadata', saveDurationOnceMetadataLoaded, {capture: true});
    return () => {
      window.removeEventListener('loadedmetadata', saveDurationOnceMetadataLoaded, {capture: true});
    }
  }, [previewOnly])

  // Modifying the ScenePlayer to handle playing only a scene's preview would be a lot of work and
  // would involve a lot of complexity to maintain since it would break many existing assumptions.
  // Instead we take the sightly hacky but much simpler approach of modifying the scene data itself
  // so that ScenePlayer thinks it's just a normal scene but the only available stream is the preview.
  function makeMediaItemPreviewOnly(mediaItem: MediaItem): MediaItem {
    let previewUrl
    if (mediaItem.entityType === "scene") {
      previewUrl = mediaItem.entity.paths.preview
    } else if (mediaItem.entityType === "marker") {
      previewUrl = mediaItem.entity.stream
    } else {
      mediaItem satisfies never
      throw new Error("Unsupported media item entity type")
    }
    if (!previewUrl) {
      console.warn(`Media item ${mediaItem.id} has no preview`)
      return mediaItem
    }
    const scene = 'scene' in mediaItem.entity ? mediaItem.entity.scene : mediaItem.entity
    let estimatedDuration: number
    if (mediaItem.entityType === "marker") {
      estimatedDuration = Math.min(defaultMarkerLength, scene.files[0].duration)
    } else {
      const segmentDuration = stashConfig?.general.previewSegmentDuration ?? 0.75
      const segmentCount = stashConfig?.general.previewSegments ?? 12
      estimatedDuration = Math.min((segmentDuration * segmentCount), scene.files[0].duration)
    }
    mediaItem.id in previewLengths && logger.debug("Duration cached for media item {*}", {mediaItemId: mediaItem.id, duration: previewLengths[mediaItem.id]})
    const duration = mediaItem.id in previewLengths
      ? previewLengths[mediaItem.id]
      // Estimate the video duration if we don't know it yet
      : estimatedDuration
    const updatedScene = {
      ...scene,
      sceneStreams: [
        {
          "url": previewUrl,
          "mime_type": "video/mp4",
          "label": "Direct stream",
          "__typename": "SceneStreamEndpoint" as const
        }
      ],
      files: [
        {
          ...scene.files[0],
          duration,
        },
        ...scene.files.slice(1)
      ],
      resume_time: null,
      captions: null,
      scene_markers: [],
    }

    if (mediaItem.entityType === "scene") {
      return {
        ...mediaItem,
        entity: updatedScene
      }
    } else if (mediaItem.entityType === "marker") {
      return {
        ...mediaItem,
        entity: {
          ...mediaItem.entity,
          scene: updatedScene
        }
      }
    } else {
      mediaItem satisfies never
      return mediaItem
    }
  }


  mediaItems = useMemo(
    () => {
      let modifiedMediaItems = mediaItems
      if (typeof maxMedia === "number") {
        modifiedMediaItems = modifiedMediaItems.slice(0, maxMedia)
      }
      if (previewOnly) {
        modifiedMediaItems = modifiedMediaItems.map(makeMediaItemPreviewOnly)
      }
      return modifiedMediaItems
    },
    [mediaItems, previewOnly, maxMedia, hashObject(previewLengths)]
  )

  return {
    mediaItems,
    loadMoreMediaItems: () => {
      const nextPage = mediaItems.length ? Math.ceil(mediaItems.length / mediaItemsPerPage) + 1 : 1
      logger.debug("Fetch next media page: {*}", {nextPage})
      let entityFilterKey: string
      if (lastLoadedCurrentMediaItemFilter?.entityType === "scene") {
        entityFilterKey = "scene_filter"
      } else if (lastLoadedCurrentMediaItemFilter?.entityType === "marker") {
        entityFilterKey = "scene_marker_filter"
      } else {
        throw new Error("Unsupported media filter entity type")
      }
      fetchMore({
        variables: {
          filter: {
            ...lastLoadedCurrentMediaItemFilter?.generalFilter,
            // We manage pagination ourselves and so override whatever the saved filter had
            page: nextPage,
            per_page: mediaItemsPerPage,
          },
          [entityFilterKey]: lastLoadedCurrentMediaItemFilter?.entityFilter
        }
      })
    },
    mediaItemsError,
    mediaItemsLoading,
    mediaItemsNeverLoaded: neverLoaded,
    waitingForMediaItemsFilter: !lastLoadedCurrentMediaItemFilter,
  }
}
