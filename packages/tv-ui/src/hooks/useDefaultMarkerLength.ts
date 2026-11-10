import { useConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { stashDefaultMarkerLength } from "../helpers/mediaItem";

/**
 * How long a marker without an end time lasts, in seconds: Stash's "Default marker preview duration" setting, which is
 * also how long Stash makes such a marker's preview.
 *
 * @see docs/media-loading.md § "Marker length"
 */
export function useDefaultMarkerLength(): number {
  const { configuration } = useConfigurationContext()
  // Releases of Stash that predate the setting leave it out, which makes it null (see docs/stash-compatibility.md)
  return configuration?.general.defaultMarkerPreviewDuration || stashDefaultMarkerLength
}
