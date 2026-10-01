import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import TextUtils from "stash-ui/dist/src/utils/text";

type SceneMarker = GQL.SceneDataFragment["scene_markers"][number];

/** How long after being added a marker counts as the one the user most likely wants to edit. */
export const RECENTLY_ADDED_MARKER_WINDOW_MS = 10 * 60 * 1000;

export function sortMarkersByStartTime<Marker extends Pick<SceneMarker, "seconds">>(markers: readonly Marker[]) {
  return markers.slice().sort((a, b) => a.seconds - b.seconds);
}

/** A short description of a marker that tells it apart from the scene's others, e.g. "1:05 Intro". */
export function markerLabel(marker: Pick<SceneMarker, "seconds" | "title" | "primary_tag">) {
  return `${TextUtils.secondsToTimestamp(marker.seconds)} ${marker.title || marker.primary_tag.name}`;
}

/**
 * The marker to offer for editing first: the most recently added one if it was added within the last 10 minutes
 * (the user is probably fixing it up), otherwise the one starting closest to the playhead.
 */
export function defaultMarkerToEdit<Marker extends Pick<SceneMarker, "seconds" | "created_at">>(
  markers: readonly Marker[],
  { playerPosition, now }: { playerPosition: number; now: number }
): Marker | undefined {
  let mostRecent: { marker: Marker; addedAt: number } | undefined;
  for (const marker of markers) {
    const addedAt = Date.parse(marker.created_at);
    if (Number.isNaN(addedAt) || now - addedAt > RECENTLY_ADDED_MARKER_WINDOW_MS) continue;
    if (!mostRecent || addedAt > mostRecent.addedAt) mostRecent = { marker, addedAt };
  }
  if (mostRecent) return mostRecent.marker;

  let closest: Marker | undefined;
  for (const marker of markers) {
    if (!closest || Math.abs(marker.seconds - playerPosition) < Math.abs(closest.seconds - playerPosition)) {
      closest = marker;
    }
  }
  return closest;
}
