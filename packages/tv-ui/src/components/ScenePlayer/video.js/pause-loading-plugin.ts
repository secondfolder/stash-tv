import { getLogger } from "@logtape/logtape";
import videojs, { VideoJsPlayer } from "video.js";
import { addVideoJsHook, useVideoJsMiddleware } from "./global-additions";
import UAParser from "ua-parser-js";
import testVideo from '../../../assets/1x1_10bit.webm?url';

// How long we're willing to wait for the hidden probe video below to produce a frame before giving up. This is a
// belt-and-braces backstop, not the primary defence - see the comment on `testFor10BitSupport()` for why the probe
// clip is VP9 rather than HEVC. Without this bound, a probe that never produces a frame would wedge
// `supports10BitVideos` forever, which in turn wedges every future call to `unloadAfterPaused()` below (since they
// all await it) - meaning paused videos would never actually get their sources cleared.
const tenBitSupportTestTimeoutMs = 3000

let supports10BitVideos: Promise<boolean> | undefined = undefined

const logger = getLogger(["stash-tv", "pause-loading-plugin"])

declare module "video.js" {
  interface VideoJsPlayer {
    cancelLoading: () => void;
    enableLoading: () => void;
    loadingCanceled: () => boolean
  }
}

class PauseLoadingPlugin extends videojs.getPlugin("plugin") {
  constructor(player: VideoJsPlayer) {
    super(player);

    let unloadedSource: string | null = null;
    let unloadedPoster: string | null = null;
    let pausedStateOnUnload = player.paused()
    // Loading is canceled straight away but the source is only unloaded once the video has paused and its current frame
    // is showing as the poster, so there's a moment between the two
    let _loadingCanceled = false
    let sourceUnloaded = false
    player.loadingCanceled = () => _loadingCanceled
    // Stops showing the video's frame as its poster, once the video plays again
    let hideFramePoster: (() => void) | null = null

    async function getVideoFrameBlob(video: HTMLVideoElement) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Failed to get canvas")
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
    }

    async function setPosterToCurrentFrame() {
      if (player.isDisposed()) return
      const videoElm = player.tech(true).el()
      if (!(videoElm instanceof HTMLVideoElement)) {
        logger.error(`Unexpected element {*}`, {videoElm})
        return
      }
      if(videoElm.readyState < 2) {
        return
      }
      const posterElement = player.getChild("posterImage")?.el()

      const frame = await getVideoFrameBlob(videoElm)
      if (frame) {
        const frameUrl = URL.createObjectURL(frame)
        if (posterElement && posterElement instanceof HTMLElement) {
          posterElement.style.opacity = "0"
          posterElement.style.display = "block"
        }
        player.poster(frameUrl)
        // Wait a little bit to ensure poster has been rendered
        await new Promise(resolve => setTimeout(resolve, 200))
        const fadeToPosterTime = 0.5 // in seconds
        if (posterElement && posterElement instanceof HTMLElement) {
          posterElement.style.opacity = "1"
          posterElement.style.transition = `opacity ${fadeToPosterTime}s`
        }
        hideFramePoster = () => {
          hideFramePoster = null
          if (posterElement && posterElement instanceof HTMLElement) {
            posterElement.style.opacity = ""
            posterElement.style.display = ""
            posterElement.style.transition = ""

            setTimeout(() => {
              if (typeof unloadedPoster === "string") {
                player.poster(unloadedPoster)
                unloadedPoster = null
              }
            }, 500)
          }
        }
        player.one("playing", () => hideFramePoster?.())
        // Wait till opacity transition is complete
        await new Promise(resolve => setTimeout(resolve, fadeToPosterTime * 1000))
      } else {
        logger.warn(`Failed to set video frame as poster`)
      }
    }

    player.cancelLoading = function() {
      if (_loadingCanceled) return
      _loadingCanceled = true
      const videoElm = player.tech(true).el()
      if (!(videoElm instanceof HTMLVideoElement)) {
        logger.error(`Unexpected element {*}`, {videoElm})
        return
      }
      unloadedSource = videoElm.src;
      unloadedPoster = player.poster();

      async function unloadAfterPaused() {
        if (player.isDisposed() || !_loadingCanceled) return
        if (await supports10BitVideos === undefined) {
          supports10BitVideos = testFor10BitSupport()
        }
        const showLastFrame = await supports10BitVideos
        if (showLastFrame) {
          await setPosterToCurrentFrame()
        }
        if (player.isDisposed()) return
        // Loading was enabled again while we waited (e.g. its slide was made current again straight away)
        if (!_loadingCanceled) {
          if (!player.paused()) hideFramePoster?.()
          return
        }
        const currentTime = videoElm.currentTime
        videoElm.src = ""; // clear sources to cancel requests
        videoElm.load()
        videoElm.currentTime = currentTime
        sourceUnloaded = true

        logger.debug('Loading canceled.');
      }

      pausedStateOnUnload = player.paused()
      if (!player.paused()) {
        videoElm.addEventListener('pause', unloadAfterPaused, {once: true})
        player.pause()
      } else {
        unloadAfterPaused()
      }
    };

    player.enableLoading = function() {
      if (!_loadingCanceled) return
      _loadingCanceled = false
      // Its source hasn't been unloaded yet, and now won't be
      if (!sourceUnloaded) return
      sourceUnloaded = false
      if (!unloadedSource) {
        throw Error("unloadedSource not set")
      }
      const videoElm = player.tech(true).el()
      if (!(videoElm instanceof HTMLVideoElement)) {
        logger.error(`Unexpected element {*}`, {videoElm})
        return
      }
      if (player.isDisposed()) return
      const currentTime = videoElm.currentTime
      videoElm.src = unloadedSource
      videoElm.load()

      // Using `player.currentTime(currentTime)` will delay setting the currentTime on the tech elm until the
      // player is marked as ready. But we want it set before then so that it loads the right section. That's
      // why we update the tech elm directly.
      videoElm.currentTime = currentTime
      unloadedSource = null

      if (!pausedStateOnUnload) {
        player.play()
      }

      unloadedSource = null;
      logger.debug('Video loading resumed, sources restored.');
    }
  };
};

videojs.registerPlugin('pauseLoading', PauseLoadingPlugin);

function pauseLoadingMiddleware(player: VideoJsPlayer) {
  // Also called while the source is waiting to be unloaded, which stops it being unloaded
  function enableLoadingIfCanceled() {
    if (player.loadingCanceled?.()) player.enableLoading()
  }

  return {
    setSource: function(srcObj: unknown, next: Function) {
      // pass null as the first argument to indicate that the source is not rejected
      next(null, srcObj);
    },
    callPlay: function() {
      enableLoadingIfCanceled()
    },
    setCurrentTime: function(time: number) {
      enableLoadingIfCanceled()
      return time;
    },
  }
}

useVideoJsMiddleware("pause-loading", "*", pauseLoadingMiddleware);

addVideoJsHook('pause-loading', 'beforeerror', (player: VideoJsPlayer, error: unknown) => {
  // Replacing the source with an empty string to force the browser to stop loading results in an error being
  // thrown since an empty string is not a valid source. Such an error isn't helpful and might make the user
  // think something is wrong so we suppress it.
  if (
    player.loadingCanceled?.()
    && typeof error === "object"
    && error !== null
    && 'code' in error
    && error.code === 4
  ) {
    return null
  }
  return error
});

function testFor10BitSupport() {
  // Firefox has a bug for drawImage() with 10-bit videos https://bugzilla.mozilla.org/show_bug.cgi?id=2021540
  //
  // The bug this works around is Firefox-specific, so we only pay the cost of actually decoding the test clip below
  // on Firefox. On other browsers we assume support without probing.
  //
  // The probe clip is deliberately encoded as VP9 (profile 2, 10-bit)
  // countering possible Firefox bug for decoding HEVC video - https://bugzilla.mozilla.org/show_bug.cgi?id=2064734
  if (!UAParser().browser.name?.includes("Firefox")) {
    return Promise.resolve(true)
  }

  return new Promise<boolean>((resolve) => {
    const video = document.createElement('video');
    let settled = false

    const settle = (result: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      video.removeEventListener('error', onError)
      // Clear the source so a stuck/still-decoding probe doesn't hang on to decoder resources indefinitely.
      video.src = ''
      video.load()
      resolve(result)
    }

    const onError = () => {
      logger.warn("10-bit support test video failed to load, assuming unsupported");
      settle(false)
    }

    // If the decoder never produces a frame (e.g. a flaky/broken hardware HEVC decode path) fall back to assuming
    // unsupported rather than hanging forever.
    const timeoutId = setTimeout(() => {
      logger.warn(`10-bit support test timed out after ${tenBitSupportTestTimeoutMs}ms, assuming unsupported`);
      settle(false)
    }, tenBitSupportTestTimeoutMs)

    video.addEventListener('error', onError)
    video.src = testVideo
    video.load()
    video.requestVideoFrameCallback(() => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        logger.warn("Failed to get canvas context for 10-bit support test, assuming unsupported");
        settle(false)
        return
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const centerX = Math.floor(canvas.width / 2);
      const centerY = Math.floor(canvas.height / 2);

      const pixelData = ctx.getImageData(centerX, centerY, 1, 1).data;
      const [r, g, b] = pixelData;
      settle(r > 200 && g < 50 && b < 50)
    })
  })
}
