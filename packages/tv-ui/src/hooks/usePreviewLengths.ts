import { useEffect } from "react";
import { create } from "zustand";
import { getLogger } from "@logtape/logtape";
import { getMediaItemIdForVideoJsPlayer } from "../helpers";

const logger = getLogger(["stash-tv", "usePreviewLengths"]);

/**
 * Stash doesn't provide the lengths of preview videos, so we track them ourselves by saving each video's duration as
 * soon as its metadata loads. Keyed by media item ID.
 */
export const usePreviewLengths = create<Record<string, number>>(() => ({}))

/** Record preview video lengths while `enabled`. Safe to call from several components at once. */
export function useTrackPreviewLengths(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const saveDurationOnceMetadataLoaded = (event: Event) => {
      if (!(event?.target instanceof HTMLVideoElement)) return;
      const videoElm = event.target
      try {
        const mediaItemId = getMediaItemIdForVideoJsPlayer(videoElm);
        if (usePreviewLengths.getState()[mediaItemId] === videoElm.duration) return;
        logger.debug("Saving preview length for media item {*}", {mediaItemId, duration: videoElm.duration})
        usePreviewLengths.setState({ [mediaItemId]: videoElm.duration })
      } catch (error) {
        console.warn("Failed to get media item ID for video element", error)
      }
    }
    window.addEventListener('loadedmetadata', saveDurationOnceMetadataLoaded, {capture: true});
    return () => {
      window.removeEventListener('loadedmetadata', saveDurationOnceMetadataLoaded, {capture: true});
    }
  }, [enabled])
}
