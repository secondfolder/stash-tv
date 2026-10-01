import { useEffect, useState } from "react";
import type { VideoJsPlayer } from "video.js";
import { getLogger } from "@logtape/logtape";
import { enterPictureInPicture, exitPictureInPicture } from "../helpers/picture-in-picture";

const logger = getLogger(["stash-tv", "picture-in-picture"]);

/** Whether any video is currently in picture-in-picture. The browser is the source of truth. */
export function usePictureInPictureActive() {
  const [active, setActive] = useState(() => typeof document !== "undefined" && !!document.pictureInPictureElement);
  useEffect(() => {
    const update = () => setActive(!!document.pictureInPictureElement);
    update();
    // Both events bubble from the video element but we use capture so nothing can stop them reaching us
    document.addEventListener("enterpictureinpicture", update, { capture: true });
    document.addEventListener("leavepictureinpicture", update, { capture: true });
    return () => {
      document.removeEventListener("enterpictureinpicture", update, { capture: true });
      document.removeEventListener("leavepictureinpicture", update, { capture: true });
    };
  }, []);
  return active;
}

/**
 * Keeps picture-in-picture on the current slide's video: when a slide becomes current while another video is in PiP,
 * PiP moves to this slide's player. While in PiP the current slide also provides next/previous Media Session handlers
 * so the feed can be navigated from the PiP window.
 *
 * Every rendered slide calls this but only the current one acts, so only one slide owns the (global) Media Session
 * handlers at a time.
 *
 * @see docs/video-player.md § "Picture-in-picture"
 */
export function useFollowPictureInPicture({ playerRef, isCurrentVideo, playerReady, goToItem }: {
  playerRef: React.RefObject<VideoJsPlayer | null>,
  isCurrentVideo: boolean,
  playerReady: boolean,
  goToItem: (direction: "next" | "previous") => void,
}) {
  useEffect(() => {
    const player = playerRef.current;
    if (!isCurrentVideo || !player || !document.pictureInPictureElement || player.isInPictureInPicture()) return;
    const moveToThisPlayer = () => {
      // Another video may have left PiP (e.g. the user closed it) while we were waiting
      if (!document.pictureInPictureElement || player.isDisposed()) return;
      // No user gesture is needed here since a video is already in PiP
      enterPictureInPicture(player).catch((error) => {
        // Rather than leave PiP showing the previous (now paused) video
        logger.warn("Failed to move picture-in-picture to the current video, closing it: {errorMessage} {*}", {
          errorMessage: String(error),
          error,
        });
        exitPictureInPicture().catch(() => {});
      });
    };
    // Browsers refuse PiP for a video with no metadata yet (readyState HAVE_NOTHING), which is common for a slide
    // that has only just become current. Until it loads the PiP window keeps showing the previous video.
    if (player.readyState() > 0) {
      moveToThisPlayer();
      return;
    }
    player.one("loadedmetadata", moveToThisPlayer);
    return () => {
      if (!player.isDisposed()) player.off("loadedmetadata", moveToThisPlayer);
    };
  }, [isCurrentVideo, playerReady]);

  const pictureInPictureActive = usePictureInPictureActive();
  useEffect(() => {
    if (!isCurrentVideo || !pictureInPictureActive || !("mediaSession" in navigator)) return;
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        // Browsers throw for actions they don't support
        logger.debug(`Media Session action ${action} not supported {*}`, { error });
      }
    };
    setHandler("nexttrack", () => goToItem("next"));
    setHandler("previoustrack", () => goToItem("previous"));
    return () => {
      setHandler("nexttrack", null);
      setHandler("previoustrack", null);
    };
  }, [isCurrentVideo, pictureInPictureActive, goToItem]);
}
