import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import TextUtils from "stash-ui/dist/src/utils/text";

type SceneMarker = GQL.SceneDataFragment["scene_markers"][number];

export function sortMarkersByStartTime<Marker extends Pick<SceneMarker, "seconds">>(markers: readonly Marker[]) {
  return markers.slice().sort((a, b) => a.seconds - b.seconds);
}

/** A short description of a marker that tells it apart from the scene's others, e.g. "1:05 Intro". */
export function markerLabel(marker: Pick<SceneMarker, "seconds" | "title" | "primary_tag">) {
  return `${TextUtils.secondsToTimestamp(marker.seconds)} ${marker.title || marker.primary_tag.name}`;
}
