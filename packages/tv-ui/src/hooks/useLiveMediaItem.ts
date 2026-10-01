import { useContext, useMemo, useRef } from "react";
import { useFragment } from "@apollo/client";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { MarkerForTv, MediaItem, MediaItemRef, mediaItemFragment, mediaItemFromEntity } from "../helpers/mediaItem";
import { makeMediaItemPreviewOnly } from "../helpers/makeMediaItemPreviewOnly";
import { useTvConfig } from "../store/tvConfig";
import { usePreviewLengths } from "./usePreviewLengths";

/**
 * The current data for a feed entry, read live from the Apollo cache. Re-renders only when this entity's data changes
 * (e.g. a rating, tags or play position), and keeps returning the same object otherwise.
 *
 * Returns undefined only if the entity was never fully in the cache. If it later goes missing (e.g. it was deleted and
 * the slide is about to be removed) the last complete data is returned instead, so the slide doesn't blank out.
 *
 * @see docs/media-loading.md § "Live item data"
 */
export function useLiveMediaItem(ref: MediaItemRef): MediaItem | undefined {
  const { data, complete } = useFragment<GQL.SceneDataFragment | MarkerForTv>({
    ...mediaItemFragment(ref.entityType),
    from: ref.cacheId,
  })

  const liveMediaItem = useMemo(
    () => complete ? mediaItemFromEntity(ref.entityType, data) : undefined,
    [complete, data, ref.entityType]
  )
  const lastCompleteMediaItem = useRef(liveMediaItem)
  if (liveMediaItem) lastCompleteMediaItem.current = liveMediaItem
  const mediaItem = liveMediaItem ?? lastCompleteMediaItem.current

  const { scenePreviewOnly, markerPreviewOnly } = useTvConfig()
  const previewOnly = ref.entityType === "scene" ? scenePreviewOnly : markerPreviewOnly
  const previewLength = usePreviewLengths(previewLengths => previewLengths[ref.id])
  const { configuration: stashConfig } = useContext(ConfigurationContext)
  const previewSegmentDuration = stashConfig?.general.previewSegmentDuration ?? undefined
  const previewSegments = stashConfig?.general.previewSegments ?? undefined

  return useMemo(
    () => mediaItem && previewOnly
      ? makeMediaItemPreviewOnly(mediaItem, {previewLength, previewSegmentDuration, previewSegments})
      : mediaItem,
    [mediaItem, previewOnly, previewLength, previewSegmentDuration, previewSegments]
  )
}
