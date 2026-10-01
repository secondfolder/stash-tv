import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ApolloCache, gql } from "@apollo/client";

export type MarkerForTv = GQL.FindSceneMarkersForTvQuery["findSceneMarkers"]["scene_markers"][number]

export type MediaItem = {
  id: string;
} & (
  {
    entityType: "scene";
    entity: GQL.SceneDataFragment;
  } |
  {
    entityType: "marker";
    entity: MarkerForTv & {
      duration: number;
    }
  }
)

/**
 * A feed entry: which entity to show, not its data. The data is read from the Apollo cache where it's needed (see
 * useLiveMediaItem), so there's only ever one copy of it to keep up to date.
 */
export type MediaItemRef = {
  id: string;
  entityType: MediaItem["entityType"];
  /** The entity's normalized Apollo cache ID (e.g. "Scene:12") */
  cacheId: string;
}

export const defaultMarkerLength = 20;

// Same selection as a marker in FindSceneMarkersForTv, so a marker read back from the cache is a complete MarkerForTv
const MarkerForTvFragmentDoc = gql`
  fragment MarkerForTv on SceneMarker {
    ...SceneMarkerData
    scene {
      ...SceneData
    }
  }
  ${GQL.SceneMarkerDataFragmentDoc}
  ${GQL.SceneDataFragmentDoc}
`

/** The fragment that reads a whole media item's entity back from the cache. */
export function mediaItemFragment(entityType: MediaItem["entityType"]) {
  return entityType === "scene"
    ? { fragment: GQL.SceneDataFragmentDoc, fragmentName: "SceneData" }
    : { fragment: MarkerForTvFragmentDoc, fragmentName: "MarkerForTv" }
}

export function sceneMediaItem(scene: GQL.SceneDataFragment): MediaItem {
  return { id: `scene:${scene.id}`, entityType: "scene", entity: scene }
}

export function markerMediaItem(marker: MarkerForTv): MediaItem {
  return {
    id: `marker:${marker.id}`,
    entityType: "marker",
    entity: {
      ...marker,
      get duration() {
        const endTime = marker.end_seconds ?? Math.min(marker.seconds + defaultMarkerLength, marker.scene.files[0].duration);
        return endTime - marker.seconds;
      }
    }
  }
}

export function mediaItemFromEntity(
  entityType: MediaItem["entityType"],
  entity: GQL.SceneDataFragment | MarkerForTv,
): MediaItem {
  // The fragment read for each entity type (see mediaItemFragment) guarantees the matching shape
  return entityType === "scene"
    ? sceneMediaItem(entity as GQL.SceneDataFragment)
    : markerMediaItem(entity as MarkerForTv)
}

/** Read a feed entry's current data from the cache, or undefined if the entity is no longer (fully) cached. */
export function readMediaItem(cache: ApolloCache<unknown>, ref: MediaItemRef): MediaItem | undefined {
  const entity = cache.readFragment<GQL.SceneDataFragment | MarkerForTv>({
    id: ref.cacheId,
    ...mediaItemFragment(ref.entityType),
  })
  return entity ? mediaItemFromEntity(ref.entityType, entity) : undefined
}
