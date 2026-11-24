import videojs, { VideoJsPlayer } from "video.js";

declare module "video.js" {
  interface VideoJsPlayer {
    /**
     * Whether the video is hidden, as it's loading and hasn't yet shown a frame from where it's meant to be. Missing on
     * players without the hideStaleFrames plugin.
     */
    videoHidden?: () => boolean;
  }
}

// Added to the player while its video is hidden
const hiddenClassName = "hide-stale-frame";

// How far a shown frame's time can be from the video's current time and still count as being from there. A frame
// shows from its start time, so the one shown for a time is up to a frame's length before it.
const frameTimeTolerance = 0.5; // in seconds

/**
 * Hides a player's video each time it starts loading, until it shows a frame from where it's meant to be, firing
 * `videoshown` when it does.
 *
 * Firefox (and Safari, at least for a plain <video>) shows a video's first frame once it has loaded, then seeks to where
 * it's meant to start (a marker's clip, a scene's start position, or where the pause-loading plugin's reload left off).
 * It does this however the start is set (even with a `#t=` media fragment), so it showed the start of the scene for a
 * moment. Hiding the video shows the player's black background instead.
 *
 * See docs/video-player.md § "Hiding the frames shown while loading"
 */
class HideStaleFramesPlugin extends videojs.getPlugin("plugin") {
  constructor(player: VideoJsPlayer) {
    super(player);

    let hidden = false;
    let frameCallbackId: number | undefined;
    player.videoHidden = () => hidden;

    const getVideoElm = () => {
      const videoElm = player.tech(true)?.el();
      return videoElm instanceof HTMLVideoElement ? videoElm : undefined;
    };

    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      frameCallbackId = undefined;
      const videoElm = getVideoElm();
      if (player.isDisposed() || !videoElm) return;
      // A seek still to happen already shows as the current time, so the frame shown before it doesn't match
      if (Math.abs(frame.mediaTime - videoElm.currentTime) > frameTimeTolerance) {
        frameCallbackId = videoElm.requestVideoFrameCallback(onFrame);
        return;
      }
      hidden = false;
      player.removeClass(hiddenClassName);
      player.trigger("videoshown");
    };

    player.on("loadstart", () => {
      const videoElm = getVideoElm();
      // Without the callback we couldn't tell when to show it again
      if (!videoElm || !("requestVideoFrameCallback" in videoElm)) return;
      hidden = true;
      player.addClass(hiddenClassName);
      frameCallbackId ??= videoElm.requestVideoFrameCallback(onFrame);
    });

    player.on("dispose", () => {
      if (frameCallbackId !== undefined) getVideoElm()?.cancelVideoFrameCallback(frameCallbackId);
    });
  }
}

videojs.registerPlugin("hideStaleFrames", HideStaleFramesPlugin);
