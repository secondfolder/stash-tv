import { getLogger } from "@logtape/logtape";
import type { VideoJsPlayer } from "video.js";

const logger = getLogger(["stash-tv", "picture-in-picture"]);

/**
 * False where the browser has no picture-in-picture support (e.g. Firefox Android, Android WebView) or a
 * permissions policy blocks it.
 */
export function isPictureInPictureSupported() {
  return typeof document !== "undefined" && document.pictureInPictureEnabled === true;
}

/**
 * Puts the player's video into picture-in-picture.
 *
 * Every player is created with `disablePictureInPicture` set (to hide Firefox's hover PiP toggle) which also blocks
 * requests to enter PiP, so it's cleared just before the request and restored once the video leaves PiP. It can't be
 * restored any earlier since setting it while the video is in PiP closes the PiP window.
 *
 * @see docs/video-player.md § "Picture-in-picture"
 */
export async function enterPictureInPicture(player: VideoJsPlayer) {
  const restoreDisablePictureInPicture = () => {
    if (!player.isDisposed()) player.disablePictureInPicture(true);
  };
  player.disablePictureInPicture(false);
  try {
    // Video.js returns undefined instead of a promise if PiP is unavailable despite what its types say
    const request = player.requestPictureInPicture() as ReturnType<VideoJsPlayer["requestPictureInPicture"]> | undefined;
    if (!request) {
      throw new Error("Picture-in-picture is not available for this player");
    }
    const pictureInPictureWindow = await request;
    player.one("leavepictureinpicture", restoreDisablePictureInPicture);
    return pictureInPictureWindow;
  } catch (error) {
    restoreDisablePictureInPicture();
    throw error;
  }
}

/**
 * Browsers refuse PiP for a video with no metadata yet, e.g. one that has never played or whose loading was canceled
 * by the pause-loading plugin. If the first attempt fails for a video that isn't playing, this plays it, waits for its
 * metadata, then tries once more.
 *
 * Must be started from a user gesture handler. The retry relies on the gesture's transient activation still being
 * valid (a few seconds in most browsers) so it gives up if the metadata takes longer than that.
 */
async function enterPictureInPictureFromUserGesture(player: VideoJsPlayer) {
  try {
    return await enterPictureInPicture(player);
  } catch (error) {
    if (!player.paused() && player.readyState() > 0) throw error;
    logger.info("Couldn't enter picture-in-picture, playing the video then retrying: {errorMessage}", {
      errorMessage: String(error),
    });
  }
  await player.play();
  if (player.readyState() === 0) {
    await waitForPlayerEvent(player, "loadedmetadata", metadataTimeoutMs);
  }
  return await enterPictureInPicture(player);
}

const metadataTimeoutMs = 5000;

function waitForPlayerEvent(player: VideoJsPlayer, event: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const onEvent = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      if (!player.isDisposed()) player.off(event, onEvent);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${event}`));
    }, timeoutMs);
    player.one(event, onEvent);
  });
}

export async function exitPictureInPicture() {
  if (!document.pictureInPictureElement) return;
  await document.exitPictureInPicture();
}

/**
 * Must be called directly from a user gesture handler (click, keypress) since nothing is in PiP when entering. Resolves
 * to false if it failed (the error is logged).
 */
export async function togglePictureInPicture(player: VideoJsPlayer | null | undefined) {
  try {
    if (document.pictureInPictureElement) {
      await exitPictureInPicture();
    } else if (player) {
      await enterPictureInPictureFromUserGesture(player);
    } else {
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Failed to toggle picture-in-picture: {errorMessage} {*}", { errorMessage: String(error), error });
    return false;
  }
}
